import { describe, it, expect } from 'vitest';
import { listSecretVersionsTool } from '../../../src/tools/esv/listSecretVersions.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listSecretVersions', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listSecretVersions', listSecretVersionsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build GET request with correct URL, scopes, and headers', async () => {
      await listSecretVersionsTool.toolFunction({
        secretId: 'esv-my-secret'
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret/versions',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should not include a body or POST method', async () => {
      await listSecretVersionsTool.toolFunction({
        secretId: 'esv-test'
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      expect(options.method).toBeUndefined();
      expect(options.body).toBeUndefined();
    });

    it('should interpolate secretId into the URL path', async () => {
      await listSecretVersionsTool.toolFunction({
        secretId: 'esv-api-key-prod'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/environment/secrets/esv-api-key-prod/versions');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the list of versions from the API', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId/versions', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            result: [
              { version: '1', status: 'DISABLED', createDate: '2025-01-10T08:00:00Z' },
              { version: '2', status: 'ENABLED', createDate: '2025-01-11T10:00:00Z' }
            ],
            resultCount: 2
          });
        })
      );

      const result = await listSecretVersionsTool.toolFunction({
        secretId: 'esv-my-secret'
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);
      expect(responseData.result).toHaveLength(2);
      expect(responseData.result[0].version).toBe('1');
      expect(responseData.result[0].status).toBe('DISABLED');
      expect(responseData.result[1].version).toBe('2');
      expect(responseData.result[1].status).toBe('ENABLED');
    });

    it('should return text content type', async () => {
      const result = await listSecretVersionsTool.toolFunction({
        secretId: 'esv-test'
      });

      expect(result.content[0].type).toBe('text');
    });

    it('should handle empty versions list', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId/versions', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            result: [],
            resultCount: 0
          });
        })
      );

      const result = await listSecretVersionsTool.toolFunction({
        secretId: 'esv-no-versions'
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);
      expect(responseData.result).toHaveLength(0);
      expect(responseData.resultCount).toBe(0);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = listSecretVersionsTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = listSecretVersionsTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept valid secretId values', () => {
      const schema = listSecretVersionsTool.inputSchema.secretId;
      expect(() => schema.parse('esv-my-secret')).not.toThrow();
      expect(() => schema.parse('esv-api-key-prod')).not.toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = listSecretVersionsTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../other')).toThrow();
      expect(() => schema.parse('esv-test/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = listSecretVersionsTool.inputSchema.secretId;
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
        http.get('https://*/environment/secrets/:secretId/versions', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await listSecretVersionsTool.toolFunction({ secretId });

      expect(result.content[0].text).toContain('Failed to list versions for secret');
      expect(result.content[0].text).toContain(secretId);
      expect(result.content[0].type).toBe('text');
    });
  });
});
