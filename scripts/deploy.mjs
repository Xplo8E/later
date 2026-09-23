import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const prepareOnly = process.argv.includes('--prepare-only');
if (!existsSync('deployment.config.json')) {
  console.error('Create deployment.config.json from deployment.config.json.example. See docs/DEPLOYMENT.md.');
  process.exit(1);
}
const config = JSON.parse(readFileSync('deployment.config.json', 'utf8'));
const fail = message => { console.error(message); process.exit(1); };
if (!/^[a-f0-9]{32}$/i.test(config.accountId || '')) fail('Set the real Cloudflare account ID.');
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(config.databaseId || '')) fail('Set the real D1 database UUID.');
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(config.databaseName || '')) fail('Set a valid D1 database name.');
if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.accessTeamDomain || '')) fail('Set your Cloudflare Access team domain.');
if (typeof config.accessAudience !== 'string' || !config.accessAudience || /\s/.test(config.accessAudience) || config.accessAudience.startsWith('YOUR_')) fail('Set the Access application audience tag.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.ownerEmail || '') || config.ownerEmail.endsWith('@example.com')) fail('Set the exact owner email allowed by the Access policy.');
const base = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const production = {
  ...base,
  account_id: config.accountId,
  workers_dev: false,
  preview_urls: false,
  routes: [{ pattern: 'later.xplo8e.com', custom_domain: true }],
  d1_databases: [{ ...base.d1_databases[0], database_name: config.databaseName, database_id: config.databaseId }],
  vars: { ...base.vars, APP_ORIGIN: 'https://later.xplo8e.com', ACCESS_TEAM_DOMAIN: config.accessTeamDomain, ACCESS_AUD: config.accessAudience, OWNER_EMAIL: config.ownerEmail.toLowerCase() },
};
delete production.vars.LOCAL_DEV;
writeFileSync('wrangler.production.json', JSON.stringify(production, null, 2) + '\n');
if (prepareOnly) { console.log('Production configuration prepared. No remote changes made.'); process.exit(0); }
const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) process.exit(result.status || 1);
};
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
run(process.execPath, [wrangler, 'whoami']);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { LATER_PRODUCTION: '1' });
const compiled = readFileSync('dist/later/index.js', 'utf8');
if (compiled.includes('LOCAL_DEV') || compiled.includes('local@localhost')) fail('Local authorization unexpectedly remains in the production bundle.');
const built = JSON.parse(readFileSync('dist/later/wrangler.json', 'utf8'));
if (built.account_id !== config.accountId || built.d1_databases?.[0]?.database_id !== config.databaseId || built.workers_dev !== false || built.preview_urls !== false || built.vars?.LOCAL_DEV || built.vars?.ACCESS_AUD !== config.accessAudience || built.vars?.OWNER_EMAIL !== config.ownerEmail.toLowerCase()) fail('Compiled deployment configuration does not match the reviewed production settings.');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test']);
run(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.production.json']);
run(process.execPath, [wrangler, 'deploy', '--config', 'dist/later/wrangler.json']);
