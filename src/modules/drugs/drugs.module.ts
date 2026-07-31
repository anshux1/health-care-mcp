import { Module } from '@nitrostack/core';

/**
 * Drug Safety Module — RxNorm/OpenFDA backed drug lookup, FDA label info,
 * interaction checking (label cross-scan), adverse events, recalls.
 * Tools land per BUILD_PLAN.md §2.2.
 */
@Module({
  name: 'drugs',
  description: 'Drug safety: labels, interactions, adverse events, recalls'
})
export class DrugsModule {}
