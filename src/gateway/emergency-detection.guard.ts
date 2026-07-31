/**
 * EmergencyDetectionGuard — Scans input for emergency red-flag terms (BUILD_PLAN.md §6.2).
 * Never blocks execution; populates context.emergency for ClinicalSafetyInterceptor escalation.
 */
import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const redFlagData = require('../data/red-flag-rules.json');

const EMERGENCY_TERMS: string[] = redFlagData.emergency_terms ?? [];

@Injectable()
export class EmergencyDetectionGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const input = (context as any).args?.[0] ?? (context as any).input ?? context.metadata;
      const textToScan: string[] = [];

      if (typeof input === 'string') {
        textToScan.push(input);
      } else if (typeof input === 'object' && input !== null) {
        for (const [key, val] of Object.entries(input)) {
          if (typeof val === 'string') {
            textToScan.push(val);
          } else if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === 'string') textToScan.push(item);
            }
          }
        }
      }

      const joinedText = textToScan.join(' ').toLowerCase();
      const matchedTerms: string[] = [];

      for (const term of EMERGENCY_TERMS) {
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
        if (regex.test(joinedText)) {
          matchedTerms.push(term);
        }
      }

      (context as any).emergency = {
        matched_terms: matchedTerms,
      };
    } catch {
      (context as any).emergency = { matched_terms: [] };
    }

    return true;
  }
}
