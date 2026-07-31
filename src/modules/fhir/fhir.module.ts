import { Module } from '@nitrostack/core';

/**
 * FHIR Patient Records Module — read-only access to synthetic (Synthea)
 * patients on public FHIR R4 servers, with base-URL failover.
 * Tools land per BUILD_PLAN.md §2.5.
 */
@Module({
  name: 'fhir',
  description: 'FHIR R4 patient records (synthetic data only)'
})
export class FhirModule {}
