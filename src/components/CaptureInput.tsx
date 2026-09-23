import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { api, ApiError, type PreviewResult } from '../lib/api';
import { validUrl } from '../lib/format';
import type { SavedLink } from '../../shared/types';

export default function CaptureInput({ fetchMetadata, defaultStatus, onSaved, onDuplicate }: { fetchMetadata: boolean; defaultStatus: 'inbox' | 'library'; onSaved: (link: SavedLink) => void; onDuplicate: (id: string) => void }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const expanded = validUrl(url);

  useEffect(() => {
    setPreview(null); setPreviewState('idle'); setError(''); setDuplicateId(undefined);
    if (!expanded || !fetchMetadata) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewState('loading');
      api.preview(url.trim(), controller.signal).then(result => { if (!controller.signal.aborted) { setPreview(result); setPreviewState('ready'); } }).catch(() => { if (!controller.signal.aborted) setPreviewState('failed'); });
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [url, expanded, fetchMetadata]);

  const reset = () => { setUrl(''); setNote(''); setError(''); setDuplicateId(undefined); input.current?.focus(); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validUrl(url)) { setError('Enter a complete http:// or https:// URL.'); input.current?.focus(); return; }
    setSaving(true); setError('');
    try { const link = await api.create(url.trim(), note.trim()); reset(); onSaved(link); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save this link. Try again.'); if (error instanceof ApiError) setDuplicateId(error.details?.existingId); }
    finally { setSaving(false); }
  };
  return <form className={`capture ${expanded ? 'expanded' : ''}`} onSubmit={event => void save(event)} noValidate>
    <div className="capture-line"><span className="capture-symbol" aria-hidden="true"><Link2 /></span>
      <input ref={input} aria-label="URL to save" aria-describedby={error ? 'capture-error' : undefined} type="url" autoComplete="off" spellCheck={false} placeholder="Paste a URL…" value={url} maxLength={4096} disabled={saving} onChange={event => setUrl(event.target.value)} />
      {!expanded && <button type="submit" className="button primary small" disabled={saving}>Save →</button>}
    </div>
    {expanded && <div className="capture-details">
      <div className="capture-preview" aria-live="polite"><strong>{preview?.title || new URL(url.trim()).hostname}</strong><span>{previewState === 'loading' ? 'Fetching preview…' : previewState === 'failed' ? 'Preview unavailable. You can still save this link.' : preview?.domain || 'Ready to save.'}</span></div>
      <label className="field-label" htmlFor="capture-note">Why did you save this? <span>Optional</span></label>
      <textarea id="capture-note" placeholder="A little context for later…" value={note} maxLength={4000} onChange={event => setNote(event.target.value)} disabled={saving} rows={2} />
      <div className="capture-actions"><button type="button" className="text-button" onClick={reset} disabled={saving}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : `Save to ${defaultStatus === 'library' ? 'Library' : 'Inbox'} →`}</button></div>
    </div>}
    {error && <div className="capture-error" id="capture-error" role="alert">{error}{duplicateId && <button type="button" className="text-button" onClick={() => onDuplicate(duplicateId)}>View saved link →</button>}</div>}
  </form>;
}
