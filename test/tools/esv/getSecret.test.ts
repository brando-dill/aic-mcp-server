import { describe, it, expect } from 'vitest';
import { getSecretTool } from '../../../src/tools/esv/getSecret.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getSecret', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getSecret', getSecretTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, headers, and scopes', async () => {
      await getSecretTool.toolFunction({
        secretId: 'esv-my-secret'
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should interpolate secretId into the URL path', async () => {
      await getSecretTool.toolFunction({
        secretId: 'esv-api-key-prod'
      });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('esv-api-key-prod');
      expect(url).toBe('https://test.forgeblocks.com/environment/secrets/esv-api-key-prod');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return secret object from API', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            _id: 'esv-my-secret',
            description: 'My test secret',
            encoding: 'generic',
            useInPlaceholders: true,
            lastChangeDate: '2025-01-11T10:00:00Z',
            lastChangedBy: 'user-123',
            loaded: true,
            loadedVersion: '2',
            activeVersion: '2'
          });
        })
      );

      const result = await getSecretTool.toolFunction({
        secretId: 'esv-my-secret'
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      expect(responseData._id).toBe('esv-my-secret');
      expect(responseData.description).toBe('My test secret');
      expect(responseData.encoding).toBe('generic');
      expect(responseData.useInPlaceholders).toBe(true);
    });

    it('should preserve all fields returned by the API', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            _id: 'esv-test',
            description: 'Test secret',
            encoding: 'pem',
            useInPlaceholders: false,
            lastChangeDate: '2025-06-01T08:00:00Z',
            lastChangedBy: 'admin',
            loaded: false,
            loadedVersion: '0',
            activeVersion: '1'
          });
        })
      );

      const result = await getSecretTool.toolFunction({
        secretId: 'esv-test'
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      expect(responseData._id).toBe('esv-test');
      expect(responseData.encoding).toBe('pem');
      expect(responseData.loaded).toBe(false);
      expect(responseData.activeVersion).toBe('1');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = getSecretTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = getSecretTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept any non-empty string for secretId', () => {
      const schema = getSecretTool.inputSchema.secretId;
      expect(() => schema.parse('esv-test')).not.toThrow();
      expect(() => schema.parse('esv-my-api-key')).not.toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = getSecretTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../secret')).toThrow();
      expect(() => schema.parse('esv-test/other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = getSecretTool.inputSchema.secretId;
      expect(() => schema.parse('%2e%2e%2fetc%2fpasswd')).toThrow();
      expect(() => schema.parse('esv%2ftest')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 404 Not Found error', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify({ code: 404, message: 'Secret not found' }), {
            status: 404
          });
        })
      );

      const result = await getSecretTool.toolFunction({
        secretId: 'esv-nonexistent'
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to get secret');
      expect(responseText).toContain('esv-nonexistent');
    });

    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }), {
            status: 401
          });
        })
      );

      const result = await getSecretTool.toolFunction({
        secretId: 'esv-my-secret'
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to get secret');
      expect(responseText).toContain('esv-my-secret');
    });

    it('should handle 403 Forbidden error', async () => {
      server.use(
        http.get('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify({ code: 403, message: 'Insufficient permissions' }), {
            status: 403
          });
        })
      );

      const result = await getSecretTool.toolFunction({
        secretId: 'esv-protected'
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to get secret');
      expect(responseText).toContain('esv-protected');
    });
  });
});
