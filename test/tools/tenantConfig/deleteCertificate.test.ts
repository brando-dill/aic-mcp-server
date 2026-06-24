import { describe, it, expect } from 'vitest';
import { deleteCertificateTool } from '../../../src/tools/tenantConfig/deleteCertificate.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteCertificate', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteCertificate', deleteCertificateTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build DELETE request with URL, headers, and scopes', async () => {
      await deleteCertificateTool.toolFunction({ id: 'cert-1' });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/certificates/cert-1',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should interpolate id into URL path', async () => {
      await deleteCertificateTool.toolFunction({ id: 'my-cert-to-delete' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/environment/certificates/my-cert-to-delete');
    });

    it('should use scope fr:idc:esv:update', async () => {
      await deleteCertificateTool.toolFunction({ id: 'cert-1' });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return a successful response for 204 No Content', async () => {
      const result = await deleteCertificateTool.toolFunction({ id: 'cert-1' });

      // 204 returns null data — formatSuccess stringifies null as "null"
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeTruthy();
    });

    it('should include transaction ID in response when present', async () => {
      const result = await deleteCertificateTool.toolFunction({ id: 'cert-1' });

      expect(result.content[0].text).toContain('Transaction ID: mock-tx-cert-delete');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require id parameter', () => {
      expect(() => deleteCertificateTool.inputSchema.id.parse(undefined)).toThrow();
    });

    it('should reject empty id', () => {
      expect(() => deleteCertificateTool.inputSchema.id.parse('')).toThrow();
    });

    it('should accept valid certificate id', () => {
      expect(() => deleteCertificateTool.inputSchema.id.parse('cert-abc123')).not.toThrow();
    });

    it('should reject path traversal in id', () => {
      expect(() => deleteCertificateTool.inputSchema.id.parse('../etc/passwd')).toThrow();
      expect(() => deleteCertificateTool.inputSchema.id.parse('cert/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in id', () => {
      expect(() => deleteCertificateTool.inputSchema.id.parse('%2e%2e%2fcert')).toThrow();
      expect(() => deleteCertificateTool.inputSchema.id.parse('cert%2fother')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, body: { error: 'unauthorized', message: 'Invalid token' }, id: 'cert-1' },
      { status: 404, body: { code: 404, message: 'Certificate not found' }, id: 'nonexistent-cert' },
      { status: 403, body: { code: 403, message: 'Insufficient permissions' }, id: 'protected-cert' }
    ])('handles $status errors', async ({ status, body, id }) => {
      server.use(
        http.delete('https://*/environment/certificates/:id', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await deleteCertificateTool.toolFunction({ id });

      expect(result.content[0].text).toContain('Failed to delete certificate');
      expect(result.content[0].type).toBe('text');
    });
  });
});
