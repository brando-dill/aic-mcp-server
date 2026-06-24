import { describe, it, expect } from 'vitest';
import { applyAmServiceTool } from '../../../src/tools/am/applyAmService.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applyAmService', () => {
  const getSpy = setupTestEnvironment();

  const serviceConfig = { defaultScript: { AUTHENTICATION_TREE_DECISION_NODE: { script: 'new-script-id' } } };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyAmService', applyAmServiceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should make GET request first to fetch existing service', async () => {
      await applyAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting', serviceConfig });

      const firstCall = getSpy().mock.calls[0];
      expect(firstCall[0]).toBe('https://test.forgeblocks.com/am/json/alpha/services/scripting');
      expect(firstCall[2]?.method).toBe('GET');
    });

    it('should make PUT request second with merged service config', async () => {
      await applyAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting', serviceConfig });

      const secondCall = getSpy().mock.calls[1];
      expect(secondCall[0]).toBe('https://test.forgeblocks.com/am/json/alpha/services/scripting');
      expect(secondCall[2]?.method).toBe('PUT');
    });

    it('should use accept-api-version protocol=2.1,resource=1.0 for both calls', async () => {
      await applyAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting', serviceConfig });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use scope fr:am:* for both calls', async () => {
      await applyAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting', serviceConfig });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });

    it('should URL-encode serviceType', async () => {
      await applyAmServiceTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        serviceConfig
      });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/services/SocialIdentityProviders');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should strip _rev from fetched service before PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return HttpResponse.json({
            _id: 'scripting',
            _rev: 'rev-should-be-stripped',
            _type: { _id: 'scripting', name: 'Scripting' },
            existingField: 'existing-value'
          });
        })
      );

      await applyAmServiceTool.toolFunction({ realm: 'alpha', serviceType: 'scripting', serviceConfig });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should strip _rev from caller-supplied serviceConfig before PUT', async () => {
      await applyAmServiceTool.toolFunction({
        realm: 'alpha',
        serviceType: 'scripting',
        serviceConfig: { ...serviceConfig, _rev: 'caller-rev-should-be-stripped' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should merge caller overrides over existing service fields', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return HttpResponse.json({
            _id: 'scripting',
            _type: { _id: 'scripting', name: 'Scripting' },
            existingField: 'preserved-value',
            defaultScript: { AUTHENTICATION_TREE_DECISION_NODE: { script: 'old-script-id' } }
          });
        })
      );

      await applyAmServiceTool.toolFunction({
        realm: 'alpha',
        serviceType: 'scripting',
        serviceConfig: { defaultScript: { AUTHENTICATION_TREE_DECISION_NODE: { script: 'new-script-id' } } }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body.existingField).toBe('preserved-value');
      expect(body.defaultScript.AUTHENTICATION_TREE_DECISION_NODE.script).toBe('new-script-id');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = applyAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('scripting')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in serviceType', () => {
      const schema = applyAmServiceTool.inputSchema.serviceType;
      expect(() => schema.parse('%2e%2e%2fscripting')).toThrow();
    });

    it('should accept any key-value pairs in serviceConfig', () => {
      const schema = applyAmServiceTool.inputSchema.serviceConfig;
      expect(() => schema.parse({ key: 'value', nested: { inner: 42 } })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface GET error when service is not found (404)', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await applyAmServiceTool.toolFunction({
        realm: 'alpha',
        serviceType: 'nonexistent',
        serviceConfig
      });

      expect(result.content[0].text).toContain('Failed to apply AM service');
      expect(result.content[0].text).toContain('nonexistent');
    });

    it('should surface PUT error when service update fails', async () => {
      server.use(
        http.put('https://*/am/json/*/services/:serviceType', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applyAmServiceTool.toolFunction({
        realm: 'alpha',
        serviceType: 'scripting',
        serviceConfig
      });

      expect(result.content[0].text).toContain('Failed to apply AM service');
    });
  });
});
