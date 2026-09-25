import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Session } from '../shared/types';
import type { Env } from './types';
import { HttpError } from './http';
import { applicationOrigin } from '../shared/site-config';

const keySets = new Map<string, JWTVerifyGetKey>();
export function authConfig(env: Env) {
  const issuer = env.ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !env.ACCESS_AUD || !env.OWNER_EMAIL) throw new HttpError(503, 'Private access has not been configured yet.');
  try {
    applicationOrigin(env.APP_ORIGIN);
  } catch {
    throw new HttpError(503, 'APP_ORIGIN must be configured as the exact HTTPS application origin.');
  }
  return { issuer, audience: env.ACCESS_AUD, email: env.OWNER_EMAIL.trim().toLowerCase() };
}
export async function verifyIdentity(token: string, env: Env, keys: JWTVerifyGetKey): Promise<Session> {
  const { issuer, audience, email } = authConfig(env);
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'email', 'exp', 'iat'],
      clockTolerance: 5,
    });
    if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== email || typeof payload.sub !== 'string' || !payload.sub) throw new Error('Owner mismatch');
    return { name: env.OWNER_NAME || 'Your account', handle: env.OWNER_HANDLE || '', email: payload.email, local: false };
  } catch {
    throw new HttpError(401, 'Your session is missing or expired. Sign in again.');
  }
}
export async function authenticate(request: Request, env: Env): Promise<Session> {
  // Vite substitutes DEV at build time. Production contains no local bypass.
  if (import.meta.env?.DEV === true && env.LOCAL_DEV === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) {
    return { name: env.OWNER_NAME || 'Local developer', handle: env.OWNER_HANDLE || 'local', email: 'local@localhost', local: true };
  }
  const { issuer } = authConfig(env);
  if (new URL(request.url).origin !== env.APP_ORIGIN) throw new HttpError(403, 'Use the private application hostname.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16_384) throw new HttpError(401, 'Your session is missing or expired. Sign in again.');
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000, cooldownDuration: 30_000 });
    keySets.set(issuer, keys);
  }
  return verifyIdentity(token, env, keys);
}
export function requireSameOrigin(request: Request, env: Env, session: Session) {
  const origin = request.headers.get('Origin');
  const expected = session.local ? new URL(request.url).origin : env.APP_ORIGIN;
  const site = request.headers.get('Sec-Fetch-Site');
  if (!origin || origin !== expected || origin !== new URL(request.url).origin || (site && site !== 'same-origin')) throw new HttpError(403, 'This action must come from Later.');
}
