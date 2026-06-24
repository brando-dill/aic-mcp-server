import { describe, it, expect } from 'vitest';
import { setCookieDomainsTool } from '../../../src/tools/tenantConfig/setCookieDomains.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setCookieDomains', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setCookieDomains', setCookieDomainsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, method, headers, and scopes', async () => {
      await setCookieDomainsTool.toolFunction({ domains: ['example.com'] });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/cookie-domains',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should use scope fr:idc:esv:update', async () => {
      await setCookieDomainsTool.toolFunction({ domains: ['example.com'] });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });

    it('should send domains in request body', async () => {
      await setCookieDomainsTool.toolFunction({ domains: ['example.com', 'auth.example.com'] });

      const [, , options] = getSpy().mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.domains).toEqual(['example.com', 'auth.example.com']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return echoed response body', async () => {
      const result = await setCookieDomainsTool.toolFunction({ domains: ['example.com'] });

      expect(result.content[0].text).toContain('example.com');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept array of strings for domains', () => {
      expect(() => setCookieDomainsTool.inputSchema.domains.parse(['example.com'])).not.toThrow();
      expect(() => setCookieDomainsTool.inputSchema.domains.parse([])).not.toThrow();
    });

    it('should reject non-array for domains', () => {
      expect(() => setCookieDomainsTool.inputSchema.domains.parse('example.com')).toThrow();
    });

    it('should reject undefined for domains', () => {
      expect(() => setCookieDomainsTool.inputSchema.domains.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 400 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/cookie-domains',
          () => new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 })
        )
      );

      const result = await setCookieDomainsTool.toolFunction({ domains: ['example.com'] });

      expect(result.content[0].text).toContain('Failed to set cookie domains');
    });

    it('should surface 403 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/cookie-domains',
          () => new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        )
      );

      const result = await setCookieDomainsTool.toolFunction({ domains: ['example.com'] });

      expect(result.content[0].text).toContain('Failed to set cookie domains');
    });
  });
});
