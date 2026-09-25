import { getLink, getSettings } from './db';
import { HttpError } from './http';
import { enrichLink } from './metadata';
import type { Env } from './types';
import { inferKind, savedUrl, text } from './validation';

// Shared capture semantics for the website and authenticated MCP connector.
export async function captureLink(env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>, body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !['url', 'note'].includes(key))) throw new HttpError(400, 'Unsupported capture fields.');
  const parsed = savedUrl(body.url);
  const note = body.note === undefined ? '' : text(body.note, 'Note', 4000);
  const settings = await getSettings(env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO links(id,url,normalized_url,title,domain,kind,note,status,saved_at,updated_at,metadata_status,metadata_started_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_url) DO NOTHING RETURNING id`).bind(id, parsed.href, parsed.href, parsed.hostname, parsed.hostname, inferKind(parsed), note, settings.defaultStatus, now, now, settings.fetchMetadata ? 'pending' : 'skipped', settings.fetchMetadata ? now : null).first<{ id: string }>();
  if (!result) {
    const existing = await env.DB.prepare('SELECT id FROM links WHERE normalized_url = ?').bind(parsed.href).first<{ id: string }>();
    throw new HttpError(409, 'This link is already in your library.', { existingId: existing?.id });
  }
  const link = await getLink(env.DB, id);
  if (settings.fetchMetadata) ctx.waitUntil(enrichLink(env.DB, id, parsed.href, 0, settings, env.APP_ORIGIN).catch(() => undefined));
  return link;
}
