import { validUrl } from './format';

export interface CaptureDraft { url: string; note: string }
export interface SharedDraft extends CaptureDraft { notice: string }

const SHARE_PATH = '/app/share';
const URL_LIMIT = 4096;
const NOTE_LIMIT = 4000;

export function isSharePath(pathname: string): boolean {
  return pathname === SHARE_PATH || pathname === `${SHARE_PATH}/`;
}

function linkInText(text: string): string {
  // Preserve complete, standalone URLs exactly, including query strings and fragments.
  if (!/\s/.test(text) && validUrl(text)) return text;
  const match = text.match(/https?:\/\/[^\s<>"\u0000-\u001f]+/i);
  if (!match) return '';
  let candidate = match[0].replace(/[.,;!]+$/, '');
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
    while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
  }
  return validUrl(candidate) ? candidate : '';
}

export function readSharedDraft(location: { pathname: string; search: string }): SharedDraft | null {
  if (!isSharePath(location.pathname)) return null;
  const empty = { url: '', note: '', notice: 'No valid link was shared. Paste an http:// or https:// URL below.' };
  if (location.search.length > 32_768) return { ...empty, notice: 'This share is too large. Share just the link, then add a note here.' };
  const params = new URLSearchParams(location.search);
  const explicit = (params.get('url') || '').trim();
  const text = (params.get('text') || '').trim();
  const title = (params.get('title') || '').trim();
  // An explicit invalid URL must not silently select another URL from the payload.
  const url = explicit || linkInText(text) || linkInText(title);
  if (!validUrl(url) || /[\u0000-\u001f\u007f]/.test(url) || url.length > URL_LIMIT) return empty;
  const context = [title, text].map(value => value === url ? '' : value.replace(url, '').trim()).filter(Boolean);
  const note = params.get('note') ?? [...new Set(context)].join('\n\n');
  return {
    url,
    note: note.slice(0, NOTE_LIMIT),
    notice: note.length > NOTE_LIMIT ? 'Shared text was shortened to 4,000 characters. Review the note before saving.' : '',
  };
}

// Fixed same-origin destination. Never accept a caller-controlled redirect URL.
export function shareSignInPath(draft: CaptureDraft): string {
  return `${SHARE_PATH}?${new URLSearchParams({ url: draft.url, note: draft.note })}`;
}
