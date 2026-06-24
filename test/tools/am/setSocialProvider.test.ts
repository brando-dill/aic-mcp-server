import { describe, it, expect } from 'vitest';
import { setSocialProviderTool } from '../../../src/tools/am/setSocialProvider.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setSocialProvider', () => {
  const getSpy = setupTestEnvironment();

  const baseConfig = {
    clientId: 'google-client-123',
    clientSecret: 'super-secret',
    redirectURI: 'https://example.com/callback',
    scopes: ['openid', 'profile', 'email']
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setSocialProvider', setSocialProviderTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with providerType and providerId in the path', async () => {
      await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: baseConfig
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/realm-config/services/SocialIdentityProviders/google/my-google'
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use PUT method', async () => {
      await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: baseConfig
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('PUT');
    });

    it('should strip _rev from providerConfig before sending', async () => {
      await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: { ...baseConfig, _rev: 'abc123' }
      });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body._rev).toBeUndefined();
      expect(body.clientId).toBe('google-client-123');
    });

    it('should send providerConfig as JSON body', async () => {
      await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: baseConfig
      });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body.clientId).toBe('google-client-123');
      expect(body.scopes).toEqual(['openid', 'profile', 'email']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the saved provider configuration', async () => {
      server.use(
        http.put(
          'https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId',
          async ({ params, request }) => {
            const body = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ _id: params.providerId, ...body });
          }
        )
      );

      const result = await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: baseConfig
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('my-google');
      expect(parsed.clientId).toBe('google-client-123');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate providerType with safePathSegmentSchema', () => {
      const schema = setSocialProviderTool.inputSchema.providerType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('google')).not.toThrow();
    });

    it('should validate providerId with safePathSegmentSchema', () => {
      const schema = setSocialProviderTool.inputSchema.providerId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('my-google-provider')).not.toThrow();
    });

    it('should accept any key-value pairs in providerConfig', () => {
      const schema = setSocialProviderTool.inputSchema.providerConfig;
      expect(() => schema.parse({ clientId: 'abc', custom: 42, nested: { a: 1 } })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request' },
      { status: 401, desc: '401 Unauthorized' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.put('https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await setSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google',
        providerConfig: baseConfig
      });

      expect(result.content[0].text).toContain('Failed to set social provider');
      expect(result.content[0].text).toContain('my-google');
    });
  });
});
