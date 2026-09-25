import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { handleApi } from '../worker/api.ts';
import { listLinks, takeLimit } from '../worker/db.ts';
import type { Env } from '../worker/types.ts';

test('D1-backed capture, lifecycle, literal search, export, and atomic duplicate handling', async t => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], compatibilityDate: '2026-05-15' });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = await readFile('migrations/0001_initial.sql', 'utf8');
  await db.batch(schema.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const env = { DB: db, APP_ORIGIN: 'https://reading.example.com' } as unknown as Env;
  const session = { name: 'Test', handle: 'test', email: 'test@example.com', local: false };
  const pending: Promise<unknown>[] = [];
  const context = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const req = new Request(`${env.APP_ORIGIN}${path}`, { method, headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return handleApi(req, env, context as ExecutionContext, session);
  };

  await t.test('settings and duplicate captures', async () => {
    await call('/api/settings', 'PATCH', { fetchMetadata: false });
    const attempts = await Promise.allSettled([call('/api/links', 'POST', { url: 'https://example.com/read', note: 'A 100% useful note' }), call('/api/links', 'POST', { url: 'https://EXAMPLE.com:443/read', note: 'second' })]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    const failed = attempts.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failed.reason.status, 409);
    assert.ok(failed.reason.details.existingId);
  });
  const original = (await (await call('/api/links')).json()).items[0];
  const id = original.id;
  await t.test('edit, tag filter, search punctuation and lifecycle', async () => {
    await call(`/api/links/${id}`, 'PATCH', { title: 'XNU reading', tags: ['XNU', 'xnu', 'Tools'], note: 'A 100% useful note', status: 'library' });
    let list = await (await call('/api/links?status=library&tag=XNU&q=100%25')).json();
    assert.equal(list.total, 1); assert.deepEqual(list.items[0].tags, ['XNU', 'Tools']);
    assert.equal((await (await call('/api/links?q=missing')).json()).total, 0);
    assert.equal((await (await call('/api/links?q=_')).json()).total, 0);
    await call(`/api/links/${id}/open`, 'POST', {});
    await call(`/api/links/${id}`, 'PATCH', { status: 'finished' });
    let link = await (await call(`/api/links/${id}`)).json(); assert.equal(link.openCount, 1); assert.ok(link.finishedAt);
    await call(`/api/links/${id}`, 'PATCH', { status: 'inbox' });
    link = await (await call(`/api/links/${id}`)).json(); assert.equal(link.finishedAt, null);
    await call(`/api/links/${id}`, 'PATCH', { status: 'archived' });
    list = await (await call('/api/links?status=archived')).json(); assert.equal(list.total, 1);
    const exported = await (await call('/api/export')).json(); assert.equal(exported.links[0].note, 'A 100% useful note');
    await call(`/api/links/${id}`, 'DELETE', {});
    assert.equal((await db.prepare('SELECT count(*) AS n FROM link_tags').first<{ n: number }>())?.n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM tags').first<{ n: number }>())?.n, 0);
  });

  await t.test('metadata failure never loses a saved URL or note', async () => {
    await call('/api/settings', 'PATCH', { fetchMetadata: true });
    const response = await call('/api/links', 'POST', { url: 'https://metadata-unavailable.invalid/reading', note: 'Keep this even without a preview.' });
    assert.equal(response.status, 201);
    const link = await response.json();
    await Promise.all(pending);
    const saved = await (await call(`/api/links/${link.id}`)).json();
    assert.equal(saved.metadataStatus, 'failed'); assert.equal(saved.note, 'Keep this even without a preview.');
  });

  await t.test('keyset pagination has no gaps when rows share a timestamp', async () => {
    const now = new Date().toISOString();
    await db.batch(Array.from({ length: 55 }, (_, i) => db.prepare("INSERT INTO links(id,url,normalized_url,title,domain,saved_at,updated_at,metadata_status) VALUES(?,?,?,?,?,?,?,'skipped')").bind(`page-${String(i).padStart(3, '0')}`, `https://example.com/${i}`, `https://example.com/${i}`, `Item ${i}`, 'example.com', now, now)));
    const first = await listLinks(env.DB, new URLSearchParams('q=Item'));
    const second = await listLinks(env.DB, new URLSearchParams({ q: 'Item', cursor: first.nextCursor! }));
    assert.equal(first.items.length, 50); assert.equal(second.items.length, 5);
    assert.equal(new Set([...first.items, ...second.items].map(link => link.id)).size, 55);
  });

  await t.test('rediscovery includes old unfinished links and excludes recent, finished and archived items', async () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const cases = [
      ['rediscover-inbox', 'inbox', old, null],
      ['rediscover-library', 'library', old, null],
      ['rediscover-finished', 'finished', old, null],
      ['rediscover-archived', 'archived', old, null],
      ['rediscover-new', 'inbox', now, null],
      ['rediscover-opened', 'library', old, now],
    ];
    await db.batch(cases.map(([id, status, savedAt, openedAt]) => db.prepare('INSERT INTO links(id,url,normalized_url,title,domain,status,saved_at,updated_at,last_opened_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, `https://example.com/${id}`, `https://example.com/${id}`, id, 'example.com', status, savedAt, now, openedAt)));
    const results = await (await call('/api/rediscover')).json();
    assert.deepEqual(results.map((item: { id: string }) => item.id).sort(), ['rediscover-inbox', 'rediscover-library']);
  });

  await t.test('write limits are atomic and survive independent requests', async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => takeLimit(env.DB, 'test-limit', 3)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
    assert.equal(results.filter(result => result.status === 'rejected').length, 7);
  });

  await t.test('delete-all requires confirmation and resets persistent data', async () => {
    await assert.rejects(call('/api/data', 'DELETE', { confirmation: 'no' }));
    await call('/api/data', 'DELETE', { confirmation: 'DELETE ALL' });
    assert.equal((await (await call('/api/links')).json()).total, 0);
    assert.equal((await (await call('/api/settings')).json()).theme, 'system');
  });
});
