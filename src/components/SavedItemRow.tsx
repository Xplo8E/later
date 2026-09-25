import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, MoreHorizontal } from 'lucide-react';
import type { SavedLink, LinkPatch } from '../../shared/types';
import { dateLabel } from '../lib/format';
import { Thumbnail, Tag } from './primitives';

interface SavedItemRowProps {
  link: SavedLink;
  selected: boolean;
  compact?: boolean;
  onSelect: (link: SavedLink) => void;
  onPatch: (id: string, patch: LinkPatch) => Promise<void>;
  onDelete: (link: SavedLink) => void;
  onEdit: (link: SavedLink, field: 'note' | 'tags') => void;
}

export default function SavedItemRow({ link, selected, compact, onSelect, onPatch, onDelete, onEdit }: SavedItemRowProps) {
  return <article className={`saved-row ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}>
    <button className="row-main" onClick={() => onSelect(link)} aria-label={`View ${link.title}`}>
      <Thumbnail link={link} />
      <span className="row-copy">
        <span className="row-title">{link.status === 'finished' && <span className="finished-check" aria-hidden="true"><Check /></span>}{link.title}</span>
        <span className="row-source">{link.domain}{link.readingMinutes ? ` · ${link.readingMinutes} min` : ''}</span>
        {!compact && (link.status === 'finished'
          ? <span className="row-note">Finished {dateLabel(link.finishedAt || link.savedAt)}</span>
          : link.note && <span className="row-note">{link.note}</span>)}
        {link.metadataStatus === 'pending' && <span className="row-state">Fetching preview…</span>}
      </span>
    </button>
    {link.tags[0] && <div className="row-tag"><Tag>{link.tags[0]}</Tag></div>}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="row-menu icon-button" aria-label={`Actions for ${link.title}`}><MoreHorizontal aria-hidden="true" /></button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown" align="end" sideOffset={5}>
          <DropdownMenu.Item onSelect={() => onSelect(link)}>View details</DropdownMenu.Item>
          {link.status !== 'finished' && <DropdownMenu.Item onSelect={() => void onPatch(link.id, { status: 'finished' })}>Mark finished</DropdownMenu.Item>}
          {link.status !== 'library' && <DropdownMenu.Item onSelect={() => void onPatch(link.id, { status: 'library' })}>Move to Library</DropdownMenu.Item>}
          {link.status !== 'inbox' && <DropdownMenu.Item onSelect={() => void onPatch(link.id, { status: 'inbox' })}>Move to Inbox</DropdownMenu.Item>}
          <DropdownMenu.Item onSelect={() => onEdit(link, 'note')}>Edit note</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onEdit(link, 'tags')}>Edit tags</DropdownMenu.Item>
          {link.status !== 'archived' && <DropdownMenu.Item onSelect={() => void onPatch(link.id, { status: 'archived' })}>Archive</DropdownMenu.Item>}
          <DropdownMenu.Separator />
          <DropdownMenu.Item className="danger-text" onSelect={() => onDelete(link)}>Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </article>;
}
