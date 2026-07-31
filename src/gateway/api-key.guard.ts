/**
 * ApiKeyGuard — Authenticates incoming MCP requests via x-api-key header, Authorization Bearer JWT, or auth metadata (BUILD_PLAN.md §5.1 & §13-S1).
 * Populates context.auth = { subject, scopes }.
 */
import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { env } from '../config/env.js';
import { verifyJwt } from './jwt.utils.js';

export interface AuthContext {
  subject: string;
  scopes: string[];
}

const DEFAULT_KEYS: Record<string, { subject: string; scopes: string[] }> = {
  vk_live_clinician_demo_key_01: {
    subject: 'clinician_demo',
    scopes: ['triage:read', 'drugs:read', 'dx:read', 'research:read', 'fhir:read', 'care:read', 'care:write'],
  },
  vk_live_readonly_demo_key_02: {
    subject: 'readonly_demo',
    scopes: ['triage:read', 'drugs:read', 'dx:read', 'research:read', 'fhir:read'],
  },
  vk_live_admin_demo_key_03: {
    subject: 'admin_demo',
    scopes: ['*'],
  },
};

@Injectable()
export class ApiKeyGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reqHeaders = (context as any).headers ?? (context as any).req?.headers ?? {};
    
    // 1. Check Authorization Bearer JWT token or x-jwt-token
    const authHeader = reqHeaders['authorization'] ?? reqHeaders['Authorization'];
    const jwtHeaderToken = reqHeaders['x-jwt-token'] ?? context.metadata?.['x-jwt-token'];

    let bearerToken: string | undefined;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      bearerToken = authHeader.substring(7).trim();
    } else if (typeof jwtHeaderToken === 'string') {
      bearerToken = jwtHeaderToken.trim();
    }

    let authInfo: { subject: string; scopes: string[] } | undefined;

    if (bearerToken) {
      const payload = verifyJwt(bearerToken);
      if (payload) {
        authInfo = {
          subject: payload.sub,
          scopes: payload.scopes,
        };
      }
    }

    // 2. Check x-api-key header if JWT not present or invalid
    if (!authInfo) {
      const apiKey =
        reqHeaders['x-api-key'] ??
        (context as any).authKey ??
        context.metadata?.['x-api-key'];

      if (apiKey && typeof apiKey === 'string') {
        if (apiKey === env.API_KEY_CLINICIAN) {
          authInfo = DEFAULT_KEYS.vk_live_clinician_demo_key_01;
        } else if (apiKey === env.API_KEY_READONLY) {
          authInfo = DEFAULT_KEYS.vk_live_readonly_demo_key_02;
        } else if (apiKey === env.API_KEY_ADMIN) {
          authInfo = DEFAULT_KEYS.vk_live_admin_demo_key_03;
        } else if (DEFAULT_KEYS[apiKey]) {
          authInfo = DEFAULT_KEYS[apiKey];
        }
      }
    }

    // 3. Fallback to anonymous demo mode if enabled
    if (!authInfo && env.VITALIS_ALLOW_ANONYMOUS_DEMO) {
      authInfo = {
        subject: 'anonymous_demo',
        scopes: ['triage:read', 'drugs:read', 'dx:read', 'research:read', 'fhir:read', 'care:read'],
      };
    }

    if (!authInfo) {
      throw new Error('AUTH_DENIED: Invalid or missing authentication credential (x-api-key or Bearer JWT required).');
    }

    (context as any).auth = authInfo;
    return true;
  }
}
