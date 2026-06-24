import { describe, it, expect } from 'vitest';
import { setCustomDomainsTool } from '../../../src/tools/tenantConfig/setCustomDomains.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setCustomDomains', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setCustomDomains', setCustomDomainsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, method, headers, and scopes', async () => {
      await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com'] });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/custom-domains/alpha',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should include realm in URL path', async () => {
      await setCustomDomainsTool.toolFunction({ realm: 'bravo', domains: ['test.com'] });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/environment/custom-domains/bravo');
    });

    it('should use scope fr:idc:esv:update', async () => {
      await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com'] });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:update']);
    });

    it('should send domains in request body', async () => {
      await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com', 'auth.example.com'] });

      const [, , options] = getSpy().mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.domains).toEqual(['example.com', 'auth.example.com']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return echoed response body', async () => {
      const result = await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com'] });

      expect(result.content[0].text).toContain('example.com');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should only accept alpha or bravo realm', () => {
      expect(() => setCustomDomainsTool.inputSchema.realm.parse('invalid')).toThrow();
      expect(() => setCustomDomainsTool.inputSchema.realm.parse('alpha')).not.toThrow();
      expect(() => setCustomDomainsTool.inputSchema.realm.parse('bravo')).not.toThrow();
    });

    it('should accept array of strings for domains', () => {
      expect(() => setCustomDomainsTool.inputSchema.domains.parse(['example.com'])).not.toThrow();
      expect(() => setCustomDomainsTool.inputSchema.domains.parse([])).not.toThrow();
    });

    it('should reject non-array for domains', () => {
      expect(() => setCustomDomainsTool.inputSchema.domains.parse('example.com')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 400 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/custom-domains/:realm',
          () => new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 })
        )
      );

      const result = await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com'] });

      expect(result.content[0].text).toContain('Failed to set custom domains');
    });

    it('should surface 403 error message', async () => {
      server.use(
        http.put(
          'https://*/environment/custom-domains/:realm',
          () => new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        )
      );

      const result = await setCustomDomainsTool.toolFunction({ realm: 'alpha', domains: ['example.com'] });

      expect(result.content[0].text).toContain('Failed to set custom domains');
    });
  });
});
