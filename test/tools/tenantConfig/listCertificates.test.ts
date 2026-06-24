import { describe, it, expect } from 'vitest';
import { listCertificatesTool } from '../../../src/tools/tenantConfig/listCertificates.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listCertificates', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listCertificates', listCertificatesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build GET request with URL, headers, and scopes', async () => {
      await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/certificates',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should use scope fr:idc:esv:read', async () => {
      await listCertificatesTool.toolFunction({} as Record<string, never>);

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:read']);
    });

    it('should not include a method override (defaults to GET)', async () => {
      await listCertificatesTool.toolFunction({} as Record<string, never>);

      const [, , options] = getSpy().mock.calls[0];
      expect(options?.method).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return list of certificates in response', async () => {
      const result = await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(result.content[0].text).toContain('cert-1');
      expect(result.content[0].type).toBe('text');
    });

    it('should include certificate subject in response', async () => {
      const result = await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(result.content[0].text).toContain('CN=example.com');
    });

    it('should include resultCount in response', async () => {
      const result = await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(result.content[0].text).toContain('resultCount');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 401 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/certificates',
          () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        )
      );

      const result = await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(result.content[0].text).toContain('Failed to list certificates');
    });

    it('should surface 403 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/certificates',
          () => new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        )
      );

      const result = await listCertificatesTool.toolFunction({} as Record<string, never>);

      expect(result.content[0].text).toContain('Failed to list certificates');
    });
  });
});
