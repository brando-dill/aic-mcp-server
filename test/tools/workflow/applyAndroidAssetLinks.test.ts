import { describe, it, expect } from 'vitest';
import { applyAndroidAssetLinksTool } from '../../../src/tools/workflow/applyAndroidAssetLinks.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const DOMAIN = 'openam-example.forgeblocks.com';
const ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.example.myapp',
      sha256_cert_fingerprints: ['AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99']
    }
  }
];

describe('applyAndroidAssetLinks', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyAndroidAssetLinks', applyAndroidAssetLinksTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should PUT to /openidm/config/fidc/assetlinks.<domain>', async () => {
      await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      const [url, , opts] = getSpy().mock.calls[0];
      expect(url).toContain(`/openidm/config/fidc/assetlinks.${DOMAIN}`);
      expect(opts?.method).toBe('PUT');
    });

    it('should wrap assetLinks array in a "data" property', async () => {
      await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      const body = JSON.parse(getSpy().mock.calls[0][2]?.body as string);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toEqual(ASSET_LINKS);
    });

    it('should use scope ["fr:idm:*"]', async () => {
      await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idm:*']);
    });

    it('should set Content-Type application/json header', async () => {
      await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      const opts = getSpy().mock.calls[0][2];
      expect(opts?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should make exactly one API call', async () => {
      await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      expect(getSpy().mock.calls).toHaveLength(1);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return domain and updated: true on success', async () => {
      const result = await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('domain', DOMAIN);
      expect(parsed).toHaveProperty('updated', true);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject path traversal in domain', () => {
      const schema = applyAndroidAssetLinksTool.inputSchema.domain;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
    });

    it('should require assetLinks to be a non-empty array', () => {
      const schema = applyAndroidAssetLinksTool.inputSchema.assetLinks;
      expect(() => schema.parse([])).toThrow();
      expect(() => schema.parse([{ relation: [], target: {} }])).not.toThrow();
    });

    it('should reject non-array assetLinks', () => {
      const schema = applyAndroidAssetLinksTool.inputSchema.assetLinks;
      expect(() => schema.parse('not-an-array')).toThrow();
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

      const result = await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      expect(result.content[0].text).toContain('Failed to upload Android asset links');
    });

    it('should surface error when PUT returns 5xx', async () => {
      server.use(
        http.put('https://*/openidm/config/fidc/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'server_error' }), { status: 500 });
        })
      );

      const result = await applyAndroidAssetLinksTool.toolFunction({ domain: DOMAIN, assetLinks: ASSET_LINKS });

      expect(result.content[0].text).toContain('Failed to upload Android asset links');
    });
  });
});
