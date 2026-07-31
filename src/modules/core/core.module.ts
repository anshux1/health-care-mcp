import { Module } from '@nitrostack/core';

/**
 * Core Module — server-wide resources (safety policy, data sources, audit)
 * and prompts (handoff, patient education, research critique).
 * Per BUILD_PLAN.md §2.7.
 */
@Module({
  name: 'core',
  description: 'Core resources and prompt templates'
})
export class CoreModule {}
