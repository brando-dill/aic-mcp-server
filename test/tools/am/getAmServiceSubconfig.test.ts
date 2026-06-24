import { describe, it, expect } from 'vitest';
import { getAmServiceSubconfigTool } from '../../../src/tools/am/getAmServiceSubconfig.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getAmServiceSubconfig', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getAmServiceSubconfig', getAmServiceSubconfigTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with serviceType, subType, and id in the path', async () => {
      await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/services/SocialIdentityProviders/google/my-google-provider'
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode all path segments', async () => {
      await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'oidcConfig',
        id: 'my-provider'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/services/SocialIdentityProviders/oidcConfig/my-provider');
    });

    it('should support bravo realm', async () => {
      await getAmServiceSubconfigTool.toolFunction({
        realm: 'bravo',
        serviceType: 'validation',
        subType: 'emailAddress',
        id: 'email-validator'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the sub-config object', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', ({ params }) => {
          return HttpResponse.json({
            _id: params.id,
            _rev: 'rev-abc',
            clientId: 'my-client-id',
            scopes: ['openid', 'profile']
          });
        })
      );

      const result = await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      expect(result.content[0].text).toContain('clientId');
      expect(result.content[0].text).toContain('my-client-id');
    });

    it('should include transaction ID in response', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ _id: 'my-google-provider' }), {
            status: 200,
            headers: { 'x-forgerock-transactionid': 'tx-get-subconfig-123' }
          });
        })
      );

      const result = await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      expect(result.content[0].text).toContain('tx-get-subconfig-123');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('SocialIdentityProviders')).not.toThrow();
    });

    it('should validate subType with safePathSegmentSchema', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.subType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('google')).not.toThrow();
    });

    it('should validate id with safePathSegmentSchema', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('my-google-provider')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in id', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('%2e%2e%2fprovider')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = getAmServiceSubconfigTool.inputSchema.realm;
      expect(() => schema.parse('root')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 404 not found', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'nonexistent-provider'
      });

      expect(result.content[0].text).toContain('Failed to get sub-configuration');
      expect(result.content[0].text).toContain('nonexistent-provider');
    });

    it('should handle 401 unauthorized', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await getAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-provider'
      });

      expect(result.content[0].text).toContain('Failed to get sub-configuration');
    });
  });
});
