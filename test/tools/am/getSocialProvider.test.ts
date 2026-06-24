import { describe, it, expect } from 'vitest';
import { getSocialProviderTool } from '../../../src/tools/am/getSocialProvider.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getSocialProvider', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getSocialProvider', getSocialProviderTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with providerType and providerId in the path', async () => {
      await getSocialProviderTool.toolFunction({ realm: 'alpha', providerType: 'google', providerId: 'my-google' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/realm-config/services/SocialIdentityProviders/google/my-google'
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await getSocialProviderTool.toolFunction({ realm: 'alpha', providerType: 'google', providerId: 'my-google' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode providerType and providerId with special characters', async () => {
      await getSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'oidcConfig',
        providerId: 'my provider'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('my%20provider');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the full provider configuration', async () => {
      server.use(
        http.get(
          'https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId',
          ({ params }) => {
            return HttpResponse.json({
              _id: params.providerId,
              _type: { _id: params.providerType },
              clientId: 'google-client-123',
              clientSecret: 'super-secret',
              redirectURI: 'https://example.com/callback',
              scopes: ['openid', 'profile', 'email']
            });
          }
        )
      );

      const result = await getSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google'
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('my-google');
      expect(parsed.clientId).toBe('google-client-123');
      expect(parsed.scopes).toContain('openid');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate providerType with safePathSegmentSchema', () => {
      const schema = getSocialProviderTool.inputSchema.providerType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('google')).not.toThrow();
    });

    it('should validate providerId with safePathSegmentSchema', () => {
      const schema = getSocialProviderTool.inputSchema.providerId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('my-google-provider')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in providerType', () => {
      const schema = getSocialProviderTool.inputSchema.providerType;
      expect(() => schema.parse('%2e%2e%2fgoogle')).toThrow();
    });

    it('should reject URL-encoded path traversal in providerId', () => {
      const schema = getSocialProviderTool.inputSchema.providerId;
      expect(() => schema.parse('%2e%2e%2fprovider')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getSocialProviderTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'nonexistent'
      });

      expect(result.content[0].text).toContain('Failed to get social provider');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
