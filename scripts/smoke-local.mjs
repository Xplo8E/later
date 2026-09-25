// Disposable API checks against the development server. Never targets production.
import assert from 'node:assert/strict';

const origin = 'http://localhost:4173';
const marker = `later-smoke-${Date.now()}`;
const created = [];
async function call(path, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

try {
  const session = await call('/api/session');
  assert.equal(session.data.local, true, 'Only run with explicit local development authentication');
  const urls = [
    'https://example.com/',
    'https://developer.apple.com/documentation/',
    'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps',
    'https://metadata-unavailable.invalid/',
  ];
  for (const url of urls) {
    const note = `${marker}: preserve this note even when metadata fails.`;
    const saved = await call('/api/links', 'POST', { url: `${url}#${marker}`, note });
    assert.equal(saved.status, 201);
    created.push(saved.data.id);
    const duplicate = await call('/api/links', 'POST', { url: saved.data.url, note: 'duplicate' });
    assert.equal(duplicate.status, 409);
    let item = saved.data;
    // Metadata runs in the background; either ready or failed must retain the capture.
    const deadline = Date.now() + 50_000;
    while (item.metadataStatus === 'pending' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      item = (await call(`/api/links/${item.id}`)).data;
    }
    assert.equal(item.note, note);
    assert.equal(item.url, saved.data.url);
    assert.notEqual(item.metadataStatus, 'pending');
    console.log(JSON.stringify({ url, metadataStatus: item.metadataStatus, title: item.title, notePreserved: true }));
  }
  const id = created[0];
  const edited = await call(`/api/links/${id}`, 'PATCH', {
    title: `${marker} edited title`,
    note: `${marker} edited note`,
    tags: ['Disposable', 'Reading'],
    status: 'library',
  });
  assert.equal(edited.status, 200);
  const search = await call(`/api/links?q=${marker}&tag=Disposable&status=library`);
  assert.equal(search.data.items.length, 1);
  assert.equal(search.data.items[0].id, id);
  const opened = await call(`/api/links/${id}/open`, 'POST', {});
  assert.equal(opened.status, 200);
  const finished = await call(`/api/links/${id}`, 'PATCH', { status: 'finished' });
  assert.ok(finished.data.finishedAt);
  assert.equal(finished.data.openCount, 1);
  const archived = await call(`/api/links/${id}`, 'PATCH', { status: 'archived' });
  assert.equal(archived.data.finishedAt, null);
  await call(`/api/links/${id}`, 'PATCH', { status: 'inbox' });
  const exported = await call('/api/export');
  const exportedItem = exported.data.links.find(item => item.id === id);
  assert.equal(exportedItem.note, `${marker} edited note`);
  console.log('PASS: local duplicate, edit, tags, search, lifecycle, open history, export and fresh-request persistence');
} finally {
  // Only delete IDs created by this run, including after an earlier assertion fails.
  for (const id of created) {
    const removed = await call(`/api/links/${id}`, 'DELETE', {});
    assert.equal(removed.status, 200);
  }
  console.log(`Removed ${created.length} disposable local items.`);
}
