/**
 * AuditLogInterceptor — Records structured JSON audit log entry per tool execution (BUILD_PLAN.md §5.3).
 */
import { InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';
import { AuditStore, AuditEntry } from './audit.store.js';
import * as crypto from 'node:crypto';

@Injectable({ deps: [AuditStore] })
export class AuditLogInterceptor implements InterceptorInterface {
  constructor(private readonly auditStore: AuditStore) {}

  async intercept(context: ExecutionContext, next: () => Promise<any>): Promise<any> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const tool = context.toolName ?? 'unknown_tool';
    const auth = (context as any).auth ?? { subject: 'anonymous', scopes: [] };
    const input = (context as any).args?.[0] ?? (context as any).input ?? {};

    const inputSummary: Record<string, any> = {};
    if (typeof input === 'object' && input !== null) {
      for (const [k, v] of Object.entries(input)) {
        if (typeof v === 'string') {
          inputSummary[k] = v.length > 80 ? v.substring(0, 80) + '...' : v;
        } else {
          inputSummary[k] = v;
        }
      }
    }

    const canonicalInputJson = JSON.stringify(inputSummary);
    const inputHash = crypto.createHash('sha256').update(canonicalInputJson).digest('hex').substring(0, 16);

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
        external_calls: [],
        latency_ms: latencyMs,
        status,
        error_code: errorCode,
      };

      this.auditStore.addEntry(entry);
    }
  }
}
