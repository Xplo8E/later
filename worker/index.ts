import type { Env } from './types';
import { authenticate } from './auth';
import { handleApi } from './api';
import { HttpError, json, securityHeaders } from './http';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    const privateRoute = path === '/api' || path.startsWith('/api/') || path === '/app' || path.startsWith('/app/');
    const development = import.meta.env?.DEV === true;
    try {
      if (privateRoute) {
        const session = await authenticate(request, env);
        if (path === '/api' || path.startsWith('/api/')) return securityHeaders(await handleApi(request, env, ctx, session), development);
      }
      const response = await env.ASSETS.fetch(request);
      const secured = securityHeaders(response, development);
      if (privateRoute) secured.headers.set('Cache-Control', 'no-store');
      return secured;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Something went wrong. Please try again.';
      const response = json({ error: message, ...(error instanceof HttpError && error.details ? error.details : {}) }, status);
      if (status === 429) response.headers.set('Retry-After', '60');
      return securityHeaders(response, development);
    }
  },
} satisfies ExportedHandler<Env>;
