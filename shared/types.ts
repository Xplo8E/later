export type LinkStatus = 'inbox' | 'library' | 'finished' | 'archived';
export type LinkKind = 'article' | 'video' | 'repository' | 'paper' | 'website';
export type MetadataStatus = 'pending' | 'ready' | 'failed' | 'skipped';
export const THEME_IDS = ['system', 'light', 'sand', 'mist', 'dark', 'dusk', 'cocoa'] as const;
export type Theme = typeof THEME_IDS[number];
export const READING_THEMES = [
  { id: 'light', label: 'Light', group: 'light', background: '#f7f6f2', foreground: '#222520' },
  { id: 'sand', label: 'Sepia', group: 'light', background: '#f4e5be', foreground: '#3b2a17' },
  { id: 'mist', label: 'Mint', group: 'light', background: '#deeee2', foreground: '#173c2b' },
  { id: 'dark', label: 'Dark', group: 'dark', background: '#111414', foreground: '#e8ece6' },
  { id: 'dusk', label: 'Midnight', group: 'dark', background: '#111d34', foreground: '#e3ecfa' },
  { id: 'cocoa', label: 'Cocoa', group: 'dark', background: '#2a1b14', foreground: '#f3e2cb' },
] as const;

export interface SavedLink {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  description: string;
  domain: string;
  kind: LinkKind;
  imageUrl: string | null;
  note: string;
  status: LinkStatus;
  tags: string[];
  savedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  readingMinutes: number | null;
  metadataStatus: MetadataStatus;
}

export interface Settings {
  theme: Theme;
  defaultStatus: 'inbox' | 'library';
  fetchMetadata: boolean;
  suggestTags: boolean;
}

export interface Session {
  name: string;
  handle: string;
  email: string;
  local: boolean;
}

export interface LinkCounts { inbox: number; library: number; finished: number; archived: number }
export interface ListResult { items: SavedLink[]; total: number; counts: LinkCounts; tags: string[]; nextCursor: string | null }
export interface LinkPatch { title?: string; note?: string; tags?: string[]; status?: LinkStatus }

export const DEFAULT_SETTINGS: Settings = { theme: 'system', defaultStatus: 'inbox', fetchMetadata: true, suggestTags: true };
