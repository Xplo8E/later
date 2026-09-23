import ipaddr from 'ipaddr.js';
import type { LinkKind, Settings } from '../shared/types';
import { HttpError, readLimited } from './http';
import { inferKind, savedUrl } from './validation';

export interface Metadata { title: string; description: string; domain: string; imageUrl: string | null; kind: LinkKind }
type Fetch = typeof fetch;
const blockedSuffixes = ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion', 'home.arpa'];

export function metadataUrl(value: string): URL {
  const url = savedUrl(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipHost = host.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(ipHost) || !host.includes('.') || blockedSuffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`)) || !/^[a-z0-9.-]+$/.test(host) || host === 'later.xplo8e.com') throw new HttpError(422, 'A preview is not available for this address.');
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) throw new HttpError(422, 'Preview fetching supports standard web ports only.');
  return url;
}
export function publicAddress(value: string) {
  try { const address = ipaddr.parse(value); return address.range() === 'unicast'; } catch { return false; }
}
export async function assertPublicDns(host: string, signal: AbortSignal, doFetch: Fetch = fetch) {
  const answers = await Promise.all(['A', 'AAAA'].map(async type => {
    const endpoint = new URL('https://cloudflare-dns.com/dns-query'); endpoint.searchParams.set('name', host); endpoint.searchParams.set('type', type);
    const response = await doFetch(endpoint.href, { headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(422, 'Could not check this host.'); }
    const data = JSON.parse(await readLimited(response, 32_768)) as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new HttpError(422, 'Could not resolve this host.');
    return (data.Answer || []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some(address => !publicAddress(address))) throw new HttpError(422, 'A preview is not available for this host.');
}
function decode(value: string, max: number) {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || match;
    const point = parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  }).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function fetchMetadata(input: string, doFetch: Fetch = fetch): Promise<Metadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    let url = metadataUrl(input);
    let response: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      await assertPublicDns(url.hostname, controller.signal, doFetch);
      response = await doFetch(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'LaterMetadata/1.0' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get('location'); await response.body?.cancel();
        if (!next || redirects === 3) throw new HttpError(422, 'Too many redirects.');
        const target = metadataUrl(new URL(next, url).href);
        if (url.protocol === 'https:' && target.protocol !== 'https:') throw new HttpError(422, 'Insecure preview redirect.');
        url = target;
        continue;
      }
      break;
    }
    if (!response?.ok) { await response?.body?.cancel(); throw new HttpError(422, 'The site did not provide a preview.'); }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!['text/html', 'application/xhtml+xml'].includes(contentType || '')) { await response.body?.cancel(); throw new HttpError(422, 'This page does not provide an HTML preview.'); }
    const html = await readLimited(response, 524_288);
    let title = '';
    const values: Record<string, string> = {};
    const rewriter = new HTMLRewriter().on('title', { text(chunk) { if (title.length < 2000) title += chunk.text; } }).on('meta', { element(element) {
      const key = (element.getAttribute('property') || element.getAttribute('name') || '').toLowerCase();
      if (['og:title', 'og:description', 'og:image', 'description', 'og:type'].includes(key) && !values[key]) values[key] = (element.getAttribute('content') || '').slice(0, 4096);
    } });
    await rewriter.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).arrayBuffer();
    let imageUrl: string | null = null;
    if (values['og:image']) {
      try { const image = metadataUrl(new URL(decode(values['og:image'], 4096), url).href); if (image.protocol === 'https:') { await assertPublicDns(image.hostname, controller.signal, doFetch); imageUrl = image.href; } } catch { /* Images are optional. */ }
    }
    const kind = inferKind(url);
    return { title: decode(values['og:title'] || title, 500) || url.hostname, description: decode(values['og:description'] || values.description || '', 1500), domain: new URL(input).hostname, imageUrl, kind: kind !== 'website' ? kind : values['og:type'] === 'article' ? 'article' : 'website' };
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(422, 'Preview unavailable. The link can still be saved.'); }
  finally { clearTimeout(timer); }
}

export function suggestedTags(title: string): string[] {
  const rules: [string, RegExp][] = [['XPC', /\bXPC\b/i], ['XNU', /\bXNU\b/i], ['iOS', /\biOS\b|\biPhone\b/i], ['Tools', /\bLLDB\b|\bLLVM\b|\bGhidra\b|\bFrida\b/i], ['Security', /\bsecurity\b/i]];
  return rules.filter(([, regex]) => regex.test(title)).map(([name]) => name).slice(0, 3);
}

export async function enrichLink(db: D1Database, id: string, url: string, version: number, settings: Settings, doFetch: Fetch = fetch) {
  try {
    const meta = await fetchMetadata(url, doFetch);
    const guard = "id = ? AND metadata_version = ? AND metadata_status = 'pending'";
    const statements: D1PreparedStatement[] = [];
    for (const [position, tag] of (settings.suggestTags ? suggestedTags(meta.title) : []).entries()) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO tags(name) SELECT ? WHERE EXISTS(SELECT 1 FROM links WHERE ${guard} AND tags_edited=0)`).bind(tag, id, version));
      statements.push(db.prepare(`INSERT OR IGNORE INTO link_tags(link_id,tag_name,position) SELECT ?,name,? FROM tags WHERE name=? COLLATE NOCASE AND EXISTS(SELECT 1 FROM links WHERE ${guard} AND tags_edited=0)`).bind(id, position, tag, id, version));
    }
    statements.push(db.prepare(`UPDATE links SET title = CASE WHEN title_edited = 0 THEN ? ELSE title END, description = ?, image_url = ?, kind = ?, metadata_status = 'ready' WHERE ${guard}`).bind(meta.title, meta.description, meta.imageUrl, meta.kind, id, version));
    await db.batch(statements);
  } catch {
    await db.prepare("UPDATE links SET metadata_status = 'failed' WHERE id = ? AND metadata_version = ? AND metadata_status = 'pending'").bind(id, version).run();
  }
}
