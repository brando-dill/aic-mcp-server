import { describe, it, expect } from 'vitest';
import { getAmServiceTool } from '../../../src/tools/am/getAmService.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getAmService', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getAmService', getAmServiceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with serviceType in the path', async () => {
      await getAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/services/scripting');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await getAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode serviceType with special characters', async () => {
      await getAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'SocialIdentityProviders' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/services/SocialIdentityProviders');
    });

    it('should support bravo realm', async () => {
      await getAmServiceTool.toolFunction({ realm: 'bravo', serviceType: 'scripting' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the service configuration', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', ({ params }) => {
          return HttpResponse.json({
            _id: params.serviceType,
            _rev: 'rev-123',
            _type: { _id: params.serviceType, name: 'Scripting' },
            defaultScript: { AUTHENTICATION_TREE_DECISION_NODE: { script: 'abc' } }
          });
        })
      );

      const result = await getAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('scripting');
      expect(parsed._type).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = getAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('scripting')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in serviceType', () => {
      const schema = getAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('%2e%2e%2fscripting')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = getAmServiceTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = getAmServiceTool.inputSchema.realm;
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
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'nonexistent' });

      expect(result.content[0].text).toContain('Failed to get AM service');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
