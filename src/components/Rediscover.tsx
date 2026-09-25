import type { SavedLink } from '../../shared/types';
import { Shuffle } from 'lucide-react';
import { ageLabel, kindLabel } from '../lib/format';
import { Empty, Thumbnail } from './primitives';

interface RediscoverProps {
  links: SavedLink[];
  rail?: boolean;
  loading: boolean;
  onSelect: (link: SavedLink) => void;
  onOpen: (link: SavedLink) => void;
  onShuffle: () => void;
  onSeeAll?: () => void;
}

export default function Rediscover({ links, rail, loading, onSelect, onOpen, onShuffle, onSeeAll }: RediscoverProps) {
  const [featured, ...others] = links;
  return <section className={rail ? 'rediscover-rail' : 'rediscover-page'} aria-label="Rediscover">
    {rail && <>
      <div className="rail-heading">
        <h2>Rediscover</h2>
        <button className="text-button" onClick={onSeeAll}>See all →</button>
      </div>
      <p className="rail-subtitle">Something you might still like.</p>
    </>}
    {featured ? <>
      <article className="rediscover-featured">
        <div className="featured-copy">
          <p className="saved-ago">{rail ? 'You saved this ' : 'YOU SAVED THIS '}{ageLabel(featured.savedAt)}{rail ? '.' : ''}</p>
          <button className="featured-title" onClick={() => onSelect(featured)}>{featured.title}</button>
          {!rail && featured.note && <p className="featured-note">“{featured.note}”</p>}
          <p className="featured-domain">{featured.domain}</p>
        </div>
        <Thumbnail key={featured.id} link={featured} large />
        <a className="button primary featured-open" href={featured.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(featured)}>Open {rail ? '→' : '↗'}</a>
      </article>
      {others.length > 0 && (rail ? (
        <button className="rail-secondary" onClick={() => onSelect(others[0])}>
          <strong>{others[0].title}</strong>
          <span>{others[0].domain} · saved {ageLabel(others[0].savedAt)}</span>
        </button>
      ) : (
        <div className="rediscover-more">
          <h2 className="eyebrow">A few more</h2>
          <div className="rediscover-grid">
            {others.map(link => (
              <button className="rediscover-small" key={link.id} onClick={() => onSelect(link)}>
                <span className="eyebrow">{kindLabel[link.kind]}</span>
                <strong>{link.title}</strong>
                <span className="muted">Saved {ageLabel(link.savedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="button surprise" onClick={onShuffle} disabled={loading}><Shuffle aria-hidden="true" />{loading ? 'Looking through your library…' : 'Surprise me'}</button>
    </> : <Empty title={loading ? 'Looking through your library…' : 'Let a few things linger.'}>Older, unfinished links will find their way here.</Empty>}
  </section>;
}
