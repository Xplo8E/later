import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('MCP requires its own owner assertion and supports only bounded library operations', async t => {
  const origin = 'https://reading.example.com';
  const issuer = 'https://mcp-test.cloudflareaccess.com';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'mcp-test' };
  const token = (aud = 'mcp-only', email = 'owner@example.com', expiry: string | number = '5m') => new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'mcp-test' }).setSubject('test-owner').setIssuedAt().setExpirationTime(expiry).setIssuer(issuer).setAudience(aud).sign(privateKey);
  const owner = await token();
  const web = await token('website-only');
  const mf = new Miniflare({
    modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15', d1Databases: ['DB'],
    bindings: { APP_ORIGIN: origin, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'website-only', MCP_ACCESS_AUD: 'mcp-only', OWNER_EMAIL: 'owner@example.com' },
    serviceBindings: { ASSETS: () => new WorkerResponse('public asset') },
    outboundService: request => new URL(request.url).hostname === 'mcp-test.cloudflareaccess.com' ? WorkerResponse.json({ keys: [jwk] }) : new WorkerResponse('Unavailable', { status: 503 }),
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.batch((await readFile('migrations/0001_initial.sql', 'utf8')).split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  await db.batch((await readFile('migrations/0002_library_operations.sql', 'utf8')).split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const rpc = (body: unknown, assertion = owner, extra: Record<string, string> = {}, path = '/mcp') => mf.dispatchFetch(origin + path, {
    method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': assertion, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...extra }, body: JSON.stringify(body),
  });
  const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
  for (const assertion of ['', 'not-a-token', web, await token('mcp-only', 'other@example.com'), await token('mcp-only', 'owner@example.com', 1)]) {
    const response = await rpc(list, assertion);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(await response.text(), /search_links/);
  }
  assert.equal((await mf.dispatchFetch(origin + '/api/session', { headers: { 'Cf-Access-Jwt-Assertion': owner } })).status, 401);
  assert.equal((await mf.dispatchFetch(origin + '/api/session', { headers: { 'Cf-Access-Jwt-Assertion': web } })).status, 200);
  assert.equal((await rpc(list, owner, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await rpc(list, owner, {}, '/mcp/unknown')).status, 404);
  assert.equal((await rpc([list])).status, 400);
  assert.equal((await rpc({ ...list, padding: 'x'.repeat(33_000) })).status, 413);
  assert.equal((await mf.dispatchFetch(origin + '/mcp', { headers: { 'Cf-Access-Jwt-Assertion': owner } })).status, 405);
  assert.equal((await mf.dispatchFetch('https://alternate.example/mcp', { headers: { 'Cf-Access-Jwt-Assertion': owner } })).status, 403);

  // Exercise an actual SDK client over HTTP, not direct tool-handler calls.
  const client = new Client({ name: 'Later test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    requestInit: { headers: { 'Cf-Access-Jwt-Assertion': owner } },
    fetch: async (input, init) => {
      const response = await mf.dispatchFetch(String(input), init);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
    },
  });
  await client.connect(transport);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['add_tags', 'append_note', 'get_link', 'save_link', 'search_links', 'set_link_status', 'update_link', 'upsert_link']);
  assert.equal(tools.find(tool => tool.name === 'get_link')?.annotations?.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'update_link')?.annotations?.destructiveHint, true);
  assert.equal(tools.find(tool => tool.name === 'save_link')?.annotations?.openWorldHint, true);
  const call = async (name: string, args: Record<string, unknown>, error = false) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(Boolean(result.isError), error, JSON.stringify(result));
    const message = (result.content as { text: string }[])[0].text;
    if (error && !message.startsWith('{')) return { error: message };
    return JSON.parse(message);
  };
  const created = await call('save_link', { url: 'https://unavailable.example/article', note: 'Keep this note even if metadata fails.' });
  const duplicate = await call('save_link', { url: created.url, note: 'Do not overwrite' }, true);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.existingId, created.id);
  const edited = await call('update_link', { id: created.id, title: 'MCP reading', tags: ['Tools', 'tools', 'Saved'] });
  assert.equal(edited.note, created.note);
  assert.deepEqual(edited.tags, ['Tools', 'Saved']);
  const searched = await call('search_links', { q: 'MCP', tag: 'Tools' });
  assert.equal(searched.total, 1);
  assert.equal(searched.items[0].id, created.id);
  for (const status of ['finished', 'archived', 'inbox', 'library']) assert.equal((await call('set_link_status', { id: created.id, status })).status, status);
  await call('update_link', { id: created.id }, true);
  await call('update_link', { id: created.id, status: 'archived' }, true);
  await call('save_link', { url: 'javascript:alert(1)' }, true);
  await call('save_link', { url: 'https://user:pass@example.com/' }, true);
  await call('delete_link', { id: created.id }, true);
  await call('search_links', { q: 'x'.repeat(201) }, true);
  const read = await call('get_link', { id: created.id });
  assert.equal(read.url, created.url);
  assert.equal(read.note, created.note);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM links').first<{ n: number }>())?.n, 1);
  const curated = await call('upsert_link', { requestId: 'sdk-curated-save', url: 'https://unavailable.invalid/curated', title: 'Curated', note: 'A reason', tags: ['Tools'], status: 'library' });
  assert.equal(curated.outcome, 'created');
  assert.equal(curated.link.title, 'Curated');
  assert.equal(curated.link.status, 'library');
  assert.deepEqual(curated.link.tags, ['Tools']);
  const appendArgs = { id: curated.link.id, text: 'More context', requestId: 'sdk-note-append' };
  const appended = await call('append_note', appendArgs);
  assert.equal(appended.link.note, 'A reason\n\nMore context');
  assert.equal((await call('append_note', appendArgs)).replayed, true);
  assert.deepEqual((await call('add_tags', { id: curated.link.id, tags: ['tools', 'Reading'], requestId: 'sdk-tag-addition' })).link.tags, ['Tools', 'Reading']);
  await call('append_note', { id: curated.link.id, text: 'No request ID' }, true);
  await call('upsert_link', { requestId: 'sdk-invalid-fields', url: curated.link.url, priority: 'high' }, true);
  await db.prepare("INSERT INTO write_limits(scope,window,count) VALUES('writes',?,60) ON CONFLICT(scope) DO UPDATE SET window=excluded.window,count=60").bind(Math.floor(Date.now() / 60_000)).run();
  assert.equal((await call('update_link', { id: created.id, note: 'rate limited' }, true)).status, 429);
  assert.equal((await call('get_link', { id: created.id })).note, created.note);
});

test('MCP stays disabled with a missing or reused website audience', async t => {
  for (const audience of ['', 'website-only']) {
    const mf = new Miniflare({ modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15', bindings: { MCP_ACCESS_AUD: audience, ACCESS_AUD: 'website-only' }, serviceBindings: { ASSETS: () => new WorkerResponse('public') } });
    t.after(() => mf.dispose());
    assert.equal((await mf.dispatchFetch('https://reading.example.com/mcp')).status, 503);
    assert.equal((await mf.dispatchFetch('https://reading.example.com/')).status, 200);
  }
});
