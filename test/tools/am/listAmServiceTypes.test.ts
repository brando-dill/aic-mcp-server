import { describe, it, expect } from 'vitest';
import { listAmServiceTypesTool } from '../../../src/tools/am/listAmServiceTypes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listAmServiceTypes', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listAmServiceTypes', listAmServiceTypesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the SocialIdentityProviders getAllTypes action', async () => {
      await listAmServiceTypesTool.toolFunction({ realm: 'alpha' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/realm-config/services/SocialIdentityProviders?_action=getAllTypes'
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await listAmServiceTypesTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should support bravo realm', async () => {
      await listAmServiceTypesTool.toolFunction({ realm: 'bravo' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the list of service type descriptors', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('_action') === 'getAllTypes') {
            return HttpResponse.json({
              result: [
                { _id: 'google', name: 'Google', description: 'Google Identity Provider' },
                { _id: 'oidcConfig', name: 'OpenID Connect', description: 'Generic OIDC Provider' }
              ],
              resultCount: 2
            });
          }
          return HttpResponse.json({ result: [], resultCount: 0 });
        })
      );

      const result = await listAmServiceTypesTool.toolFunction({ realm: 'alpha' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result).toHaveLength(2);
      expect(parsed.result[0]._id).toBe('google');
      expect(parsed.result[1]._id).toBe('oidcConfig');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept alpha and bravo realms', () => {
      const schema = listAmServiceTypesTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = listAmServiceTypesTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
      expect(() => schema.parse('')).toThrow();
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
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await listAmServiceTypesTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to list AM service types');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
