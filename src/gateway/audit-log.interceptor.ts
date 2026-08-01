/**
 * AuditLogInterceptor — Records structured JSON audit log entry per tool execution (BUILD_PLAN.md §5.3).
 */
import { Interceptor, InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';
import { AuditStore, AuditEntry } from './audit.store.js';
import * as crypto from 'node:crypto';
import { getExternalCalls } from './request-context.js';

@Interceptor()
@Injectable({ deps: [AuditStore] })
export class AuditLogInterceptor implements InterceptorInterface {
  constructor(private readonly auditStore: AuditStore) {}

  async intercept(context: ExecutionContext, next: () => Promise<any>): Promise<any> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const tool = context.toolName ?? 'unknown_tool';
    const auth = (context as any).auth ?? { subject: 'anonymous', scopes: [] };

    let response: any;
    let status: 'ok' | 'error' = 'ok';
    let errorCode: string | null = null;

    try {
      response = await next();
      return response;
    } catch (err: any) {
      status = 'error';
      errorCode = err?.code ?? err?.name ?? 'UNKNOWN_ERROR';
      throw err;
    } finally {
      const latencyMs = Date.now() - startTime;
      const input = (context as any).input ?? (context as any).args?.[0] ?? {};
      const inputSummary = summarizeInput(input);
      const canonicalInputJson = JSON.stringify(inputSummary);
      const inputHash = crypto
        .createHash('sha256')
        .update(canonicalInputJson)
        .digest('hex')
        .substring(0, 16);
      const emergencyDetected = ((context as any).emergency?.matched_terms?.length ?? 0) > 0;
      const urgencyTier = response?._safety?.urgency_tier ?? 'not_applicable';

      const entry: AuditEntry = {
        ts: new Date().toISOString(),
        request_id: requestId,
        tool,
        subject: auth.subject,
        scopes: auth.scopes,
        input_summary: inputSummary,
        input_hash: inputHash,
        emergency_detected: emergencyDetected,
        urgency_tier: urgencyTier,
        cache_hit: false,
        external_calls: (context as any).external_calls ?? getExternalCalls(),
        latency_ms: latencyMs,
        status,
        error_code: errorCode,
      };

      this.auditStore.addEntry(entry);
      (context as any).audit_recorded = true;
    }
  }
}

/**
 * Produces an audit-safe input summary. Free text is bounded recursively so
 * arrays such as symptoms and medication lists cannot bypass the redaction
 * limit by being nested inside an object.
 */
const SENSITIVE_INPUT_KEYS = new Set([
  '_meta',
  'authorization',
  'x-api-key',
  'apiKey',
  'api_key',
  'token',
  'access_token',
  'jwt',
]);

function summarizeInput(value: unknown, depth = 0): any {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => summarizeInput(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_INPUT_KEYS.has(key))
        .slice(0, 50)
        .map(([key, item]) => [key, summarizeInput(item, depth + 1)]),
    );
  }
  return value;
}
