import { describe, it, expect } from 'vitest';
import { deleteAmServiceTool } from '../../../src/tools/am/deleteAmService.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteAmService', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteAmService', deleteAmServiceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with serviceType in the path', async () => {
      await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/services/scripting');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use DELETE method', async () => {
      await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should URL-encode serviceType', async () => {
      await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'SocialIdentityProviders' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/services/SocialIdentityProviders');
    });

    it('should support bravo realm', async () => {
      await deleteAmServiceTool.toolFunction({ realm: 'bravo', serviceType: 'scripting' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success message with service type and realm', async () => {
      server.use(
        http.delete('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-delete-123' }
          });
        })
      );

      const result = await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      expect(result.content[0].text).toContain('scripting');
      expect(result.content[0].text).toContain('alpha');
      expect(result.content[0].text).toContain('deleted successfully');
    });

    it('should include transaction ID in the success response', async () => {
      server.use(
        http.delete('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-delete-abc' }
          });
        })
      );

      const result = await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      expect(result.content[0].text).toContain('tx-delete-abc');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = deleteAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('scripting')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in serviceType', () => {
      const schema = deleteAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('%2e%2e%2fscripting')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = deleteAmServiceTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = deleteAmServiceTool.inputSchema.realm;
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
        http.delete('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await deleteAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'nonexistent' });

      expect(result.content[0].text).toContain('Failed to delete AM service');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
