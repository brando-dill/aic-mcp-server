import { describe, it, expect } from 'vitest';
import { applyGlobalAmServiceTool } from '../../../src/tools/am/applyGlobalAmService.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applyGlobalAmService', () => {
  const getSpy = setupTestEnvironment();

  const serviceConfig = { enabled: false, maxConnections: 100 };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyGlobalAmService', applyGlobalAmServiceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should make GET request first to fetch existing global service config', async () => {
      await applyGlobalAmServiceTool.toolFunction({ serviceName: 'OAuth2Provider', serviceConfig });

      const firstCall = getSpy().mock.calls[0];
      expect(firstCall[0]).toBe(
        'https://test.forgeblocks.com/am/json/global-config/services/OAuth2Provider/configuration'
      );
      expect(firstCall[2]?.method).toBe('GET');
    });

    it('should make PUT request second with merged service config', async () => {
      await applyGlobalAmServiceTool.toolFunction({ serviceName: 'OAuth2Provider', serviceConfig });

      const secondCall = getSpy().mock.calls[1];
      expect(secondCall[0]).toBe(
        'https://test.forgeblocks.com/am/json/global-config/services/OAuth2Provider/configuration'
      );
      expect(secondCall[2]?.method).toBe('PUT');
    });

    it('should use accept-api-version resource=1.0 for both GET and PUT calls', async () => {
      await applyGlobalAmServiceTool.toolFunction({ serviceName: 'OAuth2Provider', serviceConfig });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should use scope fr:am:* for both calls', async () => {
      await applyGlobalAmServiceTool.toolFunction({ serviceName: 'OAuth2Provider', serviceConfig });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });

    it('should URL-encode serviceName with special characters in the request URL', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return HttpResponse.json({ _id: 'OAuth2%20Provider', enabled: true });
        })
      );

      await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2 Provider',
        serviceConfig: { enabled: false }
      });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/global-config/services/OAuth2%20Provider/configuration');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return merged config fields in the success response text', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return HttpResponse.json({
            _id: 'OAuth2Provider',
            enabled: true,
            maxConnections: 50
          });
        }),
        http.put('https://*/am/json/global-config/services/:serviceName/configuration', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ _id: 'OAuth2Provider', ...body });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig: { enabled: false, maxConnections: 100 }
      });

      expect(result.content[0].text).toContain('OAuth2Provider');
      expect(result.content[0].text).toContain('"enabled"');
      expect(result.content[0].text).toContain('"maxConnections"');
    });

    it('should include the PUT response data in the success response text', async () => {
      server.use(
        http.put('https://*/am/json/global-config/services/:serviceName/configuration', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            _id: 'CorsService',
            _type: { _id: 'CorsService', name: 'CORS Service' },
            ...body
          });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'CorsService',
        serviceConfig: { acceptedOrigins: ['https://example.com'] }
      });

      expect(result.content[0].text).toContain('CorsService');
      expect(result.content[0].text).toContain('acceptedOrigins');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should strip _rev from fetched service config before PUT', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return HttpResponse.json({
            _id: 'OAuth2Provider',
            _rev: 'rev-should-be-stripped',
            enabled: true,
            existingField: 'existing-value'
          });
        })
      );

      await applyGlobalAmServiceTool.toolFunction({ serviceName: 'OAuth2Provider', serviceConfig });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should strip _rev from caller-supplied serviceConfig before PUT', async () => {
      await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig: { ...serviceConfig, _rev: 'caller-rev-should-be-stripped' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should merge caller overrides over existing service fields', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return HttpResponse.json({
            _id: 'OAuth2Provider',
            _type: { _id: 'OAuth2Provider', name: 'OAuth2 Provider' },
            existingField: 'preserved-value',
            enabled: true
          });
        })
      );

      await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig: { enabled: false }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body.existingField).toBe('preserved-value');
      expect(body.enabled).toBe(false);
    });

    it('should return merged config in success response', async () => {
      server.use(
        http.put('https://*/am/json/global-config/services/:serviceName/configuration', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            _id: params.serviceName,
            enabled: false,
            existingField: 'preserved-value',
            ...body
          });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig: { enabled: false }
      });

      expect(result.content[0].text).toContain('OAuth2Provider');
      expect(result.content[0].text).toContain('"enabled"');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate serviceName with safePathSegmentSchema', () => {
      const schema = applyGlobalAmServiceTool.inputSchema.serviceName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('OAuth2Provider')).not.toThrow();
    });

    it('should reject URL-encoded path traversal in serviceName', () => {
      const schema = applyGlobalAmServiceTool.inputSchema.serviceName;
      expect(() => schema.parse('%2e%2e%2fservice')).toThrow();
    });

    it('should accept any key-value pairs in serviceConfig', () => {
      const schema = applyGlobalAmServiceTool.inputSchema.serviceConfig;
      expect(() => schema.parse({ key: 'value', nested: { inner: 42 } })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface GET error when global service is not found (404)', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'NonExistentService',
        serviceConfig
      });

      expect(result.content[0].text).toContain('Failed to apply global AM service');
      expect(result.content[0].text).toContain('NonExistentService');
    });

    it('should surface PUT error when service update fails', async () => {
      server.use(
        http.put('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig
      });

      expect(result.content[0].text).toContain('Failed to apply global AM service');
    });

    it('should surface 403 GET error', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyGlobalAmServiceTool.toolFunction({
        serviceName: 'OAuth2Provider',
        serviceConfig
      });

      expect(result.content[0].text).toContain('Failed to apply global AM service');
      expect(result.content[0].text).toContain('OAuth2Provider');
    });
  });
});
