import { Module } from '@nitrostack/core';

/**
 * Care Coordination Module — SBAR handoffs, medication reconciliation,
 * referral drafts, guidelines, appointment prep. Tools land per BUILD_PLAN.md §2.6.
 */
@Module({
  name: 'care',
  description: 'Care coordination: handoffs, med reconciliation, referrals'
})
export class CareModule {}
