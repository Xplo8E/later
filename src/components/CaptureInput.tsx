import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { api, ApiError, type PreviewResult } from '../lib/api';
import { validUrl } from '../lib/format';
import type { SavedLink } from '../../shared/types';
import type { CaptureDraft } from '../lib/share';

interface CaptureInputProps {
  fetchMetadata: boolean;
  defaultStatus: 'inbox' | 'library';
  onSaved: (link: SavedLink) => void;
  onDuplicate: (id: string) => void;
  /** Initial shared content, mounted only after authentication. */
  initialDraft?: CaptureDraft;
  /** Retain edits in memory if the session expires during capture. */
  onDraftChange?: (draft: CaptureDraft) => void;
  onCancel?: () => void;
}

export default function CaptureInput({ fetchMetadata, defaultStatus, onSaved, onDuplicate, initialDraft, onDraftChange, onCancel }: CaptureInputProps) {
  // Seed the fields on mount; later parent renders must not overwrite in-progress edits.
  const [url, setUrl] = useState(initialDraft?.url || '');
  const [note, setNote] = useState(initialDraft?.note || '');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const expanded = validUrl(url);

  useEffect(() => {
    // Reset feedback even when this URL is invalid or metadata fetching is disabled.
    setPreview(null);
    setPreviewState('idle');
    setError('');
    setDuplicateId(undefined);

    if (!expanded || !fetchMetadata) return;

    const controller = new AbortController();
    // Wait for typing to pause before requesting a preview.
    const timer = setTimeout(() => {
      setPreviewState('loading');
      api.preview(url.trim(), controller.signal)
        .then(result => {
          // Cleanup can run while the request is settling; ignore stale results.
          if (controller.signal.aborted) return;
          setPreview(result);
          setPreviewState('ready');
        })
        .catch(() => {
          // An intentional cancellation is not a failed preview for the current URL.
          if (controller.signal.aborted) return;
          setPreviewState('failed');
        });
    }, 650);

    return () => {
      // Cover both a pending debounce and a request that has already started.
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, expanded, fetchMetadata]);

  function reset() {
    setUrl('');
    setNote('');
    setError('');
    setDuplicateId(undefined);
    input.current?.focus();
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextUrl = event.target.value;
    setUrl(nextUrl);
    onDraftChange?.({ url: nextUrl, note });
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextNote = event.target.value;
    setNote(nextNote);
    onDraftChange?.({ url, note: nextNote });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!validUrl(url)) {
      setError('Enter a complete http:// or https:// URL.');
      input.current?.focus();
      return;
    }

    setSaving(true);
    setError('');
    try {
      // Saving is independent of preview success, so metadata failure cannot block capture.
      const link = await api.create(url.trim(), note.trim());
      // Reset and restore focus before the parent handles the saved item (or navigates away).
      reset();
      onSaved(link);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this link. Try again.');
      if (error instanceof ApiError) {
        setDuplicateId(error.details?.existingId);
      }
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = expanded ? preview?.title || new URL(url.trim()).hostname : '';
  let previewMessage = preview?.domain || 'Ready to save.';
  if (previewState === 'loading') {
    previewMessage = 'Fetching preview…';
  } else if (previewState === 'failed') {
    previewMessage = 'Preview unavailable. You can still save this link.';
  }
  // This prop labels the destination; the create API applies the saved server-side setting.
  const destinationLabel = defaultStatus === 'library' ? 'Library' : 'Inbox';
  const saveLabel = saving ? 'Saving…' : `Save to ${destinationLabel} →`;

  return (
    <form className={`capture ${expanded ? 'expanded' : ''}`} onSubmit={event => void save(event)} noValidate>
      <div className="capture-line">
        <span className="capture-symbol" aria-hidden="true"><Link2 /></span>
        <input
          ref={input}
          aria-label="URL to save"
          aria-describedby={error ? 'capture-error' : undefined}
          type="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a URL…"
          value={url}
          maxLength={4096}
          disabled={saving}
          onChange={handleUrlChange}
        />
        {!expanded && <button type="submit" className="button primary small" disabled={saving}>Save →</button>}
      </div>
      {expanded && (
        <div className="capture-details">
          <div className="capture-preview" aria-live="polite">
            <strong>{previewTitle}</strong>
            <span>{previewMessage}</span>
          </div>
          <label className="field-label" htmlFor="capture-note">Why did you save this? <span>Optional</span></label>
          <textarea
            id="capture-note"
            placeholder="A little context for later…"
            value={note}
            maxLength={4000}
            onChange={handleNoteChange}
            disabled={saving}
            rows={2}
          />
          <div className="capture-actions">
            <button type="button" className="text-button" onClick={onCancel || reset} disabled={saving}>Cancel</button>
            <button type="submit" className="button primary" disabled={saving}>{saveLabel}</button>
          </div>
        </div>
      )}
      {error && (
        <div className="capture-error" id="capture-error" role="alert">
          {error}
          {duplicateId && <button type="button" className="text-button" onClick={() => onDuplicate(duplicateId)}>View saved link →</button>}
        </div>
      )}
    </form>
  );
}
