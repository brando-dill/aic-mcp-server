import { describe, it, expect } from 'vitest';
import { getSamlEntityTool } from '../../../src/tools/am/getSamlEntity.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getSamlEntity', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getSamlEntity', getSamlEntityTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with location and entityId64 in the path', async () => {
      await getSamlEntityTool.toolFunction({
        realm: 'alpha',
        location: 'hosted',
        entityId64: 'aHR0cHM6Ly9leGFtcGxlLmNvbQ=='
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/hosted/aHR0cHM6Ly9leGFtcGxlLmNvbQ%3D%3D'
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use GET method', async () => {
      await getSamlEntityTool.toolFunction({ realm: 'alpha', location: 'remote', entityId64: 'abc123' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode entityId64 with special characters', async () => {
      await getSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64: 'abc+def==' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('abc%2Bdef%3D%3D');
    });

    it('should include realm in the URL path', async () => {
      await getSamlEntityTool.toolFunction({ realm: 'bravo', location: 'remote', entityId64: 'entity123' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the full entity configuration', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', ({ params }) => {
          return HttpResponse.json({
            _id: params.entityId64,
            entityId: 'https://example.com/saml',
            location: params.location,
            roles: ['SPSSODescriptor']
          });
        })
      );

      const result = await getSamlEntityTool.toolFunction({
        realm: 'alpha',
        location: 'hosted',
        entityId64: 'entity123'
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('entity123');
      expect(parsed.entityId).toBe('https://example.com/saml');
      expect(parsed.roles).toContain('SPSSODescriptor');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate location as z.enum hosted or remote', () => {
      const schema = getSamlEntityTool.inputSchema.location;
      expect(() => schema.parse('hosted')).not.toThrow();
      expect(() => schema.parse('remote')).not.toThrow();
      expect(() => schema.parse('other')).toThrow();
    });

    it('should validate entityId64 with safePathSegmentSchema', () => {
      const schema = getSamlEntityTool.inputSchema.entityId64;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('aHR0cHM6Ly9leGFtcGxlLmNvbQ==')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in entityId64', () => {
      const schema = getSamlEntityTool.inputSchema.entityId64;
      expect(() => schema.parse('%2e%2e%2fentity')).toThrow();
    });

    it('should validate realm as alpha or bravo', () => {
      const schema = getSamlEntityTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('gamma')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getSamlEntityTool.toolFunction({
        realm: 'alpha',
        location: 'hosted',
        entityId64: 'nonexistent'
      });

      expect(result.content[0].text).toContain('Failed to get SAML entity');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
