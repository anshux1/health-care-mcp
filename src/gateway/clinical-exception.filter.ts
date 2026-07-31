/**
 * ClinicalExceptionFilter — Catches errors and maps to safe JSON responses (BUILD_PLAN.md §3.1 & §3.4).
 * Prevents stack trace leakage and provides consistent error schema.
 */
import { ExceptionFilterInterface, ExecutionContext, Injectable } from '@nitrostack/core';

@Injectable()
export class ClinicalExceptionFilter implements ExceptionFilterInterface {
  async catch(error: any, context: ExecutionContext): Promise<any> {
    const rawMessage = error?.message ?? String(error);

    let code = 'INTERNAL_ERROR';
    let safeMessage = 'An unexpected internal error occurred. Please try again later.';

    if (rawMessage.startsWith('AUTH_DENIED:')) {
      code = 'AUTH_DENIED';
      safeMessage = rawMessage.replace('AUTH_DENIED:', '').trim();
    } else if (rawMessage.startsWith('SCOPE_DENIED:')) {
      code = 'SCOPE_DENIED';
      safeMessage = rawMessage.replace('SCOPE_DENIED:', '').trim();
    } else if (rawMessage.includes('UPSTREAM') || error?.name === 'UpstreamError') {
      code = 'UPSTREAM_UNAVAILABLE';
      safeMessage = 'An external clinical data service is temporarily unavailable or timed out.';
    } else if (error?.name === 'ZodError' || rawMessage.includes('validation')) {
      code = 'VALIDATION_ERROR';
      safeMessage = 'The request parameters did not match the required tool input schema.';
    } else {
      safeMessage = rawMessage;
    }

    if (context.logger) {
      context.logger.error('Tool execution exception caught', {
        tool: context.toolName,
        code,
        error: rawMessage,
      });
    }

    return {
      error: true,
      code,
      message: safeMessage,
      _safety: {
        disclaimer: 'For informational purposes only. Not medical advice.',
        urgency_tier: 'not_applicable',
        red_flags_detected: [],
        synthetic_data: false,
      },
    };
  }
}
