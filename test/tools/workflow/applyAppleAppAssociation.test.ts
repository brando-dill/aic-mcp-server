import { describe, it, expect } from 'vitest';
import { applyAppleAppAssociationTool } from '../../../src/tools/workflow/applyAppleAppAssociation.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const DOMAIN = 'openam-example.forgeblocks.com';
const APPLINKS = {
  details: [
    {
      appIDs: ['ABCDE12345.com.example.myapp'],
      components: [{ '/': '/myapp/*' }]
    }
  ]
};
const WEBCREDENTIALS = {
  apps: ['ABCDE12345.com.example.myapp']
};

describe('applyAppleAppAssociation', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyAppleAppAssociation', applyAppleAppAssociationTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should PUT to /openidm/config/fidc/apple-app-site-association.<domain>', async () => {
      await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      const [url, , opts] = getSpy().mock.calls[0];
      expect(url).toContain(`/openidm/config/fidc/apple-app-site-association.${DOMAIN}`);
      expect(opts?.method).toBe('PUT');
    });

    it('should wrap applinks and webcredentials in a "data" property', async () => {
      await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      const body = JSON.parse(getSpy().mock.calls[0][2]?.body as string);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('applinks');
      expect(body.data).toHaveProperty('webcredentials');
      expect(body.data.applinks).toEqual(APPLINKS);
      expect(body.data.webcredentials).toEqual(WEBCREDENTIALS);
    });

    it('should use scope ["fr:idm:*"]', async () => {
      await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idm:*']);
    });

    it('should set Content-Type application/json header', async () => {
      await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      const opts = getSpy().mock.calls[0][2];
      expect(opts?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should make exactly one API call', async () => {
      await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      expect(getSpy().mock.calls).toHaveLength(1);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return domain and updated: true on success', async () => {
      const result = await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('domain', DOMAIN);
      expect(parsed).toHaveProperty('updated', true);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject path traversal in domain', () => {
      const schema = applyAppleAppAssociationTool.inputSchema.domain;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
    });

    it('should accept applinks and webcredentials as records', () => {
      expect(() => applyAppleAppAssociationTool.inputSchema.applinks.parse({ details: [] })).not.toThrow();
      expect(() => applyAppleAppAssociationTool.inputSchema.webcredentials.parse({ apps: [] })).not.toThrow();
    });

    it('should reject non-object applinks', () => {
      expect(() => applyAppleAppAssociationTool.inputSchema.applinks.parse('not-an-object')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface error when PUT returns 4xx', async () => {
      server.use(
        http.put('https://*/openidm/config/fidc/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      expect(result.content[0].text).toContain('Failed to upload Apple app site association');
    });

    it('should surface error when PUT returns 5xx', async () => {
      server.use(
        http.put('https://*/openidm/config/fidc/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'server_error' }), { status: 500 });
        })
      );

      const result = await applyAppleAppAssociationTool.toolFunction({ domain: DOMAIN, applinks: APPLINKS, webcredentials: WEBCREDENTIALS });

      expect(result.content[0].text).toContain('Failed to upload Apple app site association');
    });
  });
});
