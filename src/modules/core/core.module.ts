import { Module } from '@nitrostack/core';
import { CoreResources } from './core.resources.js';
import { CorePrompts } from './core.prompts.js';
import { AuditStore } from '../../gateway/audit.store.js';

@Module({
  name: 'core',
  description: 'Core module — system resources (vitalis://) and prompt templates',
  controllers: [CoreResources, CorePrompts],
  providers: [AuditStore],
  exports: [AuditStore],
})
export class CoreModule {}
