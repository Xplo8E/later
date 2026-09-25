import type { LinkKind, LinkPatch, LinkStatus, Settings } from '../shared/types';
import { THEME_IDS } from '../shared/types';
import { HttpError } from './http';

export const statuses: LinkStatus[] = ['inbox', 'library', 'finished', 'archived'];
export function text(value: unknown, name: string, max: number, allowEmpty = true): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const cleaned = value.trim();
  if ((!allowEmpty && !cleaned) || cleaned.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(cleaned)) throw new HttpError(400, `${name} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters.`);
  return cleaned;
}
export function savedUrl(value: unknown): URL {
  const input = text(value, 'URL', 4096, false);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'Enter a complete http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new HttpError(400, 'Use an http:// or https:// URL without embedded credentials.');
  // Preserve paths, query order, fragments and trailing slashes. They can identify different resources.
  if (url.href.length > 4096) throw new HttpError(400, 'URL is too long.');
  return url;
}
export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12) throw new HttpError(400, 'Use at most 12 tags.');
  const seen = new Set<string>();
  // Validate every entry before deduplication; duplicate invalid input must still fail.
  return value.map(value => text(value, 'Tag', 40, false)).filter(tag => {
    const key = tag.toLocaleLowerCase('en-US');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function parsePatch(body: Record<string, unknown>): LinkPatch {
  const allowed = ['title', 'note', 'tags', 'status'];
  if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, 'Unsupported link fields.');
  const patch: LinkPatch = {};
  if ('title' in body) patch.title = text(body.title, 'Title', 500, false);
  if ('note' in body) patch.note = text(body.note, 'Note', 4000);
  if ('tags' in body) patch.tags = cleanTags(body.tags);
  if ('status' in body) {
    if (!statuses.includes(body.status as LinkStatus)) throw new HttpError(400, 'Invalid link status.');
    patch.status = body.status as LinkStatus;
  }
  return patch;
}
export function parseSettings(body: Record<string, unknown>): Partial<Settings> {
  if (!Object.keys(body).length || Object.keys(body).some(key => !['theme', 'defaultStatus', 'fetchMetadata', 'suggestTags'].includes(key))) throw new HttpError(400, 'Unsupported settings.');
  if ('theme' in body && !THEME_IDS.includes(body.theme as Settings['theme'])) throw new HttpError(400, 'Invalid theme.');
  if ('defaultStatus' in body && !['inbox', 'library'].includes(body.defaultStatus as string)) throw new HttpError(400, 'Invalid default location.');
  for (const key of ['fetchMetadata', 'suggestTags']) {
    if (key in body && typeof body[key] !== 'boolean') throw new HttpError(400, `${key} must be a boolean.`);
  }
  return body as Partial<Settings>;
}
export function inferKind(url: URL): LinkKind {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com') return 'video';
  if (host === 'github.com' && url.pathname.split('/').filter(Boolean).length >= 2) return 'repository';
  if (host === 'arxiv.org' || url.pathname.toLowerCase().endsWith('.pdf')) return 'paper';
  return 'website';
}
