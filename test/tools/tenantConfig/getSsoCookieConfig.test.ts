import { describe, it, expect } from 'vitest';
import { getSsoCookieConfigTool } from '../../../src/tools/tenantConfig/getSsoCookieConfig.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getSsoCookieConfig', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getSsoCookieConfig', getSsoCookieConfigTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, headers, and scopes', async () => {
      await getSsoCookieConfigTool.toolFunction({} as any);

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/sso-cookie',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'protocol=1.0,resource=1.0'
          })
        })
      );
    });

    it('should use scope fr:idc:esv:read', async () => {
      await getSsoCookieConfigTool.toolFunction({} as any);

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:read']);
    });

    it('should not include method (default GET)', async () => {
      await getSsoCookieConfigTool.toolFunction({} as any);

      const [, , options] = getSpy().mock.calls[0];
      expect(options?.method).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return cookie name in response', async () => {
      const result = await getSsoCookieConfigTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('iPlanetDirectoryPro');
    });

    it('should return cookie domain in response', async () => {
      const result = await getSsoCookieConfigTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('example.com');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 404 error message', async () => {
      server.use(http.get('https://*/environment/sso-cookie', () => new HttpResponse(null, { status: 404 })));

      const result = await getSsoCookieConfigTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('Failed to get SSO cookie config');
    });

    it('should surface 401 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/sso-cookie',
          () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        )
      );

      const result = await getSsoCookieConfigTool.toolFunction({} as any);

      expect(result.content[0].text).toContain('Failed to get SSO cookie config');
    });
  });
});
