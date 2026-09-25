import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Bookmark, CodeXml, FileText, Play } from 'lucide-react';
import type { SavedLink } from '../../shared/types';

export function Thumbnail({ link, large = false }: { link: SavedLink; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  // A replacement preview should get its own load attempt after a previous image failed.
  useEffect(() => setFailed(false), [link.imageUrl]);

  let content = <FileText />;
  if (link.imageUrl && !failed) {
    content = <img src={link.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  } else if (link.kind === 'video') {
    content = <Play />;
  } else if (link.kind === 'repository') {
    content = <CodeXml />;
  }
  return <span className={`thumbnail ${large ? 'thumbnail-large' : ''} thumbnail-${link.kind}`} aria-hidden="true">
    {content}
  </span>;
}
export function Tag({ children }: { children: ReactNode }) { return <span className="tag">{children}</span>; }
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true"><Bookmark /></span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  children: ReactNode;
  label?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  typed?: boolean;
}

export function Confirm({ open, title, children, label = 'Delete', busy, onClose, onConfirm, typed = false }: ConfirmProps) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  function handleOpenChange(next: boolean) {
    // Keep the confirmation visible while deletion is in flight.
    if (!next && !busy) {
      setValue('');
      onClose();
    }
  }
  const confirmDisabled = busy || (typed && value !== 'DELETE ALL');

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-overlay" />
        <AlertDialog.Content className="confirm-dialog">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild><div className="confirm-description">{children}</div></AlertDialog.Description>
          {typed && (
            <label className="field-label">
              Type DELETE ALL to confirm<input autoComplete="off" value={value} onChange={event => setValue(event.target.value)} className="text-input" />
            </label>
          )}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild><button className="button" disabled={busy}>Cancel</button></AlertDialog.Cancel>
            <button className="button destructive" disabled={confirmDisabled} onClick={() => { void onConfirm(); }}>{busy ? 'Deleting…' : label}</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
