/**
 * ClinicalSafetyInterceptor — Interceptor enforcing clinical safety (BUILD_PLAN.md §6.3).
 * Post-processes output: overreach rewrite, urgency escalation, disclaimer injection, synthetic-data stamp.
 * Can be toggled off via VITALIS_SAFETY_LAYER=off for demo comparison.
 */
import { InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';
import { rewriteBannedPhrases } from './banned-phrases.js';
import { env } from '../config/env.js';

@Injectable()
export class ClinicalSafetyInterceptor implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: () => Promise<any>): Promise<any> {
    const response = await next();

    // If safety layer is disabled via env, return response as-is (demo mode)
    if (env.VITALIS_SAFETY_LAYER === 'off') {
      return response;
    }

    if (!response || typeof response !== 'object') {
      return response;
    }

    // 1. Overreach rewrite on all string fields
    const sanitizedResponse = rewriteBannedPhrases(response);

    // 2. Extract or create _safety envelope
    const existingSafety = sanitizedResponse._safety ?? {};
    const emergencyContext = (context as any).emergency;
    const matchedEmergencyTerms: string[] = emergencyContext?.matched_terms ?? [];

    let urgencyTier = existingSafety.urgency_tier ?? 'not_applicable';
    const redFlagsDetected: string[] = [...(existingSafety.red_flags_detected ?? [])];

    // 3. Urgency Escalation if Emergency Detection Guard matched red-flag terms
    if (matchedEmergencyTerms.length > 0) {
      urgencyTier = 'emergency';
      for (const term of matchedEmergencyTerms) {
        if (!redFlagsDetected.includes(term)) {
          redFlagsDetected.push(term);
        }
      }

      // Prepend emergency guidance banner to main text fields if present
      if (typeof sanitizedResponse.guidance === 'string') {
        sanitizedResponse.guidance =
          `⚠️ EMERGENCY GUIDANCE: Severe symptom keywords detected (${matchedEmergencyTerms.join(', ')}). ` +
          `If this is an active emergency, call emergency services (911/112/108) immediately.\n\n` +
          sanitizedResponse.guidance;
      }
    }

    // 4. Disclaimer Injection
    const disclaimer =
      existingSafety.disclaimer ??
      'For informational purposes only. Not medical advice, diagnosis, or treatment. ' +
        'Always seek the advice of a physician or other qualified health provider.';

    // 5. Synthetic-data stamp (for fhir/care tools or when flagged)
    const isSynthetic =
      existingSafety.synthetic_data ??
      (context.toolName?.startsWith('fhir_') || context.toolName?.startsWith('care_'));

    sanitizedResponse._safety = {
      disclaimer,
      urgency_tier: urgencyTier,
      red_flags_detected: redFlagsDetected,
      synthetic_data: isSynthetic,
    };

    return sanitizedResponse;
  }
}
