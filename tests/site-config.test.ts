import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, Response as WorkerResponse } from 'miniflare';

test('public HTML exposes only optional owner branding and leaves private routes protected', async t => {
  for (const ownerUrl of [undefined, 'https://profile.example.org/about?one=1&two=2', 'javascript:alert(1)']) {
    const mf = new Miniflare({
      modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15',
      bindings: {
        APP_ORIGIN: 'https://books.example.org', ACCESS_TEAM_DOMAIN: 'https://sample.cloudflareaccess.com',
        ACCESS_AUD: 'test-private-audience', OWNER_EMAIL: 'owner@example.org',
        ...(ownerUrl ? { OWNER_URL: ownerUrl } : {}),
      },
      serviceBindings: { ASSETS: () => new WorkerResponse('<!doctype html><html><head></head><body>Later</body></html>', { headers: { 'Content-Type': 'text/html' } }) },
    });
    t.after(() => mf.dispose());
    const response = await mf.dispatchFetch('https://books.example.org/');
    if (ownerUrl?.startsWith('javascript:')) {
      assert.equal(response.status, 503);
      assert.match(await response.text(), /OWNER_URL/);
    } else {
      assert.equal(response.status, 200);
      const html = await response.text();
      if (ownerUrl) assert.match(html, /data-owner-url="https:\/\/profile.example.org\/about/);
      else assert.doesNotMatch(html, /data-owner-url/);
      assert.doesNotMatch(html, /owner@example|test-private-audience|sample.cloudflareaccess/);
      assert.match(response.headers.get('Content-Security-Policy') || '', /connect-src 'self'/);
    }
    assert.equal((await mf.dispatchFetch('https://books.example.org/api/session')).status, 401);
    assert.equal((await mf.dispatchFetch('https://books.example.org/app/')).status, 401);
  }
});

test('missing production origin fails closed even with Access settings present', async t => {
  const mf = new Miniflare({
    modules: true, scriptPath: 'dist/later/index.js', compatibilityDate: '2026-05-15',
    bindings: { ACCESS_TEAM_DOMAIN: 'https://sample.cloudflareaccess.com', ACCESS_AUD: 'test-audience', OWNER_EMAIL: 'owner@example.org' },
  });
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch('https://books.example.org/api/session');
  assert.equal(response.status, 503);
  assert.match(await response.text(), /APP_ORIGIN/);
});
