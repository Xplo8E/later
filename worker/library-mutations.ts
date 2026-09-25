import type { LinkPatch } from '../shared/types';
import { getLink, getSettings } from './db';
import { HttpError } from './http';
import { enrichLink } from './metadata';
import type { Env } from './types';
import { cleanTags, inferKind, parsePatch, savedUrl, text } from './validation';

type Receipt = { payload_hash: string; link_id: string; attempt_id: string; outcome: string };
type Operation = { requestId: string; hash: string; attempt: string; now: string };
type UpsertInput = LinkPatch & { url: string; requestId: string; onDuplicate?: 'return' | 'merge' };

async function operation(requestId: string, payload: unknown): Promise<Operation> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) throw new HttpError(400, 'Use a requestId of 8–128 letters, digits, underscores or hyphens. Reuse it only for an identical retry.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { requestId, hash, attempt: crypto.randomUUID(), now: new Date().toISOString() };
}

// Every edit is conditional on owning the receipt inserted in this same batch.
// An identical concurrent retry has a different attempt ID and makes no edits.
const owned = 'SELECT link_id FROM library_operations WHERE request_id = ? AND attempt_id = ?';
const appendedNote = "CASE WHEN ? = '' THEN note WHEN note = '' THEN ? ELSE note || char(10) || char(10) || ? END";
const mergedTagCount = `(SELECT count(*) FROM (
  SELECT tag_name COLLATE NOCASE AS name FROM link_tags WHERE link_id = l.id
  UNION SELECT value COLLATE NOCASE FROM json_each(?)
))`;

function tagStatements(db: D1Database, op: Operation, tags: string[]) {
  return tags.flatMap(tag => [
    db.prepare(`INSERT OR IGNORE INTO tags(name) SELECT ? WHERE EXISTS(${owned} AND outcome <> 'existing')`).bind(tag, op.requestId, op.attempt),
    db.prepare(`INSERT INTO link_tags(link_id,tag_name,position)
      SELECT o.link_id,t.name,COALESCE((SELECT MAX(position) + 1 FROM link_tags WHERE link_id=o.link_id),0)
      FROM library_operations o JOIN tags t ON t.name = ? COLLATE NOCASE
      WHERE o.request_id = ? AND o.attempt_id = ? AND o.outcome <> 'existing'
        AND NOT EXISTS(SELECT 1 FROM link_tags WHERE link_id=o.link_id AND tag_name=t.name COLLATE NOCASE)`)
      .bind(tag, op.requestId, op.attempt),
  ]);
}

async function complete(db: D1Database, op: Operation, statements: D1PreparedStatement[], missing: () => Promise<never>) {
  // D1 batch executes sequentially in one transaction. A failed statement rolls
  // back both edits and the receipt, so a failed request can be retried safely.
  const results = await db.batch([...statements,
    db.prepare('SELECT payload_hash,link_id,attempt_id,outcome FROM library_operations WHERE request_id = ?').bind(op.requestId),
  ]);
  const receipt = results.at(-1)!.results[0] as Receipt | undefined;
  if (!receipt) return missing();
  if (receipt.payload_hash !== op.hash) throw new HttpError(409, 'This requestId was already used for different input. Use a new requestId.');
  const replayed = receipt.attempt_id !== op.attempt;
  try {
    // Return the current item, not a stale snapshot of private content in a receipt.
    return { link: await getLink(db, receipt.link_id), outcome: receipt.outcome, replayed };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new HttpError(410, 'This operation completed, but the item has since been deleted. It was not recreated.');
    throw error;
  }
}

export async function upsertLink(env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>, input: UpsertInput) {
  const url = savedUrl(input.url);
  const suppliedFields = ['title', 'note', 'tags', 'status']
    .filter(key => input[key as keyof UpsertInput] !== undefined)
    .map(key => [key, input[key as keyof UpsertInput]]);
  const fields = Object.fromEntries(suppliedFields);
  const patch = Object.keys(fields).length ? parsePatch(fields) : {};
  const mode = input.onDuplicate ?? 'return';
  if (!['return', 'merge'].includes(mode)) throw new HttpError(400, 'Invalid duplicate behavior.');
  const note = patch.note ?? '';
  const tags = patch.tags ?? [];
  const op = await operation(input.requestId, ['upsert', url.href, patch.title ?? null, patch.note ?? null, patch.tags ?? null, patch.status ?? null, mode]);
  const settings = await getSettings(env.DB);
  const status = patch.status ?? settings.defaultStatus;
  const statements = [
    // Resolve duplicates and validate combined limits inside the transaction.
    // Returning an existing item ignores all supplied editable fields.
    env.DB.prepare(`INSERT INTO library_operations(request_id,payload_hash,link_id,attempt_id,outcome,created_at)
      SELECT ?,?,COALESCE(l.id,?),?,CASE WHEN l.id IS NULL THEN 'created' WHEN ? = 'merge' THEN 'merged' ELSE 'existing' END,?
      FROM (SELECT 1) LEFT JOIN links l ON l.normalized_url = ?
      WHERE l.id IS NULL OR ? = 'return' OR (length(${appendedNote}) <= 4000 AND ${mergedTagCount} <= 12)
      ON CONFLICT(request_id) DO NOTHING`)
      .bind(op.requestId, op.hash, crypto.randomUUID(), op.attempt, mode, op.now, url.href, mode, note, note, note, JSON.stringify(tags)),
    env.DB.prepare(`INSERT INTO links(id,url,normalized_url,title,domain,kind,note,status,saved_at,updated_at,finished_at,metadata_status,metadata_started_at,title_edited,tags_edited)
      SELECT link_id,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM library_operations
      WHERE request_id = ? AND attempt_id = ? AND outcome = 'created'`)
      .bind(url.href, url.href, patch.title ?? url.hostname, url.hostname, inferKind(url), note, status, op.now, op.now,
        status === 'finished' ? op.now : null, settings.fetchMetadata ? 'pending' : 'skipped', settings.fetchMetadata ? op.now : null,
        patch.title === undefined ? 0 : 1, patch.tags === undefined ? 0 : 1, op.requestId, op.attempt),
    env.DB.prepare(`UPDATE links SET note = ${appendedNote}, updated_at = ?, tags_edited = CASE WHEN ? THEN 1 ELSE tags_edited END
      WHERE id IN (${owned} AND outcome = 'merged') AND (? <> '' OR ?)`)
      .bind(note, note, note, op.now, tags.length > 0 ? 1 : 0, op.requestId, op.attempt, note, tags.length > 0 ? 1 : 0),
  ];
  statements.push(...tagStatements(env.DB, op, tags));
  const result = await complete(env.DB, op, statements, async () => {
    throw new HttpError(400, 'The merged item would exceed 4000 note characters or 12 tags. Nothing was changed.');
  });
  if (!result.replayed && result.outcome === 'created' && settings.fetchMetadata) {
    ctx.waitUntil(enrichLink(env.DB, result.link.id, url.href, 0, settings).catch(() => undefined));
  }
  return result;
}

export async function appendNote(db: D1Database, input: { id: string; text: string; requestId: string }) {
  const note = text(input.text, 'Note addition', 4000, false);
  const op = await operation(input.requestId, ['append', input.id, note]);
  return complete(db, op, [
    db.prepare(`INSERT INTO library_operations(request_id,payload_hash,link_id,attempt_id,outcome,created_at)
      SELECT ?,?,id,?,'appended',? FROM links WHERE id=? AND length(${appendedNote}) <= 4000
      ON CONFLICT(request_id) DO NOTHING`).bind(op.requestId, op.hash, op.attempt, op.now, input.id, note, note, note),
    db.prepare(`UPDATE links SET note = ${appendedNote}, updated_at = ? WHERE id IN (${owned})`)
      .bind(note, note, note, op.now, op.requestId, op.attempt),
  ], async () => {
    await getLink(db, input.id);
    throw new HttpError(400, 'The combined note would exceed 4000 characters. Nothing was changed.');
  });
}

export async function addTags(db: D1Database, input: { id: string; tags: string[]; requestId: string }) {
  const tags = cleanTags(input.tags);
  if (!tags.length) throw new HttpError(400, 'Supply at least one tag.');
  const op = await operation(input.requestId, ['tags', input.id, tags]);
  return complete(db, op, [
    db.prepare(`INSERT INTO library_operations(request_id,payload_hash,link_id,attempt_id,outcome,created_at)
      SELECT ?,?,l.id,?,'tagged',? FROM links l WHERE l.id=? AND ${mergedTagCount} <= 12
      ON CONFLICT(request_id) DO NOTHING`).bind(op.requestId, op.hash, op.attempt, op.now, input.id, JSON.stringify(tags)),
    db.prepare(`UPDATE links SET tags_edited=1,updated_at=? WHERE id IN (${owned})`).bind(op.now, op.requestId, op.attempt),
    ...tagStatements(db, op, tags),
  ], async () => {
    await getLink(db, input.id);
    throw new HttpError(400, 'The combined item would exceed 12 tags. Nothing was changed.');
  });
}
