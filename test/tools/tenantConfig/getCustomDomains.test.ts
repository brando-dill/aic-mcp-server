import { describe, it, expect } from 'vitest';
import { getCustomDomainsTool } from '../../../src/tools/tenantConfig/getCustomDomains.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getCustomDomains', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getCustomDomains', getCustomDomainsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, headers, and scopes', async () => {
      await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/custom-domains/alpha',
        ['fr:idc:esv:read'],
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=1.0'
          })
        })
      );
    });

    it('should include realm in URL path', async () => {
      await getCustomDomainsTool.toolFunction({ realm: 'bravo' });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/environment/custom-domains/bravo');
    });

    it('should use scope fr:idc:esv:read', async () => {
      await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:esv:read']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return domains in response', async () => {
      const result = await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('example.com');
    });

    it('should return realm in response', async () => {
      const result = await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('alpha');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should only accept alpha or bravo realm', () => {
      expect(() => getCustomDomainsTool.inputSchema.realm.parse('invalid')).toThrow();
      expect(() => getCustomDomainsTool.inputSchema.realm.parse('alpha')).not.toThrow();
      expect(() => getCustomDomainsTool.inputSchema.realm.parse('bravo')).not.toThrow();
    });

    it('should reject empty string as realm', () => {
      expect(() => getCustomDomainsTool.inputSchema.realm.parse('')).toThrow();
    });

    it('should reject undefined realm', () => {
      expect(() => getCustomDomainsTool.inputSchema.realm.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface 404 error message', async () => {
      server.use(
        http.get('https://*/environment/custom-domains/:realm', () => new HttpResponse(null, { status: 404 }))
      );

      const result = await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to get custom domains');
    });

    it('should surface 401 error message', async () => {
      server.use(
        http.get(
          'https://*/environment/custom-domains/:realm',
          () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        )
      );

      const result = await getCustomDomainsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to get custom domains');
    });
  });
});
