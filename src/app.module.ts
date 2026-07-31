import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SystemHealthCheck } from './health/system.health.js';
import { TriageModule } from './modules/triage/triage.module.js';
import { DrugsModule } from './modules/drugs/drugs.module.js';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module.js';
import { ResearchModule } from './modules/research/research.module.js';
import { FhirModule } from './modules/fhir/fhir.module.js';
import { CareModule } from './modules/care/care.module.js';
import { CoreModule } from './modules/core/core.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';

/**
 * Vitalis — Clinical Intelligence MCP Server
 *
 * Root application module. Wires all six clinical feature modules plus the
 * core resources/prompts module, per BUILD_PLAN.md §3.2.
 * No auto-discovery: every module must be imported here explicitly.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'vitalis',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Vitalis — Clinical Intelligence MCP Server',
  imports: [
    ConfigModule.forRoot(),
    IntegrationsModule,
    TriageModule,
    DrugsModule,
    DiagnosticsModule,
    ResearchModule,
    FhirModule,
    CareModule,
    CoreModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}
