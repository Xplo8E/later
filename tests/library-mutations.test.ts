import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { addTags, appendNote, upsertLink } from '../worker/library-mutations.ts';
import { getLink, patchLink } from '../worker/db.ts';
import type { Env } from '../worker/types';

test('D1 curated capture and additive edits preserve data under retries and concurrency', async t => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], compatibilityDate: '2026-05-15' });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql', '0002_library_operations.sql']) {
    await db.batch((await readFile(`migrations/${file}`, 'utf8')).split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
  await db.prepare("UPDATE settings SET value=json_set(value,'$.fetchMetadata',json('false'))").run();
  const env = { DB: db, APP_ORIGIN: 'https://reading.example.com' } as unknown as Env;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
  const save = (input: Parameters<typeof upsertLink>[2]) => upsertLink(env, ctx, input);
  const created = await save({ requestId: 'create-initial', url: 'https://example.com/read', title: 'Curated title', note: 'Why I saved this', tags: ['XNU', 'xnu', 'Reading'], status: 'finished' });
  const id = created.link.id;

  await t.test('one call captures all fields and protects curated metadata', async () => {
    assert.equal(created.outcome, 'created');
    assert.equal(created.replayed, false);
    assert.equal(created.link.title, 'Curated title');
    assert.equal(created.link.note, 'Why I saved this');
    assert.deepEqual(created.link.tags, ['XNU', 'Reading']);
    assert.equal(created.link.status, 'finished');
    assert.ok(created.link.finishedAt);
    assert.equal(created.link.metadataStatus, 'skipped');
    assert.deepEqual(await db.prepare('SELECT title_edited,tags_edited FROM links WHERE id=?').bind(id).first(), { title_edited: 1, tags_edited: 1 });
  });

  await t.test('default duplicate returns existing data unchanged; explicit merge only adds', async () => {
    const duplicate = await save({ requestId: 'duplicate-return', url: 'https://EXAMPLE.com:443/read', title: 'Wrong', note: 'Wrong', tags: ['Wrong'], status: 'inbox' });
    assert.equal(duplicate.outcome, 'existing');
    assert.deepEqual(duplicate.link, created.link);
    assert.equal(await db.prepare("SELECT name FROM tags WHERE name='Wrong'").first(), null);
    const mergeInput = { requestId: 'duplicate-merge', url: created.link.url, onDuplicate: 'merge' as const, note: 'Extra reason', tags: ['xnu', 'IPC'], title: 'Ignored title', status: 'inbox' as const };
    const merged = await save(mergeInput);
    assert.equal(merged.outcome, 'merged');
    assert.equal(merged.link.note, 'Why I saved this\n\nExtra reason');
    assert.deepEqual(merged.link.tags, ['XNU', 'Reading', 'IPC']);
    assert.equal(merged.link.title, created.link.title);
    assert.equal(merged.link.finishedAt, created.link.finishedAt);
    assert.equal(merged.link.status, 'finished');
    const replay = await save(mergeInput);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.link, merged.link);
    await assert.rejects(save({ ...mergeInput, note: 'Changed payload' }), { status: 409 });
    assert.deepEqual(await getLink(db, id), merged.link);
  });

  await t.test('concurrent append requests preserve every addition and deduplicate retries', async () => {
    const input = { id, text: 'Append once', requestId: 'append-concurrent' };
    const results = await Promise.all([appendNote(db, input), appendNote(db, input), appendNote(db, { id, text: 'Separate addition', requestId: 'append-separate' })]);
    assert.equal(results.filter(result => result.replayed).length, 1);
    const link = await getLink(db, id);
    assert.equal(link.note.split('Append once').length - 1, 1);
    assert.equal(link.note.split('Separate addition').length - 1, 1);
    await assert.rejects(addTags(db, { id, tags: ['Conflict'], requestId: input.requestId }), { status: 409 });
    assert.equal((await getLink(db, id)).tags.includes('Conflict'), false);
    await patchLink(db, id, { title: 'Later edit' });
    assert.equal((await appendNote(db, input)).link.title, 'Later edit');
  });

  await t.test('concurrent tag additions form an ordered union without losses', async () => {
    const input = { id, tags: ['ipc', 'Kernel'], requestId: 'tags-concurrent' };
    const results = await Promise.all([addTags(db, input), addTags(db, input), addTags(db, { id, tags: ['Debugging'], requestId: 'tags-separate' })]);
    assert.equal(results.filter(result => result.replayed).length, 1);
    const link = await getLink(db, id);
    assert.deepEqual(link.tags.slice(0, 3), ['XNU', 'Reading', 'IPC']);
    assert.deepEqual(new Set(link.tags), new Set(['XNU', 'Reading', 'IPC', 'Kernel', 'Debugging']));
  });

  await t.test('concurrent upserts create one row and explicit merges append once', async () => {
    const input = { url: 'https://example.com/race', onDuplicate: 'merge' as const };
    const results = await Promise.all([
      save({ ...input, requestId: 'race-upsert-a', note: 'Reason A', tags: ['Alpha'] }),
      save({ ...input, requestId: 'race-upsert-b', note: 'Reason B', tags: ['Beta'] }),
      save({ ...input, requestId: 'race-upsert-a', note: 'Reason A', tags: ['Alpha'] }),
    ]);
    assert.equal(new Set(results.map(result => result.link.id)).size, 1);
    assert.equal(results.filter(result => !result.replayed && result.outcome === 'created').length, 1);
    const link = await getLink(db, results[0].link.id);
    assert.equal(link.note.split('Reason A').length - 1, 1);
    assert.equal(link.note.split('Reason B').length - 1, 1);
    assert.deepEqual(new Set(link.tags), new Set(['Alpha', 'Beta']));
  });

  await t.test('combined limits reject atomically and failed operations do not consume request IDs', async () => {
    const full = await save({ requestId: 'limits-create', url: 'https://example.com/limits', note: 'n'.repeat(3995), tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) });
    const attempts = await Promise.allSettled([
      appendNote(db, { id: full.link.id, text: 'abc', requestId: 'limit-note-a' }),
      appendNote(db, { id: full.link.id, text: 'xyz', requestId: 'limit-note-b' }),
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((attempts.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.status, 400);
    assert.equal((await getLink(db, full.link.id)).note.length, 4000);
    const tagAttempts = await Promise.allSettled([
      addTags(db, { id: full.link.id, tags: ['Twelfth'], requestId: 'limit-tag-a' }),
      addTags(db, { id: full.link.id, tags: ['Thirteenth'], requestId: 'limit-tag-b' }),
    ]);
    assert.equal(tagAttempts.filter(result => result.status === 'fulfilled').length, 1);
    const before = await getLink(db, full.link.id);
    assert.equal(before.tags.length, 12);
    await assert.rejects(save({ requestId: 'limit-merge-failed', url: before.url, note: 'Too much', tags: ['Overflow'], onDuplicate: 'merge' }), { status: 400 });
    assert.deepEqual(await getLink(db, before.id), before);
    assert.equal(await db.prepare("SELECT * FROM library_operations WHERE request_id='limit-merge-failed'").first(), null);
    assert.equal(await db.prepare("SELECT name FROM tags WHERE name='Overflow'").first(), null);
    // Free capacity and retry a previously rejected operation with the same key.
    await patchLink(db, before.id, { note: '', tags: [] });
    assert.equal((await save({ requestId: 'limit-merge-failed', url: before.url, note: 'Too much', tags: ['Overflow'], onDuplicate: 'merge' })).replayed, false);
  });

  await t.test('missing or deleted links never get resurrected by retries', async () => {
    await assert.rejects(appendNote(db, { id: 'missing', text: 'x', requestId: 'missing-append' }), { status: 404 });
    await assert.rejects(addTags(db, { id: 'missing', tags: ['x'], requestId: 'missing-tags' }), { status: 404 });
    const input = { requestId: 'delete-retry-test', url: 'https://example.com/deleted', note: 'Disposable' };
    const item = await save(input);
    await db.prepare('DELETE FROM links WHERE id=?').bind(item.link.id).run();
    await assert.rejects(save(input), { status: 410 });
    assert.equal(await db.prepare('SELECT id FROM links WHERE normalized_url=?').bind(input.url).first(), null);
  });

  await t.test('validation precedes writes and metadata failures preserve curated fields', async () => {
    await assert.rejects(save({ requestId: 'bad-url-test', url: 'file:///etc/hosts' }), { status: 400 });
    await assert.rejects(appendNote(db, { id, text: '  ', requestId: 'bad-note-test' }), { status: 400 });
    await assert.rejects(addTags(db, { id, tags: [], requestId: 'bad-tags-test' }), { status: 400 });
    await assert.rejects(save({ requestId: 'short', url: 'https://example.com/' }), { status: 400 });
    await db.prepare("UPDATE settings SET value=json_set(value,'$.fetchMetadata',json('true'))").run();
    const item = await save({ requestId: 'metadata-failure', url: 'https://unavailable.invalid/article', title: 'My title', note: 'Keep me', tags: ['Curated'] });
    await Promise.all(pending);
    const link = await getLink(db, item.link.id);
    assert.equal(link.metadataStatus, 'failed');
    assert.equal(link.title, 'My title');
    assert.equal(link.note, 'Keep me');
    assert.deepEqual(link.tags, ['Curated']);
  });
});
