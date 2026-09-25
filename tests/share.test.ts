import test from 'node:test';
import assert from 'node:assert/strict';
import { readSharedDraft, shareSignInPath } from '../src/lib/share.ts';

const read = (params: Record<string, string>, pathname = '/app/share') => readSharedDraft({ pathname, search: `?${new URLSearchParams(params)}` });

test('share drafts accept URL fields and Android text/title links without saving', () => {
  assert.deepEqual(read({ url: 'https://example.com/a?q=1&b=two#section', title: 'A useful reference' }), { url: 'https://example.com/a?q=1&b=two#section', note: 'A useful reference', notice: '' });
  assert.deepEqual(read({ text: 'https://example.com/video?v=123', title: 'A video' }), { url: 'https://example.com/video?v=123', note: 'A video', notice: '' });
  assert.equal(read({ text: 'Read this: https://example.com/article. Some context.' })?.url, 'https://example.com/article');
  assert.equal(read({ text: 'Read (https://example.com/wiki/Link_(web)).' })?.url, 'https://example.com/wiki/Link_(web)');
  assert.equal(read({ title: 'https://example.com/' })?.url, 'https://example.com/');
  assert.equal(read({ url: 'https://example.com/' }, '/app/inbox'), null);
  assert.equal(read({ url: 'https://example.com/' }, '/app/share/')?.url, 'https://example.com/');
});

test('share parsing rejects invalid or oversized URLs and bounds shared notes', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/note', 'https://user:password@example.com/', '//example.com/', 'https://example.com/\nother', `https://example.com/${'a'.repeat(4096)}`]) {
    const draft = read({ url, text: 'https://other.example.com/' });
    assert.equal(draft?.url, '');
    assert.ok(draft?.notice);
  }
  assert.equal(read({ text: 'Just some words' })?.url, '');
  const long = read({ url: 'https://example.com/', text: 'a'.repeat(4001) });
  assert.equal(long?.note.length, 4000);
  assert.match(long?.notice || '', /shortened/);
  assert.match(read({ text: 'a'.repeat(33_000) })?.notice || '', /too large/);
});

test('reauthentication keeps edited URL and note on a fixed protected destination', () => {
  const draft = { url: 'https://example.com/?a=1&b=2#part', note: 'Keep https://example.com/?a=1&b=2#part\nUnicode: 日本語 & ? # +' };
  const destination = new URL(shareSignInPath(draft), 'https://reading.example.com');
  assert.equal(destination.origin, 'https://reading.example.com');
  assert.equal(destination.pathname, '/app/share');
  assert.deepEqual(readSharedDraft(destination), { ...draft, notice: '' });
  assert.equal(destination.searchParams.has('redirect'), false);
});
