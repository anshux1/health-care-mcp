/**
 * ApiKeyGuard — Authenticates incoming MCP requests via x-api-key header or auth metadata (BUILD_PLAN.md §5.1).
 * Populates context.auth = { subject, scopes }.
 */
import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { env } from '../config/env.js';

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
    const apiKey =
      reqHeaders['x-api-key'] ??
      (context as any).authKey ??
      context.metadata?.['x-api-key'];

    let authInfo: { subject: string; scopes: string[] } | undefined;

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

    if (!authInfo && env.VITALIS_ALLOW_ANONYMOUS_DEMO) {
      authInfo = {
        subject: 'anonymous_demo',
        scopes: ['triage:read', 'drugs:read', 'dx:read', 'research:read', 'fhir:read', 'care:read'],
      };
    }

    if (!authInfo) {
      throw new Error('AUTH_DENIED: Invalid or missing x-api-key header.');
    }

    (context as any).auth = authInfo;
    return true;
  }
}
