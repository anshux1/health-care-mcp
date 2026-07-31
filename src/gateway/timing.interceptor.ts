/**
 * TimingInterceptor — Appends _meta.durationMs performance metadata and feeds MetricsStore (BUILD_PLAN.md §3.1 & §13-S8).
 */
import { InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';
import { MetricsStore } from './metrics.store.js';

@Injectable({ deps: [MetricsStore] })
export class TimingInterceptor implements InterceptorInterface {
  constructor(private readonly metricsStore: MetricsStore) {}

  async intercept(context: ExecutionContext, next: () => Promise<any>): Promise<any> {
    const startTime = Date.now();
    let isError = false;
    let result: any;

    try {
      result = await next();
    } catch (err) {
      isError = true;
      const durationMs = Date.now() - startTime;
      this.metricsStore.recordRequest(context.toolName ?? 'unknown', durationMs, true);
      throw err;
    }

    const durationMs = Date.now() - startTime;
    this.metricsStore.recordRequest(context.toolName ?? 'unknown', durationMs, isError);

    if (result && typeof result === 'object') {
      result._meta = {
        ...(result._meta ?? {}),
        durationMs,
      };
    }

    return result;
  }
}
