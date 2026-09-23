export const SESSION_EXPIRED = 'later:session-expired';

export class ApiError extends Error {
  constructor(message: string, public status = 400, public details?: { existingId?: string }) { super(message); }
}

export async function apiResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(15_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    const response = await fetch(path, { ...init, signal, credentials: 'same-origin', redirect: 'manual', cache: 'no-store' });
    if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED));
      throw new ApiError('Your session expired or access was denied. Sign in again.', 401);
    }
    return response;
  } catch (error) {
    if (timeout.aborted && !init.signal?.aborted) throw new ApiError('The request timed out. Check your connection and try again.', 408);
    throw error;
  }
}
