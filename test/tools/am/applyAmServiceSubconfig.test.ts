import { describe, it, expect } from 'vitest';
import { applyAmServiceSubconfigTool } from '../../../src/tools/am/applyAmServiceSubconfig.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applyAmServiceSubconfig', () => {
  const getSpy = setupTestEnvironment();

  const subconfig = { clientId: 'new-client-id', scopes: ['openid', 'profile', 'email'] };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyAmServiceSubconfig', applyAmServiceSubconfigTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should make GET request first to fetch existing sub-config', async () => {
      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig
      });

      const firstCall = getSpy().mock.calls[0];
      expect(firstCall[0]).toBe(
        'https://test.forgeblocks.com/am/json/alpha/services/SocialIdentityProviders/google/my-google-provider'
      );
      expect(firstCall[2]?.method).toBe('GET');
    });

    it('should make PUT request second with merged sub-config', async () => {
      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig
      });

      const secondCall = getSpy().mock.calls[1];
      expect(secondCall[0]).toBe(
        'https://test.forgeblocks.com/am/json/alpha/services/SocialIdentityProviders/google/my-google-provider'
      );
      expect(secondCall[2]?.method).toBe('PUT');
    });

    it('should use accept-api-version protocol=2.1,resource=1.0 for both calls', async () => {
      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig
      });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use scope fr:am:* for both calls', async () => {
      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig
      });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should strip _rev from fetched sub-config before PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return HttpResponse.json({
            _id: 'my-google-provider',
            _rev: 'rev-should-be-stripped',
            clientId: 'old-client-id'
          });
        })
      );

      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should strip _rev from caller-supplied subconfig before PUT', async () => {
      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig: { ...subconfig, _rev: 'caller-rev-should-be-stripped' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should merge caller overrides over existing sub-config fields', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return HttpResponse.json({
            _id: 'my-google-provider',
            _type: { _id: 'google', name: 'Google' },
            existingField: 'preserved-value',
            clientId: 'old-client-id'
          });
        })
      );

      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-google-provider',
        subconfig: { clientId: 'new-client-id' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body.existingField).toBe('preserved-value');
      expect(body.clientId).toBe('new-client-id');
    });

    it('should perform direct PUT with caller subconfig when GET returns 404 (create path)', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'new-provider',
        subconfig
      });

      // Should make exactly 2 calls: GET (404) and PUT (create)
      expect(getSpy().mock.calls).toHaveLength(2);
      const putOptions = getSpy().mock.calls[1][2];
      expect(putOptions?.method).toBe('PUT');
      const body = JSON.parse(putOptions?.body as string);
      expect(body.clientId).toBe('new-client-id');
    });

    it('should not include _rev from caller subconfig even on the create (404) path', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'new-provider',
        subconfig: { ...subconfig, _rev: 'should-be-stripped' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceType with safePathSegmentSchema', () => {
      const schema = applyAmServiceSubconfigTool.inputSchema.serviceType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('SocialIdentityProviders')).not.toThrow();
    });

    it('should validate subType with safePathSegmentSchema', () => {
      const schema = applyAmServiceSubconfigTool.inputSchema.subType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('google')).not.toThrow();
    });

    it('should validate id with safePathSegmentSchema', () => {
      const schema = applyAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('my-provider')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in id', () => {
      const schema = applyAmServiceSubconfigTool.inputSchema.id;
      expect(() => schema.parse('%2e%2e%2fprovider')).toThrow();
    });

    it('should accept any key-value pairs in subconfig', () => {
      const schema = applyAmServiceSubconfigTool.inputSchema.subconfig;
      expect(() => schema.parse({ key: 'value', nested: { inner: 42 } })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface non-404 GET error', async () => {
      server.use(
        http.get('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-provider',
        subconfig
      });

      expect(result.content[0].text).toContain('Failed to apply sub-configuration');
    });

    it('should surface PUT error when sub-config update fails', async () => {
      server.use(
        http.put('https://*/am/json/*/services/:serviceType/:subType/:id', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applyAmServiceSubconfigTool.toolFunction({
        realm: 'alpha',
        serviceType: 'SocialIdentityProviders',
        subType: 'google',
        id: 'my-provider',
        subconfig
      });

      expect(result.content[0].text).toContain('Failed to apply sub-configuration');
    });
  });
});
