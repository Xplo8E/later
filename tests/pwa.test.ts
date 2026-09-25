import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('install manifest contains standalone launch, valid icons, and no review bundle', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/app/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.prefer_related_applications, false);
  assert.deepEqual(manifest.share_target, { action: '/app/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } });
  assert.deepEqual(JSON.parse(await readFile('dist/client/manifest.webmanifest', 'utf8')).share_target, manifest.share_target);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((icon: { sizes: string; purpose: string }) => icon.sizes === `${size}x${size}` && icon.purpose === 'any');
    assert.ok(icon);
    const png = await readFile(`public${icon.src}`);
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  const maskable = manifest.icons.find((icon: { purpose: string }) => icon.purpose === 'maskable');
  assert.ok(maskable);
  assert.equal((await readFile(`public${maskable.src}`)).readUInt32BE(16), 512);
  for (const file of await readdir('dist/client/assets')) if (file.endsWith('.js')) {
    const compiled = await readFile(`dist/client/assets/${file}`, 'utf8');
    assert.equal(compiled.includes('Responsive review'), false);
    assert.equal(compiled.includes('Viewport width'), false);
  }
});

test('service worker caches only the generic offline page and passes private requests through', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const added: string[] = [], deleted: string[] = [], matched: string[] = [];
  let offline = false;
  const offlineResponse = new Response('offline page');
  runInNewContext(await readFile('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://reading.example.com' }, addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; }, clients: { claim: async () => {} } },
    URL, Response,
    Request: class { constructor(public url: string) {} },
    caches: {
      open: async () => ({ add: async (request: { url: string }) => { added.push(request.url); } }),
      keys: async () => ['later-offline-v0', 'later-offline-v1', 'unrelated-app'],
      delete: async (key: string) => { deleted.push(key); },
      match: async (path: string) => { matched.push(path); return offlineResponse.clone(); },
    },
    fetch: async () => { if (offline) throw new TypeError('offline'); return new Response('private network response', { headers: { 'Cache-Control': 'no-store' } }); },
  });
  let pending: Promise<unknown> | undefined;
  handlers.install({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } }); await pending;
  assert.deepEqual(added, ['/offline.html']);
  handlers.activate({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } }); await pending;
  assert.deepEqual(deleted, ['later-offline-v0']);
  const request = (path: string, mode: string) => {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { url: `https://reading.example.com${path}`, mode }, respondWith: (promise: Promise<Response>) => { response = promise; } });
    return response;
  };
  assert.equal(request('/api/links', 'cors'), undefined);
  assert.equal(request('/api/export', 'navigate'), undefined);
  assert.equal(request('/mcp', 'cors'), undefined);
  assert.equal(request('/mcp', 'navigate'), undefined);
  assert.equal(request('/.well-known/oauth-authorization-server', 'navigate'), undefined);
  assert.equal(request('/cdn-cgi/access/logout', 'navigate'), undefined);
  assert.equal(await (await request('/app/inbox', 'navigate'))?.text(), 'private network response');
  assert.equal(await (await request('/app/share?text=private-shared-note', 'navigate'))?.text(), 'private network response');
  assert.deepEqual(matched, []);
  offline = true;
  assert.equal(await (await request('/app/inbox', 'navigate'))?.text(), 'offline page');
  assert.equal(await (await request('/app/share?text=private-shared-note', 'navigate'))?.text(), 'offline page');
  assert.deepEqual(matched, ['/offline.html', '/offline.html']);
  assert.deepEqual(added, ['/offline.html']);
});
