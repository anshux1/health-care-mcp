import { Module } from '@nitrostack/core';

/**
 * Diagnostics Support Module — ICD-10-CM lookup, rule-based lab interpretation,
 * patient-friendly lab explanations. Tools land per BUILD_PLAN.md §2.3.
 */
@Module({
  name: 'diagnostics',
  description: 'Diagnostics support: ICD-10-CM codes and lab value interpretation'
})
export class DiagnosticsModule {}
