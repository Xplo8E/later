import type { LinkPatch, ListResult, SavedLink, Session, Settings } from '../../shared/types';
import { apiResponse, ApiError } from './transport';
export { ApiError } from './transport';
export interface LinkQuery { status?: string; q?: string; tag?: string; cursor?: string }
export interface PreviewResult { title: string; description: string; domain: string; imageUrl: string | null }

async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiResponse(path, { method, signal, headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError('Your session expired. Sign in again.', 401);
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || 'Could not complete this request.', response.status, result);
  return result as T;
}

export const api = {
  session: () => request<Session>('/api/session'),
  settings: () => request<Settings>('/api/settings'),
  saveSettings: (patch: Partial<Settings>) => request<Settings>('/api/settings', 'PATCH', patch),
  list(query: LinkQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    return request<ListResult>(`/api/links?${params}`, 'GET', undefined, signal);
  },
  get: (id: string) => request<SavedLink>(`/api/links/${encodeURIComponent(id)}`),
  create: (url: string, note: string) => request<SavedLink>('/api/links', 'POST', { url, note }),
  patch: (id: string, patch: LinkPatch) => request<SavedLink>(`/api/links/${encodeURIComponent(id)}`, 'PATCH', patch),
  remove: (id: string) => request(`/api/links/${encodeURIComponent(id)}`, 'DELETE', {}),
  open: (id: string) => request(`/api/links/${encodeURIComponent(id)}/open`, 'POST', {}),
  rediscover: () => request<SavedLink[]>('/api/rediscover'),
  preview: (url: string, signal?: AbortSignal) => request<PreviewResult>('/api/preview', 'POST', { url }, signal),
  retryMetadata: (id: string) => request(`/api/links/${encodeURIComponent(id)}/metadata`, 'POST', {}),
  async exportLibrary(): Promise<Blob> {
    const response = await apiResponse('/api/export', { headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new ApiError('Could not export your library. Try signing in again.', response.status);
    return response.blob();
  },
  deleteAll: () => request('/api/data', 'DELETE', { confirmation: 'DELETE ALL' }),
};
