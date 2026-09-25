import { DEFAULT_SETTINGS, type LinkCounts, type LinkPatch, type ListResult, type SavedLink, type Settings } from '../shared/types';
import { HttpError } from './http';
import { statuses } from './validation';

type Row = Record<string, unknown>;
export const selectLinks = `SELECT l.*, COALESCE((SELECT json_group_array(tag_name) FROM (SELECT tag_name FROM link_tags WHERE link_id = l.id ORDER BY position)), '[]') AS tags_json FROM links l`;
export function toLink(row: Row): SavedLink {
  const pendingExpired = row.metadata_status === 'pending' && typeof row.metadata_started_at === 'string' && Date.parse(row.metadata_started_at) < Date.now() - 45_000;
  return {
    id: row.id as string, url: row.url as string, normalizedUrl: row.normalized_url as string,
    title: row.title as string, description: row.description as string, domain: row.domain as string,
    kind: row.kind as SavedLink['kind'], imageUrl: row.image_url as string | null,
    note: row.note as string, status: row.status as SavedLink['status'], tags: JSON.parse(row.tags_json as string),
    savedAt: row.saved_at as string, updatedAt: row.updated_at as string, finishedAt: row.finished_at as string | null,
    lastOpenedAt: row.last_opened_at as string | null, openCount: row.open_count as number,
    readingMinutes: row.reading_minutes as number | null, metadataStatus: pendingExpired ? 'failed' : row.metadata_status as SavedLink['metadataStatus'],
  };
}
export async function getLink(db: D1Database, id: string) {
  const row = await db.prepare(`${selectLinks} WHERE l.id = ?`).bind(id).first<Row>();
  if (!row) throw new HttpError(404, 'Link not found.');
  return toLink(row);
}
export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare('SELECT value FROM settings WHERE id = 1').first<{ value: string }>();
  return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } : { ...DEFAULT_SETTINGS };
}
export async function updateSettings(db: D1Database, patch: Partial<Settings>): Promise<Settings> {
  // SQLite JSON patch avoids losing another tab's update to an unrelated setting.
  await db.prepare('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value = json_patch(settings.value,?)').bind(JSON.stringify({ ...DEFAULT_SETTINGS, ...patch }), JSON.stringify(patch)).run();
  return getSettings(db);
}
export async function listLinks(db: D1Database, params: URLSearchParams): Promise<ListResult> {
  const status = params.get('status');
  if (status && !statuses.includes(status as SavedLink['status'])) throw new HttpError(400, 'Invalid status.');
  const search = (params.get('q') || '').trim();
  const tag = params.get('tag') || '';
  if (search.length > 200 || tag.length > 40) throw new HttpError(400, 'Search or tag is too long.');
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];
  if (status) {
    clauses.push('l.status = ?');
    bindings.push(status);
  }
  if (tag) {
    clauses.push('EXISTS(SELECT 1 FROM link_tags WHERE link_id = l.id AND tag_name = ? COLLATE NOCASE)');
    bindings.push(tag);
  }
  // AND individual literal terms, including punctuation. No SQL or FTS query language is accepted.
  for (const term of search.split(/\s+/).filter(Boolean).slice(0, 12)) {
    const literal = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push("(l.title LIKE ? ESCAPE '\\' OR l.note LIKE ? ESCAPE '\\' OR l.url LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM link_tags WHERE link_id = l.id AND tag_name LIKE ? ESCAPE '\\'))");
    bindings.push(literal, literal, literal, literal);
  }
  // Totals cover the whole filtered list; only page queries include the cursor below.
  const baseWhere = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const orderField = status === 'finished' ? 'finished_at' : 'saved_at';
  const cursor = params.get('cursor');
  const pageBindings = [...bindings];
  if (cursor) {
    if (cursor.length > 512) throw new HttpError(400, 'Invalid cursor.');
    let parts: unknown;
    try {
      parts = JSON.parse(atob(cursor));
    } catch {
      throw new HttpError(400, 'Invalid cursor.');
    }
    if (!Array.isArray(parts) || parts.length !== 2 || parts.some(value => typeof value !== 'string') || !Number.isFinite(Date.parse(parts[0]))) throw new HttpError(400, 'Invalid cursor.');
    clauses.push(`(l.${orderField} < ? OR (l.${orderField} = ? AND l.id < ?))`);
    pageBindings.push(parts[0], parts[0], parts[1]);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const [rows, total, countRows, tagRows] = await Promise.all([
    db.prepare(`${selectLinks}${where} ORDER BY l.${orderField} DESC, l.id DESC LIMIT 51`).bind(...pageBindings).all<Row>(),
    db.prepare(`SELECT count(*) AS count FROM links l${baseWhere}`).bind(...bindings).first<{ count: number }>(),
    db.prepare('SELECT status,count(*) AS count FROM links GROUP BY status').all<{ status: keyof LinkCounts; count: number }>(),
    db.prepare('SELECT name FROM tags WHERE EXISTS(SELECT 1 FROM link_tags WHERE tag_name = tags.name) ORDER BY name COLLATE NOCASE').all<{ name: string }>(),
  ]);
  const counts: LinkCounts = { inbox: 0, library: 0, finished: 0, archived: 0 };
  for (const row of countRows.results) counts[row.status] = row.count;
  const items = rows.results.slice(0, 50).map(toLink);
  const last = rows.results[49];
  return {
    items,
    total: total?.count || 0,
    counts,
    tags: tagRows.results.map(row => row.name),
    nextCursor: rows.results.length > 50 ? btoa(JSON.stringify([last[orderField], last.id])) : null,
  };
}
export async function patchLink(db: D1Database, id: string, patch: LinkPatch) {
  await getLink(db, id);
  const updates = ['updated_at = ?'];
  const values: (string | number | null)[] = [new Date().toISOString()];
  if (patch.title !== undefined) {
    updates.push('title = ?', 'title_edited = 1');
    values.push(patch.title);
  }
  if (patch.note !== undefined) {
    updates.push('note = ?');
    values.push(patch.note);
  }
  if (patch.status) {
    updates.push('status = ?', "finished_at = CASE WHEN ? = 'finished' THEN COALESCE(finished_at,?) ELSE NULL END");
    values.push(patch.status, patch.status, new Date().toISOString());
  }
  if (patch.tags !== undefined) updates.push('tags_edited = 1');
  const statements = [db.prepare(`UPDATE links SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id)];
  if (patch.tags !== undefined) {
    statements.push(db.prepare('DELETE FROM link_tags WHERE link_id = ?').bind(id));
    patch.tags.forEach((tag, position) => {
      statements.push(db.prepare('INSERT OR IGNORE INTO tags(name) SELECT ? WHERE EXISTS(SELECT 1 FROM links WHERE id = ?)').bind(tag, id));
      statements.push(db.prepare('INSERT INTO link_tags(link_id,tag_name,position) SELECT ?,name,? FROM tags WHERE name = ? COLLATE NOCASE AND EXISTS(SELECT 1 FROM links WHERE id = ?)').bind(id, position, tag, id));
    });
    statements.push(db.prepare('DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM link_tags WHERE tag_name = tags.name)'));
  }
  await db.batch(statements);
  return getLink(db, id);
}
export async function takeLimit(db: D1Database, scope: string, limit: number) {
  const window = Math.floor(Date.now() / 60_000);
  const result = await db.prepare(`INSERT INTO write_limits(scope,window,count) VALUES(?,?,1)
    ON CONFLICT(scope) DO UPDATE SET window=excluded.window,
    count=CASE WHEN write_limits.window=excluded.window THEN write_limits.count+1 ELSE 1 END
    WHERE write_limits.window<>excluded.window OR write_limits.count<? RETURNING count`).bind(scope, window, limit).first();
  if (!result) throw new HttpError(429, 'A few too many requests. Try again in a minute.');
}
