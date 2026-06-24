import { describe, it, expect } from 'vitest';
import { deleteAmServiceSubconfigTool } from '../../../src/tools/am/deleteAmServiceSubconfig.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteAmServiceSubconfig', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteAmServiceSubconfig', deleteAmServiceSubconfigTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with serviceType, subType, and id in the path', async () => {
      await deleteAmServiceSubconfigTool.toolFunction({
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

    it('should use DELETE method', async () => {
      await deleteAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should URL-encode all path segments', async () => {
      await deleteAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'oidcConfig',
        id: 'my-oidc-provider'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/services/SocialIdentityProviders/oidcConfig/my-oidc-provider');
    });

    it('should support bravo realm', async () => {
      await deleteAmServiceSubconfigTool.toolFunction({
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
    it('should return success message with all relevant identifiers', async () => {
      server.use(
        http.delete('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-delete-subconfig-123' }
          });
        })
      );

      const result = await deleteAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      expect(result.content[0].text).toContain('my-google-provider');
      expect(result.content[0].text).toContain('google');
      expect(result.content[0].text).toContain('SocialIdentityProviders');
      expect(result.content[0].text).toContain('alpha');
      expect(result.content[0].text).toContain('deleted successfully');
    });

    it('should include transaction ID in the success response', async () => {
      server.use(
        http.delete('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-delete-abc-xyz' }
          });
        })
      );

      const result = await deleteAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider'
      });

      expect(result.content[0].text).toContain('tx-delete-abc-xyz');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('SocialIdentityProviders')).not.toThrow();
    });

    it('should validate subType with safePathSegmentSchema', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.subType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('google')).not.toThrow();
    });

    it('should validate id with safePathSegmentSchema', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('my-provider')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in id', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('%2e%2e%2fprovider')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = deleteAmServiceSubconfigTool.inputSchema.realm;
      expect(() => schema.parse('root')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.delete('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await deleteAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'nonexistent-provider'
      });

      expect(result.content[0].text).toContain('Failed to delete sub-configuration');
      expect(result.content[0].text).toContain('nonexistent-provider');
    });
  });
});
