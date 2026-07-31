import { Module } from '@nitrostack/core';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { DrugsTools } from './drugs.tools.js';
import { DrugsService } from './drugs.service.js';

/**
 * Drug Safety Module — RxNorm/OpenFDA backed drug lookup, FDA label info,
 * interaction checking (label cross-scan), adverse events, recalls.
 * Per BUILD_PLAN.md §2.2.
 */
@Module({
  name: 'drugs',
  description: 'Drug safety: labels, interactions, adverse events, recalls',
  imports: [IntegrationsModule],
  controllers: [DrugsTools],
  providers: [DrugsService],
})
export class DrugsModule {}
