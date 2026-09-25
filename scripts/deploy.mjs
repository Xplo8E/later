import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { applicationOrigin } from '../shared/site-config.ts';

const prepareOnly = process.argv.includes('--prepare-only');
const validateOnly = process.argv.includes('--validate-only');
if (!existsSync('deployment.config.json')) {
  console.error('Create deployment.config.json from deployment.config.json.example. See docs/DEPLOYMENT.md.');
  process.exit(1);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync('deployment.config.json', 'utf8'));
} catch {
  fail('deployment.config.json must contain valid JSON.');
}
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  fail('deployment.config.json must contain a configuration object.');
}
const fields = [
  'appOrigin', 'accountId', 'databaseId', 'databaseName', 'accessTeamDomain',
  'accessAudience', 'ownerEmail', 'mcpAccessAudience', 'ownerName', 'ownerHandle', 'ownerUrl',
];
if (Object.keys(config).some(key => !fields.includes(key))) {
  fail('Unknown deployment configuration field. See deployment.config.json.example and docs/DEPLOYMENT.md.');
}

let appUrl;
try {
  appUrl = applicationOrigin(config.appOrigin);
} catch {
  fail('Set appOrigin to your exact HTTPS DNS origin, without credentials, a port, path or trailing slash.');
}
for (const key of ['ownerName', 'ownerHandle']) {
  if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim() || config[key].length > 100)) {
    fail(`${key} must be a nonempty display string of at most 100 characters, or be omitted.`);
  }
}
if (config.ownerUrl !== undefined) {
  let ownerUrl;
  try {
    ownerUrl = new URL(config.ownerUrl);
  } catch {
    fail('ownerUrl must be an HTTPS URL, or be omitted.');
  }
  if (typeof config.ownerUrl !== 'string' || ownerUrl.protocol !== 'https:' || ownerUrl.username || ownerUrl.password || config.ownerUrl.length > 2048) {
    fail('ownerUrl must be an HTTPS URL without credentials, or be omitted.');
  }
}

// Account IDs are exactly 32 hexadecimal characters; uppercase hex is also accepted.
if (!/^[a-f0-9]{32}$/i.test(config.accountId || '')) {
  fail('Set the real Cloudflare account ID.');
}
// Check the UUID's 8-4-4-4-12 hex layout, not a particular UUID version.
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(config.databaseId || '')) {
  fail('Set the real D1 database UUID.');
}
// Allow 1–63 letters/digits/underscores/hyphens, starting with a letter or digit.
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(config.databaseName || '')) {
  fail('Set a valid D1 database name.');
}
// Require HTTPS and one lowercase team label under cloudflareaccess.com, with no path or trailing slash.
if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.accessTeamDomain || '')) {
  fail('Set your Cloudflare Access team domain.');
}
// Reject whitespace anywhere in the audience, as well as empty values and template placeholders.
if (
  typeof config.accessAudience !== 'string' ||
  !config.accessAudience ||
  /\s/.test(config.accessAudience) ||
  config.accessAudience.startsWith('YOUR_')
) {
  fail('Set the Access application audience tag.');
}
// The connector audience must be exactly 64 hex characters and differ from the website audience.
if (
  config.mcpAccessAudience !== undefined &&
  (!/^[a-f0-9]{64}$/i.test(config.mcpAccessAudience) || config.mcpAccessAudience === config.accessAudience)
) {
  fail('Set a separate MCP Access application audience tag, or omit mcpAccessAudience to disable the connector.');
}
// Basic email shape: nonempty parts around one @, a dot in the domain, and no whitespace.
// This is a configuration sanity check, not full email validation; reject example.com placeholders too.
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.ownerEmail || '') || config.ownerEmail.endsWith('@example.com')) {
  fail('Set the exact owner email allowed by the Access policy.');
}
const base = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const production = {
  ...base,
  account_id: config.accountId,
  workers_dev: false,
  preview_urls: false,
  routes: [{ pattern: appUrl.hostname, custom_domain: true }],
  d1_databases: [{
    ...base.d1_databases[0],
    database_name: config.databaseName,
    database_id: config.databaseId,
  }],
  vars: {
    ...base.vars,
    APP_ORIGIN: config.appOrigin,
    ACCESS_TEAM_DOMAIN: config.accessTeamDomain,
    ACCESS_AUD: config.accessAudience,
    OWNER_EMAIL: config.ownerEmail.toLowerCase(),
    OWNER_NAME: config.ownerName || 'Your account',
    OWNER_HANDLE: config.ownerHandle || '',
  },
};
// Never carry local authentication or a stale connector audience into production.
delete production.vars.LOCAL_DEV;
delete production.vars.MCP_ACCESS_AUD;
delete production.vars.OWNER_URL;
if (config.ownerUrl) {
  production.vars.OWNER_URL = config.ownerUrl;
}
if (config.mcpAccessAudience) {
  production.vars.MCP_ACCESS_AUD = config.mcpAccessAudience;
}
writeFileSync('wrangler.production.json', JSON.stringify(production, null, 2) + '\n');
if (prepareOnly) {
  console.log('Production configuration prepared. No remote changes made.');
  process.exit(0);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!validateOnly) run(process.execPath, [wrangler, 'whoami']);
run(npm, ['run', 'build'], { LATER_PRODUCTION: '1' });

// Inspect the build output before tests, remote migrations or deployment can run.
const compiled = readFileSync('dist/later/index.js', 'utf8');
if (compiled.includes('LOCAL_DEV') || compiled.includes('local@localhost')) {
  fail('Local authorization unexpectedly remains in the production bundle.');
}
const built = JSON.parse(readFileSync('dist/later/wrangler.json', 'utf8'));
if (built.vars?.MCP_ACCESS_AUD !== config.mcpAccessAudience) {
  fail('Compiled MCP audience does not match the reviewed production settings.');
}
const deploymentMismatch =
  built.account_id !== config.accountId ||
  built.name !== production.name ||
  JSON.stringify(built.routes) !== JSON.stringify(production.routes) ||
  built.d1_databases?.[0]?.database_id !== config.databaseId ||
  built.d1_databases?.[0]?.database_name !== config.databaseName ||
  built.workers_dev !== false ||
  built.preview_urls !== false ||
  built.vars?.LOCAL_DEV ||
  built.vars?.APP_ORIGIN !== config.appOrigin ||
  built.vars?.ACCESS_TEAM_DOMAIN !== config.accessTeamDomain ||
  built.vars?.OWNER_NAME !== production.vars.OWNER_NAME ||
  built.vars?.OWNER_HANDLE !== production.vars.OWNER_HANDLE ||
  built.vars?.OWNER_URL !== config.ownerUrl ||
  built.vars?.ACCESS_AUD !== config.accessAudience ||
  built.vars?.OWNER_EMAIL !== config.ownerEmail.toLowerCase();
if (deploymentMismatch) {
  fail('Compiled deployment configuration does not match the reviewed production settings.');
}
run(npm, ['test']);
if (validateOnly) {
  console.log('Production build and configuration validated. No remote changes made.');
  process.exit(0);
}
run(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.production.json']);
run(process.execPath, [wrangler, 'deploy', '--config', 'dist/later/wrangler.json']);
