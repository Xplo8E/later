import { useCallback, useEffect, useRef, useState } from 'react';
import { ownerWebsite } from '../shared/site-config';
import { Check, LogIn, Menu as MenuIcon, Monitor, Search, X } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import type { LinkCounts, LinkPatch, SavedLink, Session, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, READING_THEMES } from '../shared/types';
import { api } from './lib/api';
import { SESSION_EXPIRED } from './lib/transport';
import { useInstallPrompt } from './lib/useInstallPrompt';
import { groupLinks } from './lib/format';
import { isSharePath, readSharedDraft, shareSignInPath } from './lib/share';
import CaptureInput from './components/CaptureInput';
import SavedItemRow from './components/SavedItemRow';
import DetailDrawer from './components/DetailDrawer';
import Rediscover from './components/Rediscover';
import { Confirm, Empty } from './components/primitives';

type Page = 'inbox' | 'library' | 'finished' | 'rediscover' | 'search' | 'settings' | 'share';
const pageLabels: Record<Page, string> = {
  inbox: 'Inbox', library: 'Library', finished: 'Finished', rediscover: 'Rediscover',
  search: 'Search', settings: 'Settings', share: 'Save shared link',
};
const zeroCounts: LinkCounts = { inbox: 0, library: 0, finished: 0, archived: 0 };
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function App() {
  // The Worker supplies this public branding value on HTML responses, including login.
  const ownerUrl = ownerWebsite(document.documentElement.dataset.ownerUrl);
  const installation = useInstallPrompt();
  const [path, setPath] = useState(location.pathname);
  const [sharedDraft, setSharedDraft] = useState(() => readSharedDraft(location));
  const rawPage = path.split('/')[2] || 'inbox';
  const page: Page = rawPage in pageLabels ? rawPage as Page : 'inbox';
  const inApp = path === '/app' || path.startsWith('/app/');
  const [session, setSession] = useState<Session | null>(null);
  const accountLabel = session?.handle || session?.name || 'Account';
  const accountInitial = accountLabel.slice(0, 1).toUpperCase();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [authError, setAuthError] = useState('');
  const [items, setItems] = useState<SavedLink[]>([]);
  const [counts, setCounts] = useState<LinkCounts>(zeroCounts);
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [archived, setArchived] = useState(false);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<SavedLink | null>(null);
  const [edit, setEdit] = useState<'note' | 'tags' | null>(null);
  const [rediscovery, setRediscovery] = useState<SavedLink[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedLink | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listGeneration = useRef(0);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  const navigate = useCallback((next: Page) => {
    const url = `/app/${next}`;
    // Leaving a share replaces its URL so Back does not reopen an already-handled draft.
    if (isSharePath(location.pathname)) {
      history.replaceState(null, '', url);
    } else if (location.pathname !== url) {
      history.pushState(null, '', url);
    }
    setSharedDraft(null);
    setPath(url);
    setQuery('');
    setActiveTag('');
    setArchived(false);
    setSelected(null);
    setMobileNav(false);
    setItems([]);
    setCursor(null);
    setLoading(true);
    setRevision(value => value + 1);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    function handlePopState() {
      // Back/forward restores shared input from the URL, unlike explicit navigation.
      setPath(location.pathname);
      setSharedDraft(readSharedDraft(location));
      setQuery('');
      setActiveTag('');
      setArchived(false);
      setSelected(null);
      setMobileNav(false);
      setItems([]);
      setCursor(null);
      setLoading(true);
      setRevision(value => value + 1);
    }
    addEventListener('popstate', handlePopState);
    return () => removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = inApp ? `${pageLabels[page]} · Later` : 'Later. Your personal internet library.';
  }, [inApp, page]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.querySelector<HTMLAnchorElement>('.sidebar nav a')?.focus();
    function closeOnWide() {
      if (innerWidth > 700) setMobileNav(false);
    }
    function handleMenuKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNav(false);
      }
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll<HTMLElement>('.mobile-header button, .sidebar a, .sidebar button')]
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    addEventListener('keydown', handleMenuKey);
    addEventListener('resize', closeOnWide);
    return () => {
      document.body.style.overflow = previous;
      removeEventListener('keydown', handleMenuKey);
      removeEventListener('resize', closeOnWide);
      menuButton.current?.focus();
    };
  }, [mobileNav]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if (inApp && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('search');
        requestAnimationFrame(() => searchInput.current?.focus());
      }
    }
    addEventListener('keydown', handleSearchShortcut);
    return () => removeEventListener('keydown', handleSearchShortcut);
  }, [navigate, inApp]);

  useEffect(() => {
    function handleSessionExpired() {
      // Clear private views, but retain the in-memory share draft for reauthentication.
      setSession(null);
      setItems([]);
      setSelected(null);
      setRediscovery([]);
      setDeleteTarget(null);
      setCounts(zeroCounts);
      setTags([]);
      setCursor(null);
      setLoading(false);
      setAuthError('Your session expired or access was denied. Sign in again.');
    }
    window.addEventListener(SESSION_EXPIRED, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!inApp) return;
    let active = true;
    Promise.all([api.session(), api.settings()])
      .then(([session, settings]) => {
        if (!active) return;
        setSession(session);
        setSettings(settings);
        setAuthError('');
      })
      .catch(error => {
        if (!active) return;
        setAuthError(messageOf(error));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [inApp]);

  useEffect(() => {
    if (!session) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    function applyTheme() {
      let resolved = settings.theme;
      if (resolved === 'system') {
        resolved = media.matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = resolved;
      const background = READING_THEMES.find(theme => theme.id === resolved)?.background || '#111414';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
      try {
        localStorage.setItem('later.theme', settings.theme);
      } catch {
        // Device storage is optional; the theme is already applied to this document.
      }
    }
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [settings.theme, session]);

  let status: SavedLink['status'] | undefined;
  if (page === 'inbox' || page === 'finished') {
    status = page;
  } else if (page === 'library') {
    status = archived ? 'archived' : 'library';
  }

  useEffect(() => {
    // Invalidate any in-flight pagination, even when this run cannot fetch a list.
    listGeneration.current += 1;
    if (!inApp || !session) return;
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    const timer = setTimeout(() => {
      api.list({ status, q: query, tag: activeTag }, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setCounts(result.counts);
        setTags(result.tags);
        setTotal(result.total);
        setCursor(result.nextCursor);
        setLoading(false);
        setSelected(current => {
          if (!current) return null;
          // Keep an open detail view when filtering removes it from the visible list.
          return result.items.find(item => item.id === current.id) || current;
        });
      }).catch(error => {
        if (controller.signal.aborted) return;
        setListError(messageOf(error));
        setLoading(false);
      });
    }, query ? 200 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, inApp, page, status, query, activeTag, revision]);

  useEffect(() => {
    if (!items.some(item => item.metadataStatus === 'pending')) return;
    const timer = setTimeout(refresh, 2500);
    return () => clearTimeout(timer);
  }, [items, refresh]);

  const shuffle = useCallback(async () => {
    setShuffling(true);
    try {
      setRediscovery(await api.rediscover());
    } catch (error) {
      notify(messageOf(error), true);
    } finally {
      setShuffling(false);
    }
  }, [notify]);

  useEffect(() => {
    if (session && (page === 'inbox' || page === 'rediscover')) void shuffle();
  }, [session, page, shuffle]);

  useEffect(() => {
    if (page === 'search') searchInput.current?.focus();
  }, [page, session]);

  function select(link: SavedLink) {
    setEdit(null);
    setSelected(link);
  }

  async function patch(id: string, values: LinkPatch) {
    const updated = await api.patch(id, values);
    setRediscovery(current => current.flatMap(item => {
      if (item.id !== id) return [item];
      if (updated.status === 'finished' || updated.status === 'archived') return [];
      return [updated];
    }));
    if (values.status) {
      setSelected(current => current?.id === id ? null : current);
      let message = `Moved to ${values.status === 'library' ? 'Library' : 'Inbox'}.`;
      if (values.status === 'finished') {
        message = 'Marked as finished.';
      } else if (values.status === 'archived') {
        message = 'Link archived.';
      }
      notify(message);
    } else {
      setSelected(current => current?.id === id ? updated : current);
      notify('Changes saved.');
    }
    refresh();
  }

  async function safePatch(id: string, values: LinkPatch) {
    // Row actions report failures here; the detail editor handles rejected patches itself.
    try {
      await patch(id, values);
    } catch (error) {
      notify(messageOf(error), true);
    }
  }

  function recordOpen(link: SavedLink) {
    void api.open(link.id)
      .then(() => setSelected(current => {
        if (current?.id !== link.id) return current;
        return { ...current, openCount: current.openCount + 1, lastOpenedAt: new Date().toISOString() };
      }))
      .catch(() => notify('Opened the link, but could not update its history.', true));
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'all') {
        await api.deleteAll();
        setSettings(DEFAULT_SETTINGS);
        setRediscovery([]);
      } else {
        await api.remove(deleteTarget.id);
        setRediscovery(current => current.filter(item => item.id !== deleteTarget.id));
      }
      setSelected(null);
      setDeleteTarget(null);
      notify(deleteTarget === 'all' ? 'Your library has been cleared.' : 'Link deleted.');
      refresh();
    } catch (error) {
      notify(messageOf(error), true);
    } finally {
      setDeleting(false);
    }
  }

  async function saveSettings(patch: Partial<Settings>) {
    setSettingsBusy(true);
    try {
      setSettings(await api.saveSettings(patch));
    } catch (error) {
      notify(messageOf(error), true);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function exportLibrary() {
    setExporting(true);
    try {
      const blob = await api.exportLibrary();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `later-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      // Give the browser time to start the download before releasing the blob URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Library exported.');
    } catch (error) {
      notify(messageOf(error), true);
    } finally {
      setExporting(false);
    }
  }

  async function more() {
    if (!cursor || loading) return;
    // Pagination belongs to the list generation that requested it, not a later search.
    const generation = listGeneration.current;
    setLoading(true);
    try {
      const result = await api.list({ status, q: query, tag: activeTag, cursor });
      if (generation === listGeneration.current) {
        setItems(current => [...current, ...result.items]);
        setCursor(result.nextCursor);
      }
    } catch (error) {
      if (generation === listGeneration.current) notify(messageOf(error), true);
    } finally {
      if (generation === listGeneration.current) setLoading(false);
    }
  }

  function editLink(link: SavedLink, field: 'note' | 'tags') {
    setSelected(link);
    setEdit(field);
  }

  function closeDetails() {
    setSelected(null);
    setEdit(null);
  }

  function showDuplicate(id: string) {
    void api.get(id).then(select).catch(error => notify(messageOf(error), true));
  }

  function handleSaved(link: SavedLink) {
    notify(`Saved to ${link.status === 'library' ? 'Library' : 'Inbox'}.`);
    refresh();
  }

  function handleSharedLinkSaved(link: SavedLink) {
    navigate(link.status === 'library' ? 'library' : 'inbox');
    notify(`Saved to ${link.status === 'library' ? 'Library' : 'Inbox'}.`);
  }

  function retryMetadata(link: SavedLink) {
    void api.retryMetadata(link.id).then(() => {
      notify('Fetching a new preview…');
      setSelected(current => current?.id === link.id ? { ...current, metadataStatus: 'pending' } : current);
      refresh();
    }).catch(error => notify(messageOf(error), true));
  }

  function row(link: SavedLink, compact = false) {
    return <SavedItemRow key={link.id} link={link} selected={selected?.id === link.id} compact={compact} onSelect={select} onPatch={safePatch} onDelete={setDeleteTarget} onEdit={editLink} />;
  }

  function renderEmptyList() {
    let title = 'Your shelf is waiting.';
    let description = 'Move a link here from your Inbox to keep it close.';
    if (query || activeTag) {
      title = 'Nothing found.';
      description = 'Try a different word, source, or tag.';
    } else if (page === 'inbox') {
      title = 'A little room for curiosity.';
      description = 'Save a link above. You can decide what to do with it later.';
    } else if (page === 'finished') {
      title = 'Take your time.';
      description = 'Mark something finished when you’re done exploring it.';
    } else if (archived) {
      title = 'Nothing archived.';
      description = 'Archived links will appear here.';
    }
    return <Empty title={title}>{description}</Empty>;
  }

  function renderListContent() {
    if (listError) {
      return <Empty title="Couldn’t load your links." action={<button className="button" onClick={refresh}>Try again</button>}>{listError}</Empty>;
    }
    if (loading && items.length === 0) {
      return <div className="list-loading" role="status">Loading your links…</div>;
    }
    if (items.length === 0) return renderEmptyList();
    if (page === 'inbox' || page === 'finished') {
      return groupLinks(items, page === 'finished').map(([label, links]) => (
        <section className="date-group" key={label}>
          <h2 className="eyebrow">{label}</h2>
          <div>{links.map(link => row(link))}</div>
        </section>
      ));
    }
    return <div className="flat-list">{items.map(link => row(link, page === 'search'))}</div>;
  }

  function renderMainContent() {
    if (authError) {
      return (
        <div className="content-column">
          <Empty title="Your library is private.">{authError}</Empty>
          <a className="button primary" href={sharedDraft ? shareSignInPath(sharedDraft) : '/app/'}>Sign in again →</a>
        </div>
      );
    }
    if (!session) {
      return <div className="content-column loading-page" role="status">Opening your library…</div>;
    }
    return <>
        <div className={`content-column ${page === 'search' ? 'search-column' : ''} ${page === 'rediscover' ? 'wide-column' : ''}`}>
          {page !== 'search' && (
            <header className="page-heading">
              <div className="page-title">
                <h1>{pageLabels[page]}</h1>
                {page in counts && <span>{counts[page as keyof LinkCounts]}</span>}
              </div>
              {page === 'inbox' && <p>Things you saved but haven’t dealt with yet.</p>}
              {page === 'finished' && <p>Things you’ve already explored.</p>}
              {page === 'rediscover' && <p>No feed. No guilt. Just things worth seeing again.</p>}
              {page === 'share' && <p>Review the link, add a little context, then save. Nothing is saved until you choose Save.</p>}
            </header>
          )}
          {page === 'inbox' && (
            <CaptureInput
              fetchMetadata={settings.fetchMetadata}
              defaultStatus={settings.defaultStatus}
              onSaved={handleSaved}
              onDuplicate={showDuplicate}
            />
          )}
          {page === 'share' && <>
            {sharedDraft?.notice && <p className="share-notice" role="status">{sharedDraft.notice}</p>}
            <CaptureInput
              key={path}
              initialDraft={sharedDraft || undefined}
              onDraftChange={draft => setSharedDraft(current => ({ ...draft, notice: current?.notice || '' }))}
              onCancel={() => navigate('inbox')}
              fetchMetadata={settings.fetchMetadata}
              defaultStatus={settings.defaultStatus}
              onSaved={handleSharedLinkSaved}
              onDuplicate={showDuplicate}
            />
            {!sharedDraft?.url && <button className="text-button share-cancel" onClick={() => navigate('inbox')}>Back to Inbox</button>}
          </>}
          {(page === 'search' || page === 'library') && (
            <div className={`search-box ${page === 'search' ? 'large-search' : ''}`}>
              <Search aria-hidden="true" />
              <input
                ref={searchInput}
                aria-label={page === 'search' ? 'Search all saved links' : 'Search library'}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={page === 'search' ? 'Search your library…' : 'Search library…'}
                maxLength={200}
              />
              <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}K</kbd>
              {query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X aria-hidden="true" /></button>}
            </div>
          )}
          {page === 'library' && <>
            <div className="filter-bar" aria-label="Filter by tag">
              <button className={`tag filter ${!activeTag ? 'active' : ''}`} aria-pressed={!activeTag} onClick={() => setActiveTag('')}>All</button>
              {tags.map(tag => (
                <button key={tag} className={`tag filter ${activeTag === tag ? 'active' : ''}`} aria-pressed={activeTag === tag} onClick={() => setActiveTag(tag)}>{tag}</button>
              ))}
            </div>
            <div className="list-toolbar">
              <span>{total} {total === 1 ? 'item' : 'items'}</span>
              <label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Archived{counts.archived ? ` (${counts.archived})` : ''}</label>
            </div>
          </>}
          {page === 'search' && <p className="eyebrow search-results-label">{query ? `${total} ${total === 1 ? 'result' : 'results'}` : 'Recently saved'}</p>}
          {['inbox', 'library', 'finished', 'search'].includes(page) && <div className="link-results" aria-busy={loading}>
            {renderListContent()}
            {cursor && <button className="button load-more" disabled={loading} onClick={() => void more()}>{loading ? 'Loading…' : 'Show more'}</button>}
          </div>}
          {page === 'rediscover' && <Rediscover links={rediscovery} loading={shuffling} onSelect={select} onOpen={recordOpen} onShuffle={() => void shuffle()} />}
          {page === 'settings' && <div className="settings">
            <section>
              <h2 className="eyebrow">Account</h2>
              <div className="account-setting">
                <span className="avatar large">{accountInitial}</span>
                <div><strong>{session.name}</strong><p>{session.handle && `@${session.handle} · `}{session.local ? 'Local development' : 'Connected with GitHub'}</p></div>
                <a className="button signout" href={session.local ? '/' : '/cdn-cgi/access/logout'}>Sign out</a>
              </div>
            </section>
            <section>
              <h2 className="eyebrow">Appearance</h2>
              <div className="reading-themes" role="group" aria-label="Theme">
                <button className={`theme-system ${settings.theme === 'system' ? 'chosen' : ''}`} aria-label="System" aria-pressed={settings.theme === 'system'} disabled={settingsBusy} onClick={() => void saveSettings({ theme: 'system' })}>
                  <Monitor aria-hidden="true" /><span>Use device appearance</span>
                  {settings.theme === 'system' && <Check aria-hidden="true" />}
                </button>
                {(['light', 'dark'] as const).map(group => (
                  <div className="theme-family" key={group} role="group" aria-label={`${group === 'light' ? 'Light' : 'Dark'} themes`}>
                    <p>{group === 'light' ? 'Light' : 'Dark'}</p>
                    <div className="theme-grid">
                      {READING_THEMES.filter(theme => theme.group === group).map(theme => (
                        <button key={theme.id} aria-label={theme.label} className={`theme-card ${settings.theme === theme.id ? 'chosen' : ''}`} aria-pressed={settings.theme === theme.id} disabled={settingsBusy} onClick={() => void saveSettings({ theme: theme.id })}>
                          <span className="theme-swatch" aria-hidden="true" style={{ background: theme.background, color: theme.foreground }}>Aa</span>
                          <span>{theme.label}</span>
                          {settings.theme === theme.id && <Check className="theme-check" aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="eyebrow">Library</h2>
              <div className="setting-row">
                <label htmlFor="default-status">Default saved location</label>
                <select id="default-status" value={settings.defaultStatus} disabled={settingsBusy} onChange={event => void saveSettings({ defaultStatus: event.target.value as 'inbox' | 'library' })}>
                  <option value="inbox">Inbox</option><option value="library">Library</option>
                </select>
              </div>
              {([{ key: 'fetchMetadata', label: 'Automatically fetch metadata' }, { key: 'suggestTags', label: 'Automatically suggest tags' }] as const).map(({ key, label }) => (
                <div className="setting-row" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <Switch.Root id={key} className="switch" checked={settings[key]} disabled={settingsBusy} onCheckedChange={checked => void saveSettings({ [key]: checked })}>
                    <Switch.Thumb className="switch-thumb" />
                  </Switch.Root>
                </div>
              ))}
            </section>
            <section>
              <h2 className="eyebrow">Home screen</h2>
              <p className="install-copy">{installation.installed ? 'Later is running as an app.' : 'Keep Later one tap away, in its own app window.'}</p>
              {!installation.installed && (installation.canInstall
                ? <button className="button" onClick={() => void installation.install().catch(() => notify('Use Chrome’s menu to add Later to your home screen.', true))}>Install Later</button>
                : <p className="install-help">In Chrome on Android, open the menu and choose “Add to Home screen” or “Install app”.</p>)}
            </section>
            <section>
              <h2 className="eyebrow">Data</h2>
              <button className="text-button export-button" disabled={exporting} onClick={() => void exportLibrary()}>{exporting ? 'Preparing export…' : 'Export library'}</button>
              <div className="settings-danger"><button className="text-button danger-text" onClick={() => setDeleteTarget('all')}>Delete all data</button></div>
            </section>
          </div>}
        </div>
        {page === 'inbox' && <Rediscover rail links={rediscovery} loading={shuffling} onSelect={select} onOpen={recordOpen} onShuffle={() => void shuffle()} onSeeAll={() => navigate('rediscover')} />}
      </>;
  }

  if (!inApp) return (
    <div className="login-page">
      <header>
        <a className="wordmark" href="/">Later.</a>
        {ownerUrl && <a className="muted" href={ownerUrl.href} target="_blank" rel="noopener noreferrer">{ownerUrl.hostname} ↗</a>}
      </header>
      <main className="login-content">
        <h1>Your personal<br />internet library.</h1>
        <p>Save interesting things now.<br />Rediscover them when they matter.</p>
        <a className="button primary login-button" href="/app/"><LogIn aria-hidden="true" /> Continue with GitHub</a>
        <span className="private-caption">Private by default.</span>
      </main>
      <div className="login-orbit" aria-hidden="true" />
      <footer>Later is a private personal tool.</footer>
    </div>
  );

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="mobile-header">
      <button className="wordmark" onClick={() => navigate('inbox')}>Later.</button>
      <button ref={menuButton} className="icon-button mobile-menu-button" aria-label={mobileNav ? 'Close navigation' : 'Open navigation'} aria-controls="main-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}>
        {mobileNav ? <X aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
      </button>
    </header>
    <aside id="main-navigation" className={`sidebar ${mobileNav ? 'mobile-open' : ''}`} aria-label="Main navigation">
      <a className="wordmark" href="/app/" onClick={event => { event.preventDefault(); navigate('inbox'); }}>Later.</a>
      <nav>
        {(['inbox', 'library', 'finished', 'rediscover', 'search'] as Page[]).map(item => (
          <a
            key={item}
            className={`nav-item ${page === item ? 'active' : ''} ${item === 'rediscover' ? 'nav-gap' : ''}`}
            href={`/app/${item}`}
            aria-current={page === item ? 'page' : undefined}
            onClick={event => {
              if (!event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                navigate(item);
              }
            }}
          >
            <span>{pageLabels[item]}</span>
            {item in counts && <span className="nav-count">{counts[item as keyof LinkCounts]}</span>}
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <a className={page === 'settings' ? 'current' : ''} href="/app/settings" onClick={event => { event.preventDefault(); navigate('settings'); }}>Settings</a>
        {ownerUrl && <a href={ownerUrl.href} target="_blank" rel="noopener noreferrer">{ownerUrl.hostname} ↗</a>}
        <button className="account-chip" onClick={() => navigate('settings')}><span className="avatar">{accountInitial}</span><span>{accountLabel}</span></button>
      </div>
    </aside>
    <main id="main-content" inert={mobileNav} className={`main-content page-${page} ${page === 'inbox' ? 'with-rail' : ''}`}>
      {renderMainContent()}
    </main>
    <DetailDrawer
      key={selected?.id || 'closed'}
      link={selected}
      edit={edit}
      onClose={closeDetails}
      onPatch={patch}
      onDelete={setDeleteTarget}
      onOpen={recordOpen}
      onRetry={retryMetadata}
    />
    <Confirm
      open={!!deleteTarget}
      title={deleteTarget === 'all' ? 'Delete your entire library?' : 'Delete this link?'}
      typed={deleteTarget === 'all'}
      label={deleteTarget === 'all' ? 'Delete all data' : 'Delete link'}
      busy={deleting}
      onClose={() => setDeleteTarget(null)}
      onConfirm={remove}
    >
      {deleteTarget === 'all'
        ? 'All saved links, notes, tags, and settings will be permanently removed. Export your library first if you want a copy.'
        : <>“{deleteTarget?.title}” and your notes will be permanently removed.</>}
    </Confirm>
    {toast && (
      <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>
        <span>{toast.error ? '!' : '✓'}</span>{toast.text}
        <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X aria-hidden="true" /></button>
      </div>
    )}
  </div>;
}
