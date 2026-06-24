import { describe, it, expect } from 'vitest';
import { getCertificateTool } from '../../../src/tools/tenantConfig/getCertificate.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getCertificate', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getCertificate', getCertificateTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build GET request with URL, headers, and scopes', async () => {
      await getCertificateTool.toolFunction({ id: 'cert-1' });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/certificates/cert-1',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should interpolate id into URL path', async () => {
      await getCertificateTool.toolFunction({ id: 'my-cert-id' });

      const [url] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/environment/certificates/my-cert-id');
    });

    it('should use scope fr:idc:esv:read', async () => {
      await getCertificateTool.toolFunction({ id: 'cert-1' });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:read']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return certificate data in response', async () => {
      const result = await getCertificateTool.toolFunction({ id: 'cert-1' });

      expect(result.content[0].text).toContain('cert-1');
      expect(result.content[0].type).toBe('text');
    });

    it('should include certificate subject in response', async () => {
      const result = await getCertificateTool.toolFunction({ id: 'cert-1' });

      expect(result.content[0].text).toContain('CN=example.com');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require id parameter', () => {
      expect(() => getCertificateTool.inputSchema.id.parse(undefined)).toThrow();
    });

    it('should reject empty id', () => {
      expect(() => getCertificateTool.inputSchema.id.parse('')).toThrow();
    });

    it('should accept valid certificate id', () => {
      expect(() => getCertificateTool.inputSchema.id.parse('cert-abc123')).not.toThrow();
    });

    it('should reject path traversal in id', () => {
      expect(() => getCertificateTool.inputSchema.id.parse('../etc/passwd')).toThrow();
      expect(() => getCertificateTool.inputSchema.id.parse('cert/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in id', () => {
      expect(() => getCertificateTool.inputSchema.id.parse('%2e%2e%2fcert')).toThrow();
      expect(() => getCertificateTool.inputSchema.id.parse('cert%2fother')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 404 error message', async () => {
      server.use(http.get('https://*/environment/certificates/:id', () => new HttpResponse(null, { status: 404 })));

      const result = await getCertificateTool.toolFunction({ id: 'nonexistent-cert' });

      expect(result.content[0].text).toContain('Failed to get certificate');
    });

    it('should surface 401 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/certificates/:id',
          () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        )
      );

      const result = await getCertificateTool.toolFunction({ id: 'cert-1' });

      expect(result.content[0].text).toContain('Failed to get certificate');
    });
  });
});
