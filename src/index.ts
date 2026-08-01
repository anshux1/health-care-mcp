/**
 * Vitalis Clinical Intelligence MCP Server
 *
 * Main entry point for the MCP server.
 * Uses the @McpApp decorator pattern for clean, NestJS-style architecture.
 * 
 * Transport Configuration:
 * - Development (NODE_ENV=development): STDIO only
 * - Production (NODE_ENV=production): Dual transport (STDIO + HTTP SSE)
 */

import 'dotenv/config';
import { DIContainer, McpApplicationFactory, OAuthModule } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { HttpContextModule } from './gateway/http-context.module.js';

/**
 * Bootstrap the application
 */
async function bootstrap() {
  if (process.env.VITALIS_SAFETY_LAYER === 'off') {
    console.error(
      '⚠️ WARNING: VITALIS_SAFETY_LAYER=off. Output safety rewriting is disabled for this process; use only in controlled tests.',
    );
  }

  // Create and start the MCP server
  const server = await McpApplicationFactory.create(AppModule);
  // @nitrostack/core auto-registers its optional OAuthModule on import. Give
  // the unused provider a null config so eager DI startup does not emit a
  // misleading OAUTH_CONFIG resolution error. OAuthModule.forRoot() still
  // overrides this value when OAuth is explicitly configured.
  if (!OAuthModule.getConfig()) {
    const container = DIContainer.getInstance();
    if (!container.has('OAUTH_CONFIG')) {
      container.registerValue('OAUTH_CONFIG', null);
    }
  }
  HttpContextModule.attachServer(server);
  await server.start();
}

// Start the application
bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
