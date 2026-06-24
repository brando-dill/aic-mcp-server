import { describe, it, expect } from 'vitest';
import { updateCertificateTool } from '../../../src/tools/tenantConfig/updateCertificate.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('updateCertificate', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateCertificate', updateCertificateTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build PATCH request with URL, headers, and scopes', async () => {
      await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/certificates/cert-1',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should use PATCH method', async () => {
      await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('PATCH');
    });

    it('should interpolate id into URL path', async () => {
      await updateCertificateTool.toolFunction({ id: 'my-cert-abc', active: true });

      const [url] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/environment/certificates/my-cert-abc');
    });

    it('should include active in request body', async () => {
      await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      const [, , options] = getSpy().mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.active).toBe(false);
    });

    it('should use scope fr:idc:esv:update', async () => {
      await updateCertificateTool.toolFunction({ id: 'cert-1', active: true });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return updated certificate in response', async () => {
      const result = await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      expect(result.content[0].text).toContain('cert-1');
      expect(result.content[0].type).toBe('text');
    });

    it('should include active flag in response', async () => {
      const result = await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      expect(result.content[0].text).toContain('active');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require id parameter', () => {
      expect(() => updateCertificateTool.inputSchema.id.parse(undefined)).toThrow();
    });

    it('should reject empty id', () => {
      expect(() => updateCertificateTool.inputSchema.id.parse('')).toThrow();
    });

    it('should reject path traversal in id', () => {
      expect(() => updateCertificateTool.inputSchema.id.parse('../etc/passwd')).toThrow();
      expect(() => updateCertificateTool.inputSchema.id.parse('cert/other')).toThrow();
    });

    it('should require active parameter', () => {
      expect(() => updateCertificateTool.inputSchema.active.parse(undefined)).toThrow();
    });

    it('should reject non-boolean active', () => {
      expect(() => updateCertificateTool.inputSchema.active.parse('true')).toThrow();
      expect(() => updateCertificateTool.inputSchema.active.parse(1)).toThrow();
    });

    it('should accept valid id and boolean active', () => {
      expect(() => updateCertificateTool.inputSchema.id.parse('cert-abc123')).not.toThrow();
      expect(() => updateCertificateTool.inputSchema.active.parse(true)).not.toThrow();
      expect(() => updateCertificateTool.inputSchema.active.parse(false)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request' },
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.patch('https://*/environment/certificates/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await updateCertificateTool.toolFunction({ id: 'cert-1', active: false });

      expect(result.content[0].text).toContain('Failed to update certificate');
    });
  });
});
