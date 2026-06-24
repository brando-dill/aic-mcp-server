import { describe, it, expect } from 'vitest';
import { listAmServicesTool } from '../../../src/tools/am/listAmServices.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listAmServices', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listAmServices', listAmServicesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the services nextdescendents action', async () => {
      await listAmServicesTool.toolFunction({ realm: 'alpha' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/services?_action=nextdescendents');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should use POST method with empty body', async () => {
      await listAmServicesTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
      expect(options?.body).toBe('{}');
    });

    it('should support bravo realm', async () => {
      await listAmServicesTool.toolFunction({ realm: 'bravo' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the list of configured services', async () => {
      server.use(
        http.post('https://*/am/json/*/services', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_action') === 'nextdescendents') {
            return HttpResponse.json({
              result: [
                { _id: 'scripting', _type: { _id: 'scripting', name: 'Scripting' } },
                { _id: 'validation', _type: { _id: 'validation', name: 'Validation' } }
              ],
              resultCount: 2
            });
          }
          return HttpResponse.json({ result: [], resultCount: 0 });
        })
      );

      const result = await listAmServicesTool.toolFunction({ realm: 'alpha' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result).toHaveLength(2);
      expect(parsed.result[0]._id).toBe('scripting');
      expect(parsed.result[1]._id).toBe('validation');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept alpha and bravo realms', () => {
      const schema = listAmServicesTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = listAmServicesTool.inputSchema.realm;
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
        http.post('https://*/am/json/*/services', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await listAmServicesTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to list AM services');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
