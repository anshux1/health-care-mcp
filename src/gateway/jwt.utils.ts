/**
 * Native HS256 JWT Utility — Signs and verifies JWT tokens using node:crypto (BUILD_PLAN.md §13-S1).
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  scopes: string[];
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string | Buffer): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function configuredSecret(override?: string): string {
  const secret = override ?? env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required before signing or verifying JWTs.');
  }
  return secret;
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresInSeconds: number = 3600,
  secretOverride?: string,
): string {
  const secret = configuredSecret(secretOverride);
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function verifyJwt(token: string, secretOverride?: string): JwtPayload | null {
  try {
    const secret = configuredSecret(secretOverride);
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const expectedSignature = base64UrlEncode(
      crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest(),
    );
    const expectedBytes = Buffer.from(expectedSignature);
    const actualBytes = Buffer.from(encodedSignature);
    if (
      expectedBytes.length !== actualBytes.length ||
      !crypto.timingSafeEqual(expectedBytes, actualBytes)
    ) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<JwtPayload>;
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      !Array.isArray(payload.scopes) ||
      payload.scopes.some((scope) => typeof scope !== 'string') ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) return null;

    return payload as JwtPayload;
  } catch {
    return null;
  }
}
