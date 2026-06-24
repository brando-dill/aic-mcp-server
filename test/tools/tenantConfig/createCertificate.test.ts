import { describe, it, expect } from 'vitest';
import { createCertificateTool } from '../../../src/tools/tenantConfig/createCertificate.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const validInput = {
  active: true,
  certificate: '-----BEGIN CERTIFICATE-----\nMIIBxxx\n-----END CERTIFICATE-----',
  privateKey: '-----BEGIN PRIVATE KEY-----\nMIIBxxx\n-----END PRIVATE KEY-----'
};

describe('createCertificate', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createCertificate', createCertificateTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build POST request with URL, headers, and scopes', async () => {
      await createCertificateTool.toolFunction(validInput);

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/certificates',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should use POST method', async () => {
      await createCertificateTool.toolFunction(validInput);

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should use scope fr:idc:esv:update', async () => {
      await createCertificateTool.toolFunction(validInput);

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });

    it('should include active, certificate, and privateKey in request body', async () => {
      await createCertificateTool.toolFunction(validInput);

      const [, , options] = getSpy().mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.active).toBe(validInput.active);
      expect(body.certificate).toBe(validInput.certificate);
      expect(body.privateKey).toBe(validInput.privateKey);
    });

    it('should target the /environment/certificates endpoint', async () => {
      await createCertificateTool.toolFunction(validInput);

      const [url] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/environment/certificates');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return new certificate id in response', async () => {
      const result = await createCertificateTool.toolFunction(validInput);

      expect(result.content[0].text).toContain('new-cert-id');
      expect(result.content[0].type).toBe('text');
    });

    it('should include active flag in response', async () => {
      const result = await createCertificateTool.toolFunction(validInput);

      expect(result.content[0].text).toContain('active');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require active parameter', () => {
      expect(() => createCertificateTool.inputSchema.active.parse(undefined)).toThrow();
    });

    it('should reject non-boolean active', () => {
      expect(() => createCertificateTool.inputSchema.active.parse('true')).toThrow();
      expect(() => createCertificateTool.inputSchema.active.parse(1)).toThrow();
    });

    it('should accept boolean active', () => {
      expect(() => createCertificateTool.inputSchema.active.parse(true)).not.toThrow();
      expect(() => createCertificateTool.inputSchema.active.parse(false)).not.toThrow();
    });

    it('should require certificate parameter', () => {
      expect(() => createCertificateTool.inputSchema.certificate.parse(undefined)).toThrow();
    });

    it('should require privateKey parameter', () => {
      expect(() => createCertificateTool.inputSchema.privateKey.parse(undefined)).toThrow();
    });

    it('should accept string certificate and privateKey', () => {
      expect(() => createCertificateTool.inputSchema.certificate.parse('-----BEGIN CERTIFICATE-----')).not.toThrow();
      expect(() => createCertificateTool.inputSchema.privateKey.parse('-----BEGIN PRIVATE KEY-----')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request' },
      { status: 401, desc: '401 Unauthorized' },
      { status: 409, desc: '409 Conflict' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.post('https://*/environment/certificates', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await createCertificateTool.toolFunction(validInput);

      expect(result.content[0].text).toContain('Failed to create certificate');
    });
  });
});
