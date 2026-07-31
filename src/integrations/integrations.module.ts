import { Module } from '@nitrostack/core';
import { HttpClientService } from './http-client.service.js';
import { RxNormService } from './rxnorm.service.js';
import { OpenFdaService } from './openfda.service.js';

/**
 * Integrations Module — outbound HTTP layer and per-API services.
 * Remaining per-API services (PubMed, ClinicalTrials, ClinicalTables, FHIR)
 * are added as they land per BUILD_PLAN.md §10 schedule.
 */
@Module({
  name: 'integrations',
  description: 'External API integration layer',
  providers: [HttpClientService, RxNormService, OpenFdaService],
  exports: [HttpClientService, RxNormService, OpenFdaService],
})
export class IntegrationsModule {}
