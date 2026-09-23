import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

test('compiled Worker authenticates and extracts bounded HTML metadata without overwriting edits', async t => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'integration';
  const origin = 'https://later.xplo8e.com';
  const issuer = 'https://test-team.cloudflareaccess.com';
  const token = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'integration' }).setSubject('owner').setIssuedAt().setExpirationTime('5m').setIssuer(issuer).setAudience('later-test').sign(privateKey);
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const visited: string[] = [];
  const assetRequests: string[] = [];
  const mf = new Miniflare({
    modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15', d1Databases: ['DB'],
    bindings: { APP_ORIGIN: origin, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'later-test', OWNER_EMAIL: 'owner@example.com' },
    serviceBindings: { ASSETS: async request => { assetRequests.push(request.url); return new WorkerResponse('<h1>Later app</h1>', { headers: { 'Content-Type': 'text/html' } }); } },
    outboundService: async request => {
      const url = new URL(request.url); visited.push(url.hostname);
      if (url.hostname === 'test-team.cloudflareaccess.com') return WorkerResponse.json({ keys: [jwk] });
      if (url.hostname === 'cloudflare-dns.com') return WorkerResponse.json({ Status: 0, Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '1.1.1.1' }] : [] });
      if (url.hostname === 'redirect.example.com') return new WorkerResponse(null, { status: 302, headers: { Location: 'http://localhost/' } });
      if (url.hostname === 'pdf.example.com') return new WorkerResponse('pdf', { headers: { 'Content-Type': 'application/pdf' } });
      if (url.hostname === 'slow.example.com' && gate) await gate;
      return new WorkerResponse('<!doctype html><title>Fallback</title><meta property="og:title" content="XPC &amp; XNU notes"><meta property="og:type" content="article"><meta name="description" content="A small useful reference."><body>Reference content.</body>', { headers: { 'Content-Type': 'text/html' } });
    },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.batch((await readFile('migrations/0001_initial.sql', 'utf8')).split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const call = (path: string, method = 'GET', body?: unknown) => mf.dispatchFetch(origin + path, { method, headers: { 'Cf-Access-Jwt-Assertion': token, Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal((await call('/api/session')).status, 200);
  const sharedPath = '/app/share?text=https%3A%2F%2Fexample.com%2Farticle&title=Read%20later';
  const shared = await call(sharedPath);
  assert.equal(shared.status, 200);
  assert.equal(shared.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(assetRequests, [origin + sharedPath]);
  assert.equal((await (await call('/api/links')).json() as { total: number }).total, 0, 'Opening a share must not save it');
  for (const identity of [{ email: 'other@example.com', expiry: '5m' }, { email: 'owner@example.com', expiry: 1 }]) {
    const denied = await new SignJWT({ email: identity.email }).setProtectedHeader({ alg: 'RS256', kid: 'integration' }).setSubject('test').setIssuedAt().setExpirationTime(identity.expiry).setIssuer(issuer).setAudience('later-test').sign(privateKey);
    assert.equal((await mf.dispatchFetch(origin + sharedPath, { headers: { 'Cf-Access-Jwt-Assertion': denied } })).status, 401);
  }
  assert.equal(assetRequests.length, 1, 'Expired and non-owner sessions must not reach the share form');
  const preview = await call('/api/preview', 'POST', { url: 'https://metadata.example.com/article' });
  assert.equal(preview.status, 200, `${await preview.clone().text()} | visited: ${visited.join(', ')}`);
  assert.deepEqual(await preview.json(), { title: 'XPC & XNU notes', description: 'A small useful reference.', domain: 'metadata.example.com', imageUrl: null, kind: 'article' });
  assert.equal((await call('/api/preview', 'POST', { url: 'https://redirect.example.com/' })).status, 422);
  assert.equal(visited.includes('localhost'), false);
  assert.equal((await call('/api/preview', 'POST', { url: 'https://pdf.example.com/' })).status, 422);

  gate = new Promise(resolve => { release = resolve; });
  const created = await (await call('/api/links', 'POST', { url: 'https://slow.example.com/article', note: 'Keep my original note.' })).json() as { id: string };
  assert.equal((await call(`/api/links/${created.id}`, 'PATCH', { title: 'My own title', tags: ['Reading'] })).status, 200);
  release!();
  let saved: Record<string, unknown> = {};
  for (let i = 0; i < 30; i++) {
    saved = await (await call(`/api/links/${created.id}`)).json() as Record<string, unknown>;
    if (saved.metadataStatus !== 'pending') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(saved.metadataStatus, 'ready');
  assert.equal(saved.title, 'My own title');
  assert.deepEqual(saved.tags, ['Reading']);
  assert.equal(saved.note, 'Keep my original note.');
});
