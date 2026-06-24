import { describe, it, expect } from 'vitest';
import { listAmServiceSubconfigsTool } from '../../../src/tools/am/listAmServiceSubconfigs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listAmServiceSubconfigs', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listAmServiceSubconfigs', listAmServiceSubconfigsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with serviceType and _queryFilter=true', async () => {
      await listAmServiceSubconfigsTool.toolFunction({ realm: 'alpha', serviceType: 'SocialIdentityProviders' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/services/SocialIdentityProviders?_queryFilter=true');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await listAmServiceSubconfigsTool.toolFunction({ realm: 'alpha', serviceType: 'validation' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode serviceType', async () => {
      await listAmServiceSubconfigsTool.toolFunction({ realm: 'alpha', serviceType: 'SocialIdentityProviders' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/services/SocialIdentityProviders');
    });

    it('should support bravo realm', async () => {
      await listAmServiceSubconfigsTool.toolFunction({ realm: 'bravo', serviceType: 'validation' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return sub-config instances in response', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_queryFilter') === 'true') {
            return HttpResponse.json({
              result: [
                { _id: 'google-provider', _type: { _id: 'google', name: 'Google' } },
                { _id: 'facebook-provider', _type: { _id: 'facebook', name: 'Facebook' } }
              ],
              resultCount: 2
            });
          }
          return HttpResponse.json({ result: [], resultCount: 0 });
        })
      );

      const result = await listAmServiceSubconfigsTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders'
      });

      expect(result.content[0].text).toContain('google-provider');
      expect(result.content[0].text).toContain('facebook-provider');
    });

    it('should include transaction ID in response', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_queryFilter') === 'true') {
            return new HttpResponse(JSON.stringify({ result: [] }), {
              status: 200,
              headers: { 'x-forgerock-transactionid': 'tx-list-subconfig-123' }
            });
          }
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await listAmServiceSubconfigsTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders'
      });

      expect(result.content[0].text).toContain('tx-list-subconfig-123');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = listAmServiceSubconfigsTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('SocialIdentityProviders')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in serviceType', () => {
      const schema = listAmServiceSubconfigsTool.inputSchema.serviceType;
      expect(() => schema.parse('%2e%2e%2fservices')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = listAmServiceSubconfigsTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = listAmServiceSubconfigsTool.inputSchema.realm;
      expect(() => schema.parse('root')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 404 not found', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await listAmServiceSubconfigsTool.toolFunction({
        realm: 'alpha',
        serviceType: 'nonexistent'
      });

      expect(result.content[0].text).toContain('Failed to list sub-configurations');
      expect(result.content[0].text).toContain('nonexistent');
    });

    it('should handle 401 unauthorized', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await listAmServiceSubconfigsTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders'
      });

      expect(result.content[0].text).toContain('Failed to list sub-configurations');
    });
  });
});
