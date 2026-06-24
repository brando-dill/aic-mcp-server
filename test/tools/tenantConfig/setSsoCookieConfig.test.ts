import { describe, it, expect } from 'vitest';
import { setSsoCookieConfigTool } from '../../../src/tools/tenantConfig/setSsoCookieConfig.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setSsoCookieConfig', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setSsoCookieConfig', setSsoCookieConfigTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, method, headers, and scopes', async () => {
      await setSsoCookieConfigTool.toolFunction({
        ssoCookieConfig: { cookieName: 'iPlanetDirectoryPro' }
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/sso-cookie',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'accept-api-version': 'protocol=1.0,resource=1.0'
          })
        })
      );
    });

    it('should use scope fr:idc:esv:update', async () => {
      await setSsoCookieConfigTool.toolFunction({ ssoCookieConfig: { cookieName: 'test' } });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });

    it('should send ssoCookieConfig directly as request body', async () => {
      const config = { cookieName: 'MySession', secureCookie: true, cookieDomain: 'example.com' };
      await setSsoCookieConfigTool.toolFunction({ ssoCookieConfig: config });

      const [, , options] = getSpy().mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual(config);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return echoed response body', async () => {
      const result = await setSsoCookieConfigTool.toolFunction({
        ssoCookieConfig: { cookieName: 'iPlanetDirectoryPro' }
      });

      expect(result.content[0].text).toContain('iPlanetDirectoryPro');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept record object for ssoCookieConfig', () => {
      expect(() => setSsoCookieConfigTool.inputSchema.ssoCookieConfig.parse({ cookieName: 'test' })).not.toThrow();
    });

    it('should accept empty object for ssoCookieConfig', () => {
      expect(() => setSsoCookieConfigTool.inputSchema.ssoCookieConfig.parse({})).not.toThrow();
    });

    it('should reject non-object for ssoCookieConfig', () => {
      expect(() => setSsoCookieConfigTool.inputSchema.ssoCookieConfig.parse('string')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 400 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/sso-cookie',
          () => new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 })
        )
      );

      const result = await setSsoCookieConfigTool.toolFunction({ ssoCookieConfig: { cookieName: 'test' } });

      expect(result.content[0].text).toContain('Failed to set SSO cookie config');
    });

    it('should surface 403 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/sso-cookie',
          () => new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        )
      );

      const result = await setSsoCookieConfigTool.toolFunction({ ssoCookieConfig: { cookieName: 'test' } });

      expect(result.content[0].text).toContain('Failed to set SSO cookie config');
    });
  });
});
