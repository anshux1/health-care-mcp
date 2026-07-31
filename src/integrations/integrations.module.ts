import { Module } from '@nitrostack/core';
import { HttpClientService } from './http-client.service.js';

/**
 * Integrations Module — outbound HTTP layer and per-API services.
 * Per-API services (RxNorm, OpenFDA, PubMed, ...) are added to
 * providers/exports as they land per BUILD_PLAN.md §10 schedule.
 */
@Module({
  name: 'integrations',
  description: 'External API integration layer',
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class IntegrationsModule {}
