/**
 * EmergencyDetectionGuard — scans clinical input for emergency red-flag terms.
 * It never blocks a request; it annotates the execution context so the safety
 * interceptor can escalate the response.
 */
import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const redFlagData = require('../data/red-flag-rules.json') as {
  emergency_terms?: string[];
};

const EMERGENCY_TERMS: string[] = redFlagData.emergency_terms ?? [];

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectEmergencyTerms(value: unknown): string[] {
  const strings: string[] = [];
  collectStrings(value, strings);
  const text = strings.join(' ').toLowerCase();

  return EMERGENCY_TERMS.filter((term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`, 'i');
    return pattern.test(text);
  });
}

@Injectable()
export class EmergencyDetectionGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // The framework does not pass tool arguments to guards. The gateway
      // decorator records them on context.input for post-handler processing;
      // metadata is still available for clients that provide MCP _meta values.
      const input = (context as any).input ?? context.metadata;
      contextAny(context).emergency = {
        matched_terms: detectEmergencyTerms(input),
      };
    } catch {
      // Detection must never block care information. The safety interceptor
      // still provides the tool's ordinary safety envelope on detector failure.
      contextAny(context).emergency = { matched_terms: [] };
    }

    return true;
  }
}

function contextAny(context: ExecutionContext): any {
  return context as any;
}
