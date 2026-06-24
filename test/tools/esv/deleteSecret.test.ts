import { describe, it, expect } from 'vitest';
import { deleteSecretTool } from '../../../src/tools/esv/deleteSecret.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteSecret', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteSecret', deleteSecretTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build DELETE request with URL, headers, and scopes', async () => {
      await deleteSecretTool.toolFunction({
        secretId: 'esv-old-secret'
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-old-secret',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should interpolate secretId into the URL path', async () => {
      await deleteSecretTool.toolFunction({
        secretId: 'esv-specific-secret'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/environment/secrets/esv-specific-secret');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with pod restart message', async () => {
      server.use(
        http.delete('https://*/environment/secrets/:secretId', ({ request, params }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }

          return HttpResponse.json({ _id: params.secretId });
        })
      );

      const result = await deleteSecretTool.toolFunction({
        secretId: 'esv-old-secret'
      });

      expect(result.content[0].text).toContain('Deleted secret');
      expect(result.content[0].text).toContain('esv-old-secret');
      expect(result.content[0].text).toContain('Pod restart required');
      expect(result.content[0].type).toBe('text');
    });

    it('should include the secretId in the success message', async () => {
      const result = await deleteSecretTool.toolFunction({
        secretId: 'esv-my-credential'
      });

      expect(result.content[0].text).toContain('esv-my-credential');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = deleteSecretTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = deleteSecretTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept any non-empty string for secretId', () => {
      const schema = deleteSecretTool.inputSchema.secretId;
      expect(() => schema.parse('esv-test')).not.toThrow();
      expect(() => schema.parse('esv-my-old-key')).not.toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = deleteSecretTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../other')).toThrow();
      expect(() => schema.parse('esv-test/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = deleteSecretTool.inputSchema.secretId;
      expect(() => schema.parse('%2e%2e%2fetc%2fpasswd')).toThrow();
      expect(() => schema.parse('esv%2ftest')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, body: { error: 'unauthorized', message: 'Invalid token' }, secretId: 'esv-test' },
      { status: 404, body: { code: 404, message: 'Secret not found' }, secretId: 'esv-nonexistent' },
      { status: 403, body: { code: 403, message: 'Insufficient permissions' }, secretId: 'esv-protected' }
    ])('handles $status errors', async ({ status, body, secretId }) => {
      server.use(
        http.delete('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await deleteSecretTool.toolFunction({ secretId });

      expect(result.content[0].text).toContain('Failed to delete secret');
      expect(result.content[0].text).toContain(secretId);
      expect(result.content[0].type).toBe('text');
    });
  });
});
