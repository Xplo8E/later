import type { SavedLink } from '../../shared/types';

// Figma-inspired sample records for explicit LOCAL development seeding only.
// The URLs point to real source homepages/docs, not invented article slugs.
const day = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const make = (id: string, title: string, url: string, note: string, tags: string[], age: number, status: SavedLink['status'], kind: SavedLink['kind'] = 'article', readingMinutes: number | null = null): SavedLink => ({
  id, title, url, normalizedUrl: new URL(url).href, domain: new URL(url).hostname,
  description: '', imageUrl: null, note, tags, status, kind, readingMinutes,
  savedAt: day(age), updatedAt: day(age), finishedAt: status === 'finished' ? day(2) : null,
  lastOpenedAt: null, openCount: 0, metadataStatus: 'ready',
});

export const fixtures: SavedLink[] = [
  make('sample-01', 'Understanding the iOS Boot Process', 'https://support.apple.com/guide/security/welcome/web', 'Watch SEP validation around 31:20.', ['iOS'], 0, 'inbox', 'video', 44),
  make('sample-02', 'The XPC Dictionary', 'https://googleprojectzero.blogspot.com/', 'Interesting technique around bootstrap namespaces.', ['XPC', 'Research'], 0, 'inbox', 'article', 18),
  make('sample-03', 'apple-oss-distributions/xnu', 'https://github.com/apple-oss-distributions/xnu', 'Official XNU sources.', ['XNU'], 0, 'inbox', 'repository'),
  make('sample-04', 'A guide to iOS kernel internals', 'https://newosxbook.com/', 'Good overview, revisit the virtual memory section.', ['Research'], 0, 'inbox', 'article', 12),
  make('sample-05', 'A note on Mach ports and launchd', 'https://github.com/apple-oss-distributions/launchd', 'Useful explanation of port rights.', ['XPC'], 1, 'inbox', 'repository', 9),
  make('sample-06', 'Understanding XPC bootstrap namespaces', 'https://developer.apple.com/documentation/xpc', 'Possible relevance to launchd research. Need to check the bootstrap namespace section.', ['XNU', 'XPC', 'Research'], 43, 'library', 'article', 18),
  make('sample-07', 'A good SEP internals talk', 'https://www.youtube.com/@BlackHatOfficialYT', 'A talk to come back to with a notebook.', ['iOS'], 67, 'library', 'video'),
  make('sample-08', 'Interesting LLVM passes', 'https://llvm.org/docs/Passes.html', 'Keep this nearby when reading compiler output.', ['Tools'], 94, 'library'),
  make('sample-09', 'WebKit internals', 'https://docs.webkit.org/', '', ['Security'], 180, 'library'),
  make('sample-10', 'LLDB tips and tricks', 'https://lldb.llvm.org/use/tutorial.html', 'Useful commands for kernel debugging.', ['Tools', 'Reverse Engineering'], 14, 'library', 'article', 10),
  make('sample-11', 'XNU virtual memory sources', 'https://github.com/apple-oss-distributions/xnu/tree/main/osfmk/vm', 'Revisit pmap notes.', ['XNU'], 20, 'library', 'repository'),
  make('sample-12', 'Apple Platform Security', 'https://support.apple.com/guide/security/intro-to-apple-platform-security-sec04b125e7d/web', 'Good reference for the next reading session.', ['Security', 'iOS'], 10, 'finished', 'article', 22),
  make('sample-13', 'Cloudflare Workers documentation', 'https://developers.cloudflare.com/workers/', 'For building Later.', ['Tools'], 15, 'finished', 'website'),
];
