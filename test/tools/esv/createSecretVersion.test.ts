import { describe, it, expect } from 'vitest';
import { createSecretVersionTool } from '../../../src/tools/esv/createSecretVersion.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createSecretVersion', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createSecretVersion', createSecretVersionTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build POST request with correct URL, scopes, and headers', async () => {
      await createSecretVersionTool.toolFunction({
        secretId: 'esv-my-secret',
        valueBase64: Buffer.from('my-secret-value').toString('base64')
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret/versions?_action=create',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should include valueBase64 in the request body', async () => {
      const valueBase64 = Buffer.from('new-version-value').toString('base64');

      await createSecretVersionTool.toolFunction({
        secretId: 'esv-test',
        valueBase64
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody.valueBase64).toBe(valueBase64);
    });

    it('should not include extraneous fields in the request body', async () => {
      const valueBase64 = 'dGVzdA==';

      await createSecretVersionTool.toolFunction({
        secretId: 'esv-test',
        valueBase64
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(Object.keys(requestBody)).toEqual(['valueBase64']);
    });

    it('should interpolate secretId into the URL path', async () => {
      await createSecretVersionTool.toolFunction({
        secretId: 'esv-api-key-prod',
        valueBase64: 'dGVzdA=='
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('esv-api-key-prod');
      expect(url).toBe('https://test.forgeblocks.com/environment/secrets/esv-api-key-prod/versions?_action=create');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the created version object from the API', async () => {
      server.use(
        http.post('https://*/environment/secrets/:secretId/versions', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            version: '3',
            status: 'DISABLED',
            createDate: '2025-06-22T10:00:00Z'
          });
        })
      );

      const result = await createSecretVersionTool.toolFunction({
        secretId: 'esv-my-secret',
        valueBase64: 'dGVzdA=='
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);
      expect(responseData.version).toBe('3');
      expect(responseData.status).toBe('DISABLED');
    });

    it('should return text content type', async () => {
      const result = await createSecretVersionTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA=='
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = createSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should require valueBase64 parameter', () => {
      const schema = createSecretVersionTool.inputSchema.valueBase64;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = createSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept valid secretId values', () => {
      const schema = createSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('esv-my-secret')).not.toThrow();
      expect(() => schema.parse('esv-api-key-prod')).not.toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = createSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../other')).toThrow();
      expect(() => schema.parse('esv-test/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = createSecretVersionTool.inputSchema.secretId;
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
        http.post('https://*/environment/secrets/:secretId/versions', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await createSecretVersionTool.toolFunction({
        secretId,
        valueBase64: 'dGVzdA=='
      });

      expect(result.content[0].text).toContain('Failed to create version for secret');
      expect(result.content[0].text).toContain(secretId);
      expect(result.content[0].type).toBe('text');
    });
  });
});
