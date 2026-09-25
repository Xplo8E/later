import type { SavedLink } from '../../shared/types';

export const kindLabel: Record<SavedLink['kind'], string> = { article: 'Article', video: 'YouTube', repository: 'GitHub', paper: 'Paper', website: 'Website' };
export function ageLabel(date: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}
export function dateLabel(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function groupLinks(links: SavedLink[], finished = false) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const groups: Record<string, SavedLink[]> = {};
  for (const link of links) {
    const date = new Date(finished ? link.finishedAt || link.savedAt : link.savedAt);
    let label: string;
    if (finished) {
      label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (date.toDateString() === today) {
      label = 'Today';
    } else if (date.toDateString() === yesterday) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    }
    (groups[label] ||= []).push(link);
  }
  return Object.entries(groups);
}
export function validUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
