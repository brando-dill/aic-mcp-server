import { describe, it, expect } from 'vitest';
import { setActiveSecretVersionTool } from '../../../src/tools/esv/setActiveSecretVersion.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setActiveSecretVersion', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setActiveSecretVersion', setActiveSecretVersionTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build POST request with correct URL, scopes, and headers', async () => {
      await setActiveSecretVersionTool.toolFunction({
        secretId: 'esv-my-secret',
        version: '2'
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret/versions/2?_action=changestatus',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should send { status: "ENABLED" } as the request body', async () => {
      await setActiveSecretVersionTool.toolFunction({
        secretId: 'esv-test',
        version: '3'
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody).toEqual({ status: 'ENABLED' });
    });

    it('should interpolate secretId and version into the URL path', async () => {
      await setActiveSecretVersionTool.toolFunction({
        secretId: 'esv-api-key-prod',
        version: '5'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe(
        'https://test.forgeblocks.com/environment/secrets/esv-api-key-prod/versions/5?_action=changestatus'
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the updated version status object from the API', async () => {
      server.use(
        http.post('https://*/environment/secrets/:secretId/versions/:version', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            version: '2',
            status: 'ENABLED',
            createDate: '2025-01-11T10:00:00Z'
          });
        })
      );

      const result = await setActiveSecretVersionTool.toolFunction({
        secretId: 'esv-my-secret',
        version: '2'
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);
      expect(responseData.version).toBe('2');
      expect(responseData.status).toBe('ENABLED');
    });

    it('should return text content type', async () => {
      const result = await setActiveSecretVersionTool.toolFunction({
        secretId: 'esv-test',
        version: '1'
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = setActiveSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should require version parameter', () => {
      const schema = setActiveSecretVersionTool.inputSchema.version;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = setActiveSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should reject empty version', () => {
      const schema = setActiveSecretVersionTool.inputSchema.version;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept valid version values', () => {
      const schema = setActiveSecretVersionTool.inputSchema.version;
      expect(() => schema.parse('1')).not.toThrow();
      expect(() => schema.parse('2')).not.toThrow();
      expect(() => schema.parse('10')).not.toThrow();
    });

    it('should accept valid secretId values', () => {
      const schema = setActiveSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('esv-my-secret')).not.toThrow();
      expect(() => schema.parse('esv-api-key-prod')).not.toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = setActiveSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../other')).toThrow();
      expect(() => schema.parse('esv-test/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = setActiveSecretVersionTool.inputSchema.secretId;
      expect(() => schema.parse('%2e%2e%2fetc%2fpasswd')).toThrow();
      expect(() => schema.parse('esv%2ftest')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, body: { error: 'unauthorized', message: 'Invalid token' }, secretId: 'esv-test', version: '2' },
      {
        status: 404,
        body: { code: 404, message: 'Version not found' },
        secretId: 'esv-nonexistent',
        version: '99'
      },
      {
        status: 400,
        body: { code: 400, message: 'Invalid status transition' },
        secretId: 'esv-test',
        version: '1'
      }
    ])('handles $status errors', async ({ status, body, secretId, version }) => {
      server.use(
        http.post('https://*/environment/secrets/:secretId/versions/:version', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await setActiveSecretVersionTool.toolFunction({ secretId, version });

      expect(result.content[0].text).toContain('Failed to set active version');
      expect(result.content[0].text).toContain(secretId);
      expect(result.content[0].text).toContain(version);
      expect(result.content[0].type).toBe('text');
    });
  });
});
