import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { Miniflare } from 'miniflare';
import { authConfig, requireSameOrigin, verifyIdentity } from '../worker/auth.ts';
import { savedUrl, parsePatch, parseSettings } from '../worker/validation.ts';
import { metadataUrl, publicAddress, assertPublicDns } from '../worker/metadata.ts';
import { jsonBody, readLimited } from '../worker/http.ts';
import type { Env } from '../worker/types.ts';

const config = { APP_ORIGIN: 'https://reading.example.com', ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com', ACCESS_AUD: 'test-audience', OWNER_EMAIL: 'owner@example.com' } as Env;
const session = { name: 'Owner', handle: 'owner', email: config.OWNER_EMAIL!, local: false };

test('Access verifies signatures and binds issuer, audience, expiry and owner', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); key.kid = 'test';
  const jwks = createLocalJWKSet({ keys: [key] });
  const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({ sub: 'test-owner', email: config.OWNER_EMAIL, iss: config.ACCESS_TEAM_DOMAIN, aud: config.ACCESS_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
  assert.equal((await verifyIdentity(await sign(), config, jwks)).email, config.OWNER_EMAIL);
  for (const overrides of [{ email: 'another@example.com' }, { aud: 'another-app' }, { iss: 'https://another.cloudflareaccess.com' }, { exp: 1 }, { sub: '' }]) await assert.rejects(verifyIdentity(await sign(overrides), config, jwks), /session/);
  const token = await sign();
  await assert.rejects(verifyIdentity(`${token.slice(0, -20)}xxxxxxxxxxxxxxxxxxxx`, config, jwks), /session/);
  assert.throws(() => authConfig({} as Env), /configured/);
  for (const origin of ['', 'http://reading.example.com', 'https://reading.example.com/', 'https://reading.example.com/path']) {
    assert.throws(() => authConfig({ ...config, APP_ORIGIN: origin }), /APP_ORIGIN/);
  }
});

test('production build ignores LOCAL_DEV and refuses unauthenticated requests', async t => {
  const mf = new Miniflare({ modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15', bindings: { ...config, LOCAL_DEV: 'true' } });
  t.after(() => mf.dispose());
  for (const path of ['/api/links', '/api/export', '/app', '/app/inbox', '/app/share?url=https%3A%2F%2Fexample.com', '/app/share/']) {
    const response = await mf.dispatchFetch(`https://reading.example.com${path}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  }
  const forged = await mf.dispatchFetch('https://reading.example.com/api/links', { headers: { 'Cf-Access-Authenticated-User-Email': config.OWNER_EMAIL! } });
  assert.equal(forged.status, 401);
});

test('mutations require the exact application Origin', () => {
  const req = (headers: HeadersInit = {}) => new Request('https://reading.example.com/api/links', { method: 'POST', headers });
  assert.doesNotThrow(() => requireSameOrigin(req({ Origin: config.APP_ORIGIN, 'Sec-Fetch-Site': 'same-origin' }), config, session));
  assert.throws(() => requireSameOrigin(req(), config, session), /must come from/);
  assert.throws(() => requireSameOrigin(req({ Origin: 'https://example.com' }), config, session), /must come from/);
  assert.throws(() => requireSameOrigin(req({ Origin: config.APP_ORIGIN, 'Sec-Fetch-Site': 'cross-site' }), config, session), /must come from/);
});

test('input validation preserves meaningful URL differences and rejects invalid data', async () => {
  assert.equal(savedUrl('HTTPS://EXAMPLE.COM:443/a?q=1#two').href, 'https://example.com/a?q=1#two');
  assert.notEqual(savedUrl('https://example.com/a#one').href, savedUrl('https://example.com/a#two').href);
  assert.notEqual(savedUrl('https://example.com/a').href, savedUrl('https://example.com/a/').href);
  for (const value of ['javascript:void(0)', 'file:///tmp/data', 'https://name:password@example.com', 'not a URL']) assert.throws(() => savedUrl(value));
  assert.throws(() => parsePatch({ note: 'a'.repeat(4001) }));
  assert.throws(() => parsePatch({ id: 'other' }));
  assert.throws(() => parseSettings({ fetchMetadata: 'true' }));
  assert.deepEqual(parsePatch({ tags: ['XNU', 'xnu', 'Tools'] }), { tags: ['XNU', 'Tools'] });
  await assert.rejects(jsonBody(new Request('https://example.com', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })), /application\/json/);
  await assert.rejects(readLimited(new Response('a'.repeat(100)), 50), /too large/);
});

test('metadata excludes non-public addresses and fails closed on DNS uncertainty', async () => {
  assert.equal(metadataUrl('https://developer.apple.com/documentation/').hostname, 'developer.apple.com');
  for (const origin of ['https://reading.example.com', 'https://another.example.org']) {
    assert.throws(() => metadataUrl(origin + '/app', origin), /preview/);
    assert.throws(() => metadataUrl(origin.replace('https:', 'http:') + '/app', origin), /preview/);
    assert.throws(() => metadataUrl(origin + './app', origin), /preview/);
    assert.equal(metadataUrl('https://external.example.com/', origin).hostname, 'external.example.com');
  }
  for (const value of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://service.internal/', 'https://example.com:8443/']) assert.throws(() => metadataUrl(value));
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('1.1.1.1'), true);
  const answer = (address: string) => async () => Response.json({ Status: 0, Answer: [{ type: 1, data: address }] });
  await assertPublicDns('example.com', new AbortController().signal, answer('1.1.1.1') as typeof fetch);
  await assert.rejects(assertPublicDns('example.com', new AbortController().signal, answer('10.0.0.1') as typeof fetch));
  await assert.rejects(assertPublicDns('example.com', new AbortController().signal, (async () => Response.json({ Status: 2 })) as typeof fetch));
});
