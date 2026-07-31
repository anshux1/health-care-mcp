import { Module } from '@nitrostack/core';

/**
 * Triage Module — rule-based symptom triage, urgency tiers, red-flag detection.
 * Offline-first by design (no external APIs). Tools land per BUILD_PLAN.md §2.1.
 */
@Module({
  name: 'triage',
  description: 'Symptom triage with urgency tiers and red-flag detection'
})
export class TriageModule {}
