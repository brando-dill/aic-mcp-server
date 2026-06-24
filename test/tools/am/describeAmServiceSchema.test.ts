import { describe, it, expect } from 'vitest';
import { describeAmServiceSchemaTool } from '../../../src/tools/am/describeAmServiceSchema.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('describeAmServiceSchema', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('describeAmServiceSchema', describeAmServiceSchemaTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the services getAllTypes action', async () => {
      await describeAmServiceSchemaTool.toolFunction({ realm: 'alpha' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/services?_action=getAllTypes');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should use GET method', async () => {
      await describeAmServiceSchemaTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should support bravo realm', async () => {
      await describeAmServiceSchemaTool.toolFunction({ realm: 'bravo' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return all service type descriptors', async () => {
      server.use(
        http.get('https://*/am/json/*/services', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_action') === 'getAllTypes') {
            return HttpResponse.json({
              result: [
                { _id: 'scripting', name: 'Scripting', description: 'Scripting service' },
                { _id: 'validation', name: 'Validation', description: 'Validation service' },
                { _id: 'SocialIdentityProviders', name: 'Social Identity Provider', description: 'Social IdP service' }
              ],
              resultCount: 3
            });
          }
          return HttpResponse.json({ result: [], resultCount: 0 });
        })
      );

      const result = await describeAmServiceSchemaTool.toolFunction({ realm: 'alpha' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result).toHaveLength(3);
      expect(parsed.result[0]._id).toBe('scripting');
      expect(parsed.result[2]._id).toBe('SocialIdentityProviders');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept alpha and bravo realms', () => {
      const schema = describeAmServiceSchemaTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = describeAmServiceSchemaTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
      expect(() => schema.parse('root')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 403, desc: '403 Forbidden' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.get('https://*/am/json/*/services', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await describeAmServiceSchemaTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to describe AM service schemas');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
