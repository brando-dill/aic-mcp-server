import { describe, it, expect } from 'vitest';
import { deleteSamlEntityTool } from '../../../src/tools/am/deleteSamlEntity.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteSamlEntity', () => {
  const getSpy = setupTestEnvironment();

  const entityId64 = 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==';

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteSamlEntity', deleteSamlEntityTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with location and entityId64 in the path', async () => {
      await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64 });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe(
        `https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/hosted/${encodeURIComponent(entityId64)}`
      );
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use DELETE method', async () => {
      await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'remote', entityId64 });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should work with remote location', async () => {
      await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'remote', entityId64: 'remoteEntity123' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/realm-config/saml2/remote/remoteEntity123');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success message with transaction ID', async () => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-saml-delete-123' }
          });
        })
      );

      const result = await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64 });

      expect(result.content[0].text).toContain(entityId64);
      expect(result.content[0].text).toContain('deleted successfully');
      expect(result.content[0].text).toContain('tx-saml-delete-123');
    });

    it('should use unknown as transaction ID fallback when header is absent', async () => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const result = await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64 });

      expect(result.content[0].text).toContain('unknown');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate location as hosted or remote', () => {
      const schema = deleteSamlEntityTool.inputSchema.location;
      expect(() => schema.parse('hosted')).not.toThrow();
      expect(() => schema.parse('remote')).not.toThrow();
      expect(() => schema.parse('unknown')).toThrow();
    });

    it('should validate entityId64 with safePathSegmentSchema', () => {
      const schema = deleteSamlEntityTool.inputSchema.entityId64;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('aHR0cHM6Ly9leGFtcGxlLmNvbQ==')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in entityId64', () => {
      const schema = deleteSamlEntityTool.inputSchema.entityId64;
      expect(() => schema.parse('%2e%2e%2fentity')).toThrow();
    });

    it('should validate realm as alpha or bravo', () => {
      const schema = deleteSamlEntityTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('zeta')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await deleteSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64: 'nonexistent' });

      expect(result.content[0].text).toContain('Failed to delete SAML entity');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
