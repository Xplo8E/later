import test from 'node:test';
import assert from 'node:assert/strict';
import { apiResponse, SESSION_EXPIRED } from '../src/lib/transport.ts';

test('Access redirects and rejection clear the session while offline errors stay distinct', async t => {
  const browser = new EventTarget();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
  let expired = 0;
  browser.addEventListener(SESSION_EXPIRED, () => expired++);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ type: 'opaqueredirect', status: 0 } as Response));
  await assert.rejects(apiResponse('/api/session'), /Sign in again/);
  assert.equal(expired, 1);
  for (const status of [401, 403]) {
    fetchMock.mock.mockImplementation(async () => new Response('{}', { status }));
    await assert.rejects(apiResponse('/api/links'), /Sign in again/);
  }
  assert.equal(expired, 3);
  fetchMock.mock.mockImplementation(async () => { throw new TypeError('offline'); });
  await assert.rejects(apiResponse('/api/links'), /offline/);
  assert.equal(expired, 3);
});

test('API requests bypass caches, preserve caller cancellation and bound stalled requests', async t => {
  let options: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (_path, init) => { options = init; return Response.json({ ok: true }); });
  const controller = new AbortController();
  await apiResponse('/api/links', { signal: controller.signal });
  assert.equal(options?.redirect, 'manual');
  assert.equal(options?.cache, 'no-store');
  controller.abort();
  assert.equal(options?.signal?.aborted, true);
  const timeout = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal);
  t.mock.method(globalThis, 'fetch', async () => { timeout.abort(); throw new DOMException('timeout', 'TimeoutError'); });
  await assert.rejects(apiResponse('/api/links'), /timed out/);
});
