import { describe, it, expect } from 'vitest';
import { setSecretTool } from '../../../src/tools/esv/setSecret.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setSecret', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setSecret', setSecretTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build PUT request with URL, headers, and scopes', async () => {
      await setSecretTool.toolFunction({
        secretId: 'esv-my-secret',
        valueBase64: Buffer.from('my-secret-value').toString('base64')
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should include secretId and valueBase64 in request body', async () => {
      const valueBase64 = Buffer.from('test-value').toString('base64');

      await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody._id).toBe('esv-test');
      expect(requestBody.valueBase64).toBe(valueBase64);
    });

    it('should include optional description in request body when provided', async () => {
      await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA==',
        description: 'My secret description'
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody.description).toBe('My secret description');
    });

    it('should not include description in body when omitted', async () => {
      await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA=='
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody).not.toHaveProperty('description');
    });

    it('should include encoding in request body when provided', async () => {
      await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA==',
        encoding: 'pem'
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody.encoding).toBe('pem');
    });

    it('should include useInPlaceholders in request body when provided', async () => {
      await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA==',
        useInPlaceholders: true
      });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      const requestBody = JSON.parse(options.body as string);
      expect(requestBody.useInPlaceholders).toBe(true);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success message with secretId', async () => {
      server.use(
        http.put('https://*/environment/secrets/:secretId', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            _id: 'esv-my-secret'
          });
        })
      );

      const result = await setSecretTool.toolFunction({
        secretId: 'esv-my-secret',
        valueBase64: 'dGVzdA=='
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('esv-my-secret');
      expect(responseText).toContain('Pod restart required');
    });

    it('should return text content type', async () => {
      const result = await setSecretTool.toolFunction({
        secretId: 'esv-test',
        valueBase64: 'dGVzdA=='
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require secretId parameter', () => {
      const schema = setSecretTool.inputSchema.secretId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should require valueBase64 parameter', () => {
      const schema = setSecretTool.inputSchema.valueBase64;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject empty secretId', () => {
      const schema = setSecretTool.inputSchema.secretId;
      expect(() => schema.parse('')).toThrow();
    });

    it('should reject path traversal in secretId', () => {
      const schema = setSecretTool.inputSchema.secretId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('esv-test/../other')).toThrow();
    });

    it('should reject URL-encoded path traversal in secretId', () => {
      const schema = setSecretTool.inputSchema.secretId;
      expect(() => schema.parse('%2e%2e%2fetc%2fpasswd')).toThrow();
    });

    it('should accept valid encoding values', () => {
      const schema = setSecretTool.inputSchema.encoding;
      expect(() => schema!.parse('generic')).not.toThrow();
      expect(() => schema!.parse('pem')).not.toThrow();
      expect(() => schema!.parse('base64hmac')).not.toThrow();
    });

    it('should reject invalid encoding values', () => {
      const schema = setSecretTool.inputSchema.encoding;
      expect(() => schema!.parse('invalid')).toThrow();
      expect(() => schema!.parse('base64')).toThrow();
    });

    it('should allow optional encoding', () => {
      const schema = setSecretTool.inputSchema.encoding;
      expect(() => schema!.parse(undefined)).not.toThrow();
    });

    it('should allow optional description', () => {
      const schema = setSecretTool.inputSchema.description;
      expect(() => schema!.parse(undefined)).not.toThrow();
      expect(() => schema!.parse('My description')).not.toThrow();
    });

    it('should allow optional useInPlaceholders', () => {
      const schema = setSecretTool.inputSchema.useInPlaceholders;
      expect(() => schema!.parse(undefined)).not.toThrow();
      expect(() => schema!.parse(true)).not.toThrow();
      expect(() => schema!.parse(false)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, body: { error: 'unauthorized', message: 'Invalid token' }, secretId: 'esv-test' },
      { status: 400, body: { code: 400, message: 'Bad request' }, secretId: 'esv-invalid' },
      { status: 403, body: { code: 403, message: 'Insufficient permissions' }, secretId: 'esv-protected' }
    ])('handles $status errors', async ({ status, body, secretId }) => {
      server.use(
        http.put('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await setSecretTool.toolFunction({
        secretId,
        valueBase64: 'dGVzdA=='
      });

      expect(result.content[0].text).toContain('Failed to set secret');
      expect(result.content[0].text).toContain(secretId);
      expect(result.content[0].type).toBe('text');
    });
  });
});
