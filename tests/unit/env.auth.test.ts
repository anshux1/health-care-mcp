import { describe, expect, it } from 'vitest';
import { getAuthConfigurationErrors } from '../../src/config/env.js';

const productionWithoutCredentials = {
  NODE_ENV: 'production' as const,
  API_KEY_CLINICIAN: undefined,
  API_KEY_READONLY: undefined,
  API_KEY_ADMIN: undefined,
  JWT_SECRET: undefined,
};

describe('production authentication configuration', () => {
  it('fails closed when production has no configured credential', () => {
    expect(getAuthConfigurationErrors(productionWithoutCredentials)).toEqual([
      expect.stringContaining('at least one configured API key or JWT_SECRET'),
    ]);
  });

  it('accepts production with an API key', () => {
    expect(
      getAuthConfigurationErrors({
        ...productionWithoutCredentials,
        API_KEY_CLINICIAN: 'configured-clinician-key',
      }),
    ).toEqual([]);
  });

  it('accepts production with JWT authentication configured', () => {
    expect(
      getAuthConfigurationErrors({
        ...productionWithoutCredentials,
        JWT_SECRET: 'configured-jwt-secret-long-enough',
      }),
    ).toEqual([]);
  });

  it('does not impose the production credential requirement on development/test', () => {
    expect(
      getAuthConfigurationErrors({
        ...productionWithoutCredentials,
        NODE_ENV: 'development',
      }),
    ).toEqual([]);
  });
});
