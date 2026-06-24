import { describe, it, expect } from 'vitest';
import { applyEnvironmentConfigurationTool } from '../../../src/tools/workflow/applyEnvironmentConfiguration.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applyEnvironmentConfiguration', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyEnvironmentConfiguration', applyEnvironmentConfigurationTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('no-target guard: returns guidance message without making API calls when no inputs supplied', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({});

      expect(result.content[0].text).toContain('No configuration targets supplied');
      expect(getSpy().mock.calls).toHaveLength(0);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('esvSecret: issues PUT, POST versions, and POST changestatus in order', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(3);

      // PUT secret
      expect(calls[0][2]?.method).toBe('PUT');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/secrets/esv-my-secret');

      // POST create version
      expect(calls[1][2]?.method).toBe('POST');
      expect(calls[1][0]).toBe(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret/versions?_action=create'
      );

      // POST changestatus for version returned by mock ('3')
      expect(calls[2][2]?.method).toBe('POST');
      expect(calls[2][0]).toBe(
        'https://test.forgeblocks.com/environment/secrets/esv-my-secret/versions/3?_action=changestatus'
      );
    });

    it('esvSecret: PUT body includes secretId as _id', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' }
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2]?.body as string);
      expect(putBody._id).toBe('esv-my-secret');
      expect(putBody.valueBase64).toBe('dGVzdA==');
    });

    it('esvSecret: changestatus body has status ENABLED', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' }
      });

      const changeStatusBody = JSON.parse(getSpy().mock.calls[2][2]?.body as string);
      expect(changeStatusBody.status).toBe('ENABLED');
    });

    it('esvVariable: issues PUT with base64-encoded value', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvVariable: { variableId: 'esv-my-var', value: 'hello' }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][2]?.method).toBe('PUT');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/variables/esv-my-var');

      const body = JSON.parse(calls[0][2]?.body as string);
      expect(body.valueBase64).toBe(Buffer.from('hello').toString('base64'));
      expect(body.expressionType).toBe('string');
    });

    it('esvVariable: uses supplied expressionType when provided', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvVariable: { variableId: 'esv-my-var', value: 'true', expressionType: 'bool' }
      });

      const body = JSON.parse(getSpy().mock.calls[0][2]?.body as string);
      expect(body.expressionType).toBe('bool');
    });

    it('customDomains: GET then PUT with union of domains', async () => {
      // Mock GET returns ['example.com', 'auth.example.com']
      await applyEnvironmentConfigurationTool.toolFunction({
        customDomains: { realm: 'alpha', domains: ['new.example.com'] }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/custom-domains/alpha');

      expect(calls[1][2]?.method).toBe('PUT');
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/environment/custom-domains/alpha');

      const putBody = JSON.parse(calls[1][2]?.body as string);
      expect(putBody.domains).toContain('example.com');
      expect(putBody.domains).toContain('auth.example.com');
      expect(putBody.domains).toContain('new.example.com');
    });

    it('cookieDomains: GET then PUT with union of domains', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        cookieDomains: { domains: ['new-cookie.example.com'] }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/cookie-domains');

      expect(calls[1][2]?.method).toBe('PUT');
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/environment/cookie-domains');

      const putBody = JSON.parse(calls[1][2]?.body as string);
      expect(putBody.domains).toContain('new-cookie.example.com');
    });

    it('certificate create: POST to /environment/certificates with active, certificate, privateKey', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        certificate: {
          active: true,
          certificate: '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----'
        }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][2]?.method).toBe('POST');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/certificates');

      const body = JSON.parse(calls[0][2]?.body as string);
      expect(body.active).toBe(true);
      expect(body.certificate).toBeDefined();
      expect(body.privateKey).toBeDefined();
    });

    it('certificate update: PATCH to /environment/certificates/{id} with active flag', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        certificate: { certificateId: 'cert-abc123', active: false }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][2]?.method).toBe('PATCH');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/certificates/cert-abc123');

      const body = JSON.parse(calls[0][2]?.body as string);
      expect(body.active).toBe(false);
    });

    it('ssoCookieConfig: GET then PUT with merged fields', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        ssoCookieConfig: { cookieName: 'iPlanetDirectoryPro' }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/sso-cookie');

      expect(calls[1][2]?.method).toBe('PUT');
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/environment/sso-cookie');

      const putBody = JSON.parse(calls[1][2]?.body as string);
      expect(putBody.cookieName).toBe('iPlanetDirectoryPro');
    });

    it('globalAmService: GET then PUT with merged config (strips _rev)', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        globalAmService: {
          serviceName: 'OAuth2Provider',
          serviceConfig: { accessTokenLifetime: 3600 }
        }
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[0][0]).toContain('OAuth2Provider/configuration');

      expect(calls[1][2]?.method).toBe('PUT');

      const putBody = JSON.parse(calls[1][2]?.body as string);
      expect(putBody._rev).toBeUndefined();
      expect(putBody.accessTokenLifetime).toBe(3600);
    });

    it('uses SCOPES [fr:idc:esv:update, fr:idc:esv:read, fr:am:*]', async () => {
      await applyEnvironmentConfigurationTool.toolFunction({
        esvVariable: { variableId: 'esv-test', value: 'x' }
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:idc:esv:update', 'fr:idc:esv:read', 'fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('returns results map with esvSecret.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvSecret.success).toBe(true);
    });

    it('returns results map with esvVariable.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvVariable: { variableId: 'esv-my-var', value: 'hello' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvVariable.success).toBe(true);
    });

    it('returns results map with customDomains.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        customDomains: { realm: 'alpha', domains: ['new.example.com'] }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.customDomains.success).toBe(true);
    });

    it('returns results map with cookieDomains.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        cookieDomains: { domains: ['cookie.example.com'] }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.cookieDomains.success).toBe(true);
    });

    it('returns results map with certificate.success true on create', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        certificate: { active: true, certificate: '-----BEGIN CERTIFICATE-----', privateKey: '-----BEGIN PRIVATE KEY-----' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.certificate.success).toBe(true);
    });

    it('returns results map with ssoCookieConfig.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        ssoCookieConfig: { cookieName: 'iPlanetDirectoryPro' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.ssoCookieConfig.success).toBe(true);
    });

    it('returns results map with globalAmService.success true on success', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        globalAmService: { serviceName: 'OAuth2Provider', serviceConfig: { foo: 'bar' } }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.globalAmService.success).toBe(true);
    });

    it('all 7 targets in one call: all result keys present', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-s1', valueBase64: 'dGVzdA==' },
        esvVariable: { variableId: 'esv-v1', value: 'val' },
        customDomains: { realm: 'alpha', domains: ['d.example.com'] },
        cookieDomains: { domains: ['c.example.com'] },
        certificate: { active: true },
        ssoCookieConfig: { cookieName: 'testCookie' },
        globalAmService: { serviceName: 'OAuth2Provider', serviceConfig: {} }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvSecret).toBeDefined();
      expect(parsed.results.esvVariable).toBeDefined();
      expect(parsed.results.customDomains).toBeDefined();
      expect(parsed.results.cookieDomains).toBeDefined();
      expect(parsed.results.certificate).toBeDefined();
      expect(parsed.results.ssoCookieConfig).toBeDefined();
      expect(parsed.results.globalAmService).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('esvSecret.secretId: rejects path traversal', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.esvSecret;
      expect(() => schema!.parse({ secretId: '../etc/passwd', valueBase64: 'dGVzdA==' })).toThrow();
    });

    it('esvSecret.secretId: rejects empty string', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.esvSecret;
      expect(() => schema!.parse({ secretId: '', valueBase64: 'dGVzdA==' })).toThrow();
    });

    it('esvVariable.variableId: rejects path traversal', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.esvVariable;
      expect(() => schema!.parse({ variableId: '../etc/passwd', value: 'hello' })).toThrow();
    });

    it('customDomains.realm: rejects invalid realm value', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.customDomains;
      expect(() => schema!.parse({ realm: 'invalid', domains: [] })).toThrow();
    });

    it('customDomains.realm: accepts alpha and bravo', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.customDomains;
      expect(() => schema!.parse({ realm: 'alpha', domains: [] })).not.toThrow();
      expect(() => schema!.parse({ realm: 'bravo', domains: [] })).not.toThrow();
    });

    it('all targets are optional (passing empty object causes guard message)', async () => {
      const result = await applyEnvironmentConfigurationTool.toolFunction({});
      expect(result.content[0].text).toContain('No configuration targets supplied');
    });

    it('certificate.certificateId: rejects path traversal', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.certificate;
      expect(() => schema!.parse({ certificateId: '../etc/passwd', active: true })).toThrow();
    });

    it('globalAmService.serviceName: rejects path traversal', () => {
      const schema = applyEnvironmentConfigurationTool.inputSchema.globalAmService;
      expect(() => schema!.parse({ serviceName: '../etc/passwd', serviceConfig: {} })).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('partial success: esvSecret fails, esvVariable succeeds — both present in results', async () => {
      server.use(
        http.put('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' },
        esvVariable: { variableId: 'esv-my-var', value: 'hello' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvSecret.success).toBe(false);
      expect(parsed.results.esvSecret.error).toBeDefined();
      expect(parsed.results.esvVariable.success).toBe(true);
    });

    it('esvSecret: error includes error message when PUT fails', async () => {
      server.use(
        http.put('https://*/environment/secrets/:secretId', () => {
          return new HttpResponse(JSON.stringify({ error: 'server_error' }), { status: 500 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvSecret: { secretId: 'esv-my-secret', valueBase64: 'dGVzdA==' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvSecret.success).toBe(false);
      expect(typeof parsed.results.esvSecret.error).toBe('string');
    });

    it('esvVariable: error captured when PUT fails', async () => {
      server.use(
        http.put('https://*/environment/variables/:variableId', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        esvVariable: { variableId: 'esv-missing', value: 'test' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.esvVariable.success).toBe(false);
      expect(parsed.results.esvVariable.error).toBeDefined();
    });

    it('globalAmService: error captured when GET fails', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/:serviceName/configuration', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        globalAmService: { serviceName: 'NonExistentService', serviceConfig: {} }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.globalAmService.success).toBe(false);
      expect(parsed.results.globalAmService.error).toBeDefined();
    });

    it('ssoCookieConfig: error captured when GET fails, other targets not affected', async () => {
      server.use(
        http.get('https://*/environment/sso-cookie', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        ssoCookieConfig: { cookieName: 'test' },
        esvVariable: { variableId: 'esv-v1', value: 'val' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.ssoCookieConfig.success).toBe(false);
      expect(parsed.results.ssoCookieConfig.error).toBeDefined();
      expect(parsed.results.esvVariable.success).toBe(true);
    });

    it('certificate: error captured when POST fails, other targets not affected', async () => {
      server.use(
        http.post('https://*/environment/certificates', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        certificate: { active: true },
        esvVariable: { variableId: 'esv-v1', value: 'val' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.certificate.success).toBe(false);
      expect(parsed.results.certificate.error).toBeDefined();
      expect(parsed.results.esvVariable.success).toBe(true);
    });

    it('partial success: customDomains fails, cookieDomains succeeds', async () => {
      server.use(
        http.get('https://*/environment/custom-domains/:realm', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyEnvironmentConfigurationTool.toolFunction({
        customDomains: { realm: 'alpha', domains: ['fail.example.com'] },
        cookieDomains: { domains: ['cookie.example.com'] }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.customDomains.success).toBe(false);
      expect(parsed.results.cookieDomains.success).toBe(true);
    });
  });
});
