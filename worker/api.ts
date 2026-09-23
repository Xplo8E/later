import { DEFAULT_SETTINGS, type Session } from '../shared/types';
import type { Env } from './types';
import { HttpError, json, jsonBody } from './http';
import { getLink, getSettings, listLinks, patchLink, selectLinks, takeLimit, toLink, updateSettings } from './db';
import { parsePatch, parseSettings, savedUrl } from './validation';
import { captureLink } from './library';
import { enrichLink, fetchMetadata } from './metadata';
import { requireSameOrigin } from './auth';

export async function handleApi(request: Request, env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>, session: Session): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new HttpError(405, 'Method not allowed.');
  if (method !== 'GET') {
    requireSameOrigin(request, env, session);
    await takeLimit(env.DB, path === '/api/preview' ? 'preview' : 'writes', path === '/api/preview' ? 20 : 60);
  }
  if (path === '/api/session' && method === 'GET') return json(session);
  if (path === '/api/settings') {
    if (method === 'GET') return json(await getSettings(env.DB));
    if (method === 'PATCH') return json(await updateSettings(env.DB, parseSettings(await jsonBody(request))));
  }
  if (path === '/api/preview' && method === 'POST') {
    const body = await jsonBody(request);
    const settings = await getSettings(env.DB);
    if (!settings.fetchMetadata) throw new HttpError(422, 'Automatic previews are switched off.');
    return json(await fetchMetadata(savedUrl(body.url).href));
  }
  if ((path === '/api/links' || path === '/api/search') && method === 'GET') return json(await listLinks(env.DB, url.searchParams));
  if (path === '/api/links' && method === 'POST') {
    return json(await captureLink(env, ctx, await jsonBody(request)), 201);
  }
  if (path === '/api/tags' && method === 'GET') {
    const tags = await env.DB.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE').all<{ name: string }>();
    return json(tags.results.map(tag => tag.name));
  }
  if (path === '/api/rediscover' && method === 'GET') {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const openedCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const rows = await env.DB.prepare(`${selectLinks} WHERE l.status IN ('inbox','library') AND l.saved_at < ? AND (l.last_opened_at IS NULL OR l.last_opened_at < ?) ORDER BY
      ((julianday('now')-julianday(COALESCE(l.last_opened_at,l.saved_at))) / (1.0+l.open_count)) * ((abs(random() % 1000)+1)/1000.0) DESC LIMIT 4`).bind(cutoff, openedCutoff).all<Record<string, unknown>>();
    return json(rows.results.map(toLink));
  }
  if (path === '/api/export' && method === 'GET') {
    const [rows, settings] = await Promise.all([env.DB.prepare(`${selectLinks} ORDER BY l.saved_at DESC,l.id DESC`).all<Record<string, unknown>>(), getSettings(env.DB)]);
    return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings, links: rows.results.map(toLink) }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="later-library.json"', 'Cache-Control': 'no-store' } });
  }
  if (path === '/api/data' && method === 'DELETE') {
    const body = await jsonBody(request);
    if (body.confirmation !== 'DELETE ALL') throw new HttpError(400, 'Confirm deletion by typing DELETE ALL.');
    await env.DB.batch([env.DB.prepare('DELETE FROM links'), env.DB.prepare('DELETE FROM tags'), env.DB.prepare('UPDATE settings SET value = ? WHERE id = 1').bind(JSON.stringify(DEFAULT_SETTINGS))]);
    return json({ deleted: true });
  }
  const match = /^\/api\/links\/([A-Za-z0-9-]{1,100})(?:\/(open|metadata))?$/.exec(path);
  if (match) {
    const [, id, action] = match;
    if (!action && method === 'GET') return json(await getLink(env.DB, id));
    if (!action && method === 'PATCH') return json(await patchLink(env.DB, id, parsePatch(await jsonBody(request))));
    if (!action && method === 'DELETE') {
      await jsonBody(request);
      await getLink(env.DB, id);
      await env.DB.batch([env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM link_tags WHERE tag_name = tags.name)')]);
      return json({ deleted: true });
    }
    if (action === 'open' && method === 'POST') {
      await jsonBody(request);
      const result = await env.DB.prepare('UPDATE links SET open_count=open_count+1,last_opened_at=? WHERE id=? RETURNING id').bind(new Date().toISOString(), id).first();
      if (!result) throw new HttpError(404, 'Link not found.');
      return json({ opened: true });
    }
    if (action === 'metadata' && method === 'POST') {
      await jsonBody(request);
      const link = await getLink(env.DB, id);
      const settings = await getSettings(env.DB);
      if (!settings.fetchMetadata) throw new HttpError(422, 'Turn on automatic metadata in Settings first.');
      const version = await env.DB.prepare("UPDATE links SET metadata_version=metadata_version+1,metadata_status='pending',metadata_started_at=? WHERE id=? RETURNING metadata_version").bind(new Date().toISOString(), id).first<{ metadata_version: number }>();
      if (!version) throw new HttpError(404, 'Link not found.');
      ctx.waitUntil(enrichLink(env.DB, id, link.url, version.metadata_version, settings).catch(() => undefined));
      return json({ queued: true }, 202);
    }
  }
  throw new HttpError(404, 'API route not found.');
}
