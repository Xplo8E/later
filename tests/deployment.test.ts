import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applicationOrigin, ownerWebsite } from '../shared/site-config.ts';

const source = readFileSync('scripts/deploy.mjs', 'utf8').replace(/^import .*;\n/gm, '');
const base = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const valid = {
  appOrigin: 'https://reading.example.com', accountId: 'a'.repeat(32),
  databaseId: '11111111-2222-3333-4444-555555555555', databaseName: 'reading',
  accessTeamDomain: 'https://test-team.cloudflareaccess.com',
  accessAudience: 'b'.repeat(64), ownerEmail: 'Owner@example.org',
};

// Run the real entrypoint with in-memory files and subprocesses. Never call Wrangler.
function run(config: unknown, args = ['--prepare-only'], mutate?: (built: any) => void) {
  const commands: { command: string; args: string[]; options: any }[] = [];
  const messages: string[] = [];
  let generated: any;
  let exitCode: number | undefined;
  const stopped = new Error('stopped');
  const context = {
    existsSync: () => true,
    readFileSync(path: string) {
      if (path === 'deployment.config.json') return JSON.stringify(config);
      if (path === 'wrangler.jsonc') return JSON.stringify(base);
      if (path === 'dist/later/index.js') return 'compiled production bundle';
      if (path === 'dist/later/wrangler.json') {
        const built = structuredClone(generated);
        mutate?.(built);
        return JSON.stringify(built);
      }
      throw new Error(`Unexpected file: ${path}`);
    },
    writeFileSync(path: string, value: string) {
      assert.equal(path, 'wrangler.production.json');
      generated = JSON.parse(value);
    },
    spawnSync(command: string, args: string[], options: unknown) {
      commands.push(JSON.parse(JSON.stringify({ command, args, options })));
      return { status: 0 };
    },
    URL,
    applicationOrigin,
    console: { log: (message: string) => messages.push(message), error: (message: string) => messages.push(message) },
    process: { argv: args, env: {}, execPath: '/test/node', platform: 'linux', exit(code: number) { exitCode = code; throw stopped; } },
  };
  try { vm.runInNewContext(source, context); } catch (error) { if (error !== stopped) throw error; }
  return { generated, commands, messages, exitCode };
}

test('deployment derives route and origin from one value and resets personal display defaults', () => {
  for (const appOrigin of ['https://reading.example.com', 'https://books.example.org']) {
    const result = run({ ...valid, appOrigin });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.generated.routes, [{ pattern: new URL(appOrigin).hostname, custom_domain: true }]);
    assert.equal(result.generated.vars.APP_ORIGIN, appOrigin);
    assert.equal(result.generated.vars.OWNER_EMAIL, 'owner@example.org');
    assert.equal(result.generated.vars.OWNER_NAME, 'Your account');
    assert.equal(result.generated.vars.OWNER_HANDLE, '');
    assert.equal(result.generated.vars.OWNER_URL, undefined);
    assert.equal(result.generated.vars.LOCAL_DEV, undefined);
    assert.equal(result.generated.vars.MCP_ACCESS_AUD, undefined);
    assert.equal(result.generated.workers_dev, false);
    assert.equal(result.generated.preview_urls, false);
    assert.equal(result.commands.length, 0);
  }
  const result = run({ ...valid, ownerName: 'Reader', ownerHandle: 'reader', ownerUrl: 'https://example.org/about', mcpAccessAudience: 'c'.repeat(64) });
  assert.equal(result.generated.vars.OWNER_NAME, 'Reader');
  assert.equal(result.generated.vars.OWNER_HANDLE, 'reader');
  assert.equal(result.generated.vars.OWNER_URL, 'https://example.org/about');
  assert.equal(result.generated.vars.MCP_ACCESS_AUD, 'c'.repeat(64));
});

test('deployment and runtime accept canonical punycode domains, including IDN TLDs', () => {
  const origins = [
    'https://xn--bcher-kva.de',
    'https://example.xn--p1ai',
    'https://xn--bcher-kva.xn--p1ai',
    `https://${'a'.repeat(63)}.example.com`,
    `https://${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.')}`,
  ];
  for (const appOrigin of origins) {
    const url = applicationOrigin(appOrigin);
    assert.equal(url.origin, appOrigin);
    const result = run({ ...valid, appOrigin });
    assert.equal(result.exitCode, 0, appOrigin);
    assert.deepEqual(result.generated.routes, [{ pattern: url.hostname, custom_domain: true }]);
    assert.equal(result.generated.vars.APP_ORIGIN, appOrigin);
    assert.equal(result.commands.length, 0);
  }
});

test('invalid or incomplete deployment settings fail before writes or subprocesses', () => {
  const origins = ['', undefined, 'http://reading.example.com', 'https://reading.example.com/',
    'https://reading.example.com/path', 'https://reading.example.com?query', 'https://reading.example.com#hash',
    'https://user:pass@reading.example.com', 'https://reading.example.com:8443', 'https://127.0.0.1', 'https://localhost',
    'https://[::1]', 'https://127.1', 'https://2130706433', 'https://0x7f000001',
    'https://reading.example.com:443', 'https://READING.example.com', 'https://reading.example.com.',
    'https://reading..example.com', 'https://-reading.example.com', 'https://reading-.example.com',
    'https://read_ing.example.com', 'https://*.example.com', 'https://example.xn--',
    // Configuration stays canonical: use ASCII/punycode, not Unicode or percent-encoded hosts.
    'https://bücher.de', 'https://example.рф', 'https://%65xample.com',
    `https://${'a'.repeat(64)}.example.com`,
    `https://${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(62)].join('.')}`];
  for (const appOrigin of origins) {
    const result = run({ ...valid, appOrigin });
    assert.equal(result.exitCode, 1);
    assert.match(result.messages[0], /appOrigin/);
    assert.equal(result.generated, undefined);
    assert.equal(result.commands.length, 0);
    assert.throws(() => applicationOrigin(appOrigin as string));
  }
  const invalid = [null, [], {}, { ...valid, domain: 'ignored.example.com' },
    { ...valid, accountId: '' }, { ...valid, accessAudience: '' }, { ...valid, ownerEmail: '' },
    { ...valid, accessTeamDomain: '' }, { ...valid, mcpAccessAudience: valid.accessAudience },
    { ...valid, ownerName: 1 }, { ...valid, ownerHandle: '' },
    { ...valid, ownerUrl: 'javascript:alert(1)' }, { ...valid, ownerUrl: 'https://user:pass@example.org' }];
  for (const config of invalid) {
    const result = run(config);
    assert.equal(result.exitCode, 1);
    assert.equal(result.generated, undefined);
    assert.equal(result.commands.length, 0);
  }
  assert.equal(ownerWebsite(undefined), null);
  assert.equal(ownerWebsite('https://example.org/about')?.hostname, 'example.org');
  assert.throws(() => ownerWebsite('javascript:alert(1)'));
  assert.throws(() => ownerWebsite('https://user:pass@example.org'));
});

test('validate-only checks compiled deployment settings without remote commands', () => {
  const result = run(valid, ['--validate-only']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.commands.map(command => command.args), [['run', 'build'], ['test']]);
  assert.equal(result.commands[0].options.env.LATER_PRODUCTION, '1');
  for (const mutate of [
    (built: any) => { built.vars.APP_ORIGIN = 'https://wrong.example.com'; },
    (built: any) => { built.routes[0].pattern = 'wrong.example.com'; },
    (built: any) => { built.vars.ACCESS_TEAM_DOMAIN = 'https://wrong.cloudflareaccess.com'; },
    (built: any) => { built.vars.OWNER_URL = 'https://wrong.example.com'; },
    (built: any) => { built.vars.LOCAL_DEV = 'true'; },
    (built: any) => { built.workers_dev = true; },
    (built: any) => { built.preview_urls = true; },
  ]) {
    const rejected = run(valid, ['--validate-only'], mutate);
    assert.equal(rejected.exitCode, 1);
    assert.match(rejected.messages[0], /Compiled deployment configuration/);
    assert.deepEqual(rejected.commands.map(command => command.args), [['run', 'build']]);
  }
});
