import { describe, it, expect } from 'vitest';
import { getCookieDomainsTool } from '../../../src/tools/tenantConfig/getCookieDomains.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getCookieDomains', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getCookieDomains', getCookieDomainsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, headers, and scopes', async () => {
      await getCookieDomainsTool.toolFunction({} as any);

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/cookie-domains',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should use scope fr:idc:esv:read', async () => {
      await getCookieDomainsTool.toolFunction({} as any);

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:read']);
    });

    it('should not include method (default GET)', async () => {
      await getCookieDomainsTool.toolFunction({} as any);

      const [, , options] = getSpy().mock.calls[0];
      expect(options?.method).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return domains in response', async () => {
      const result = await getCookieDomainsTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('example.com');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 404 error message', async () => {
      server.use(http.get('https://*/environment/cookie-domains', () => new HttpResponse(null, { status: 404 })));

      const result = await getCookieDomainsTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('Failed to get cookie domains');
    });

    it('should surface 401 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/cookie-domains',
          () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        )
      );

      const result = await getCookieDomainsTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('Failed to get cookie domains');
    });
  });
});
