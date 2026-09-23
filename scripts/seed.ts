import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtures } from '../src/lib/fixtures.ts';

// This script always uses --local. It cannot seed a remote database.
const quote = (value: string | null | number) => value === null ? 'NULL' : typeof value === 'number' ? `${value}` : `'${value.replace(/'/g, "''")}'`;
const statements: string[] = [];
for (const link of fixtures) {
  const columns = ['id','url','normalized_url','title','domain','kind','note','status','saved_at','updated_at','finished_at','reading_minutes','metadata_status'];
  const values = [link.id,link.url,link.normalizedUrl,link.title,link.domain,link.kind,link.note,link.status,link.savedAt,link.updatedAt,link.finishedAt,link.readingMinutes,'ready'];
  statements.push(`INSERT OR IGNORE INTO links(${columns.join(',')}) VALUES(${values.map(quote).join(',')});`);
  for (const [position, tag] of link.tags.entries()) {
    statements.push(`INSERT OR IGNORE INTO tags(name) VALUES(${quote(tag)});`);
    statements.push(`INSERT OR IGNORE INTO link_tags(link_id,tag_name,position) SELECT ${quote(link.id)},name,${position} FROM tags WHERE name=${quote(tag)} COLLATE NOCASE;`);
  }
}
const directory = mkdtempSync(join(tmpdir(), 'later-seed-'));
const filename = join(directory, 'seed.sql');
try {
  writeFileSync(filename, statements.join('\n'));
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--file', filename], { stdio: 'inherit' });
} finally { rmSync(directory, { recursive: true, force: true }); }
