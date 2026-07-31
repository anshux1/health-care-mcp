/**
 * TimingInterceptor — Appends _meta.durationMs performance metadata to responses (BUILD_PLAN.md §3.1).
 */
import { InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';

@Injectable()
export class TimingInterceptor implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: () => Promise<any>): Promise<any> {
    const startTime = Date.now();
    const result = await next();

    if (result && typeof result === 'object') {
      const durationMs = Date.now() - startTime;
      result._meta = {
        ...(result._meta ?? {}),
        durationMs,
      };
    }

    return result;
  }
}
