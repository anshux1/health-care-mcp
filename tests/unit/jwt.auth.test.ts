import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../../src/gateway/jwt.utils.js';

describe('JWT Auth Utilities (S1)', () => {
  it('should sign and verify a valid JWT token', () => {
    const token = signJwt({ sub: 'user_123', scopes: ['triage:read', 'fhir:read'] }, 3600);
    expect(token).toBeTypeOf('string');
    expect(token.split('.').length).toBe(3);

    const payload = verifyJwt(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user_123');
    expect(payload?.scopes).toEqual(['triage:read', 'fhir:read']);
  });

  it('should reject tampered JWT signatures', () => {
    const token = signJwt({ sub: 'user_123', scopes: ['triage:read'] }, 3600);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalid_signature`;

    const payload = verifyJwt(tampered);
    expect(payload).toBeNull();
  });

  it('should reject expired JWT tokens', () => {
    const expiredToken = signJwt({ sub: 'user_expired', scopes: ['read'] }, -10);
    const payload = verifyJwt(expiredToken);
    expect(payload).toBeNull();
  });
});
