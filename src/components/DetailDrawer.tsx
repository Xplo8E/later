import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { LinkPatch, SavedLink } from '../../shared/types';
import { dateLabel, kindLabel } from '../lib/format';
import { Thumbnail, Tag } from './primitives';

type EditField = 'note' | 'tags' | 'title';

interface DetailDrawerProps {
  link: SavedLink | null;
  edit: 'note' | 'tags' | null;
  onClose: () => void;
  onPatch: (id: string, patch: LinkPatch) => Promise<void>;
  onDelete: (link: SavedLink) => void;
  onOpen: (link: SavedLink) => void;
  onRetry: (link: SavedLink) => void;
}

export default function DetailDrawer({ link, edit, onClose, onPatch, onDelete, onOpen, onRetry }: DetailDrawerProps) {
  const [editing, setEditing] = useState<EditField | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editInput = useRef<HTMLTextAreaElement>(null);

  function startEdit(field: EditField) {
    if (!link) return;
    setEditing(field);
    setError('');
    setValue(field === 'tags' ? link.tags.join(', ') : link[field]);
  }

  useEffect(() => {
    // Reinitialize only for a new selection or requested editor, not a refreshed link object.
    // Depending on the whole link would overwrite unsaved edits after background updates.
    setEditing(edit);
    setError('');

    let initialValue = '';
    if (link && edit) {
      initialValue = edit === 'tags' ? link.tags.join(', ') : link.note;
    }
    setValue(initialValue);
  }, [link?.id, edit]);

  useEffect(() => {
    if (editing) editInput.current?.focus();
  }, [editing]);

  async function save() {
    if (!link || !editing) return;
    setBusy(true);
    setError('');
    try {
      let patch: LinkPatch;
      if (editing === 'tags') {
        const tags = value.split(',').map(tag => tag.trim()).filter(Boolean);
        patch = { tags };
      } else {
        patch = { [editing]: value.trim() };
      }
      await onPatch(link.id, patch);
      // Leave the editor open on failure so the draft can be corrected or retried.
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function move(status: SavedLink['status']) {
    if (!link) return;
    setBusy(true);
    setError('');
    try {
      await onPatch(link.id, { status });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update this link.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleOpenAutoFocus(event: Event) {
    // Override the dialog's default focus only when the parent requested an editor.
    if (edit && editInput.current) {
      event.preventDefault();
      editInput.current.focus();
    }
  }

  function handleActionsCloseAutoFocus(event: Event) {
    // When an editor exists, closing Actions should focus it instead of the menu trigger.
    if (editInput.current) {
      event.preventDefault();
      editInput.current.focus();
    }
  }

  let editorLabel = 'Edit your note';
  if (editing === 'tags') {
    editorLabel = 'Tags, separated by commas';
  } else if (editing === 'title') {
    editorLabel = 'Title';
  }

  let openHistoryLabel = 'Not opened yet';
  if (link && link.openCount !== 0) {
    const timesLabel = link.openCount === 1 ? 'time' : 'times';
    openHistoryLabel = `Opened ${link.openCount} ${timesLabel}`;
  }

  return (
    <Dialog.Root open={!!link} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className={`detail-drawer ${editing ? 'is-editing' : ''}`}
          aria-describedby="detail-description"
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          {link && <>
            <div className="drawer-topbar">
              <span className="eyebrow">{editing ? `Edit ${editing}` : kindLabel[link.kind]}</span>
              <Dialog.Close asChild>
                <button className="icon-button drawer-close" aria-label="Close details"><X aria-hidden="true" /></button>
              </Dialog.Close>
            </div>
            <div className="drawer-body">
              <Dialog.Title className="drawer-title">{link.title}</Dialog.Title>
              <Dialog.Description id="detail-description" className="drawer-source">{link.domain}</Dialog.Description>
              <Thumbnail key={link.id} link={link} large />
              <section className="drawer-section">
                <h3 className="eyebrow">My note</h3>
                <p className={link.note ? '' : 'muted'}>{link.note || 'A little context for your future self.'}</p>
              </section>
              <section className="drawer-section">
                <h3 className="eyebrow">Tags</h3>
                <div className="tags">
                  {link.tags.length ? link.tags.map(tag => <Tag key={tag}>{tag}</Tag>) : <span className="muted">No tags yet.</span>}
                </div>
              </section>
              {editing && (
                <form id="detail-editor" className="drawer-editor" onSubmit={handleSubmit}>
                  <label className="field-label">
                    {editorLabel}
                    <textarea
                      ref={editInput}
                      value={value}
                      onChange={event => setValue(event.target.value)}
                      disabled={busy}
                      maxLength={editing === 'note' ? 4000 : 500}
                      rows={editing === 'note' ? 4 : 2}
                    />
                  </label>
                  {error && <p role="alert" className="danger-text">{error}</p>}
                  <div className="dialog-actions drawer-editor-actions">
                    <button className="text-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                    <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                  </div>
                </form>
              )}
              <div className="drawer-facts">
                <div className="drawer-dates">
                  <p>Saved {dateLabel(link.savedAt)}</p>
                  <p>{openHistoryLabel}</p>
                </div>
                {link.metadataStatus === 'pending' && <p>Fetching preview…</p>}
                {link.metadataStatus === 'failed' && (
                  <p className="drawer-preview-failure">
                    Preview unavailable. <button className="text-button" onClick={() => onRetry(link)}>Try again</button>
                  </p>
                )}
              </div>
              <div className="drawer-desktop-actions">
                <a className="button primary full" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(link)}>Open original ↗</a>
                {error && !editing && <p role="alert" className="danger-text">{error}</p>}
                <div className="drawer-actions">
                  {link.status !== 'library' && <button disabled={busy} onClick={() => void move('library')}>Move to Library</button>}
                  {link.status !== 'finished' && <button disabled={busy} onClick={() => void move('finished')}>Mark finished</button>}
                  {link.status !== 'inbox' && <button disabled={busy} onClick={() => void move('inbox')}>Move to Inbox</button>}
                  <button disabled={busy} onClick={() => startEdit('note')}>Edit note</button>
                  <button disabled={busy} onClick={() => startEdit('tags')}>Edit tags</button>
                  <button disabled={busy} onClick={() => startEdit('title')}>Edit title</button>
                  {link.status !== 'archived' && <button disabled={busy} onClick={() => void move('archived')}>Archive</button>}
                </div>
                <div className="drawer-danger">
                  <button className="text-button danger-text" disabled={busy} onClick={() => onDelete(link)}>Delete link</button>
                </div>
              </div>
              {error && !editing && <p role="alert" className="danger-text drawer-mobile-error">{error}</p>}
            </div>
            {/* Keep mobile controls outside the scrolling body; Save targets the editor form above. */}
            <div className="drawer-mobile-footer">
              {editing ? <>
                <button className="button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                <button className="button primary" type="submit" form="detail-editor" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              </> : <>
                <a className="button primary" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(link)}>Open original ↗</a>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="button drawer-more" aria-label="Link actions" disabled={busy}>Actions <ChevronDown aria-hidden="true" /></button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="dropdown drawer-menu"
                      align="end"
                      side="top"
                      sideOffset={8}
                      collisionPadding={12}
                      onCloseAutoFocus={handleActionsCloseAutoFocus}
                    >
                      <DropdownMenu.Item onSelect={() => startEdit('note')}>Edit note</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => startEdit('tags')}>Edit tags</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => startEdit('title')}>Edit title</DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      {link.status !== 'library' && <DropdownMenu.Item onSelect={() => void move('library')}>Move to Library</DropdownMenu.Item>}
                      {link.status !== 'finished' && <DropdownMenu.Item onSelect={() => void move('finished')}>Mark finished</DropdownMenu.Item>}
                      {link.status !== 'inbox' && <DropdownMenu.Item onSelect={() => void move('inbox')}>Move to Inbox</DropdownMenu.Item>}
                      {link.status !== 'archived' && <DropdownMenu.Item onSelect={() => void move('archived')}>Archive</DropdownMenu.Item>}
                      {link.metadataStatus === 'failed' && <DropdownMenu.Item onSelect={() => onRetry(link)}>Retry preview</DropdownMenu.Item>}
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item className="danger-text" onSelect={() => onDelete(link)}>Delete link</DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>}
            </div>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
