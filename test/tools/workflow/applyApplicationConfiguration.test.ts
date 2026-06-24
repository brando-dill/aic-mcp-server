import { describe, it, expect } from 'vitest';
import { applyApplicationConfigurationTool } from '../../../src/tools/workflow/applyApplicationConfiguration.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const SAML_ENTITY_ID = 'https://example.com/saml/sp';
const SAML_ENTITY_ID_B64 = Buffer.from(SAML_ENTITY_ID).toString('base64');

describe('applyApplicationConfiguration', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyApplicationConfiguration', applyApplicationConfigurationTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should query IDM for existing OIDC application by name first', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      const idmCall = getSpy().mock.calls[0];
      expect(idmCall[0]).toContain('openidm/managed/alpha_application');
      expect(idmCall[0]).toContain('name%20eq%20%22MyApp%22');
      expect(idmCall[2]?.method).toBe('GET');
    });

    it('should use scopes ["fr:am:*", "fr:idm:*"]', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });

    it('should PUT AM OAuth2Client on OIDC create path', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      const amCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      expect(amCall).toBeDefined();
      expect(amCall![0]).toContain('realm-config/agents/OAuth2Client/MyApp');
      expect(amCall![2]?.method).toBe('PUT');
    });

    it('should POST to IDM managed application on OIDC create path', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      const idmCreateCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('openidm/managed') && opts?.method === 'POST'
      );
      expect(idmCreateCall).toBeDefined();
      const body = JSON.parse(idmCreateCall![2]?.body as string);
      expect(body.name).toBe('MyApp');
      expect(body.ssoEntities).toEqual({ oidcId: 'MyApp' });
    });

    it('should GET AM OAuth2Client and PUT merged config on OIDC update path', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-123', ssoEntities: { oidcId: 'my-client' } }]
          });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: { coreOAuth2ClientConfig: { status: { inherited: false, value: 'Active' } } }
      });

      const amCalls = getSpy().mock.calls.filter(([url]) => url.includes('OAuth2Client/my-client'));
      expect(amCalls).toHaveLength(2);
      expect(amCalls[0][2]?.method).toBe('GET');
      expect(amCalls[1][2]?.method).toBe('PUT');
    });

    it('should GET SAML entity by base64-encoded entityId', async () => {
      server.use(
        http.get(`https://*/am/json/*/realm-config/saml2/hosted/${SAML_ENTITY_ID_B64}`, () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MySamlApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'hosted',
        samlEntityConfig: { entityId: SAML_ENTITY_ID }
      });

      const getCall = getSpy().mock.calls.find(([url, , opts]) => url.includes('saml2') && opts?.method === 'GET');
      expect(getCall).toBeDefined();
      expect(getCall![0]).toContain(`saml2/hosted/${SAML_ENTITY_ID_B64}`);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return applicationName, clientType, realm, and created fields', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('applicationName', 'MyApp');
      expect(parsed).toHaveProperty('clientType', 'oidc');
      expect(parsed).toHaveProperty('realm', 'alpha');
      expect(parsed).toHaveProperty('created');
    });

    it('should return oidcClientId on OIDC path', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('oidcClientId');
    });

    it('should return samlEntityId on SAML path', async () => {
      server.use(
        http.get(`https://*/am/json/*/realm-config/saml2/hosted/${SAML_ENTITY_ID_B64}`, () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MySamlApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'hosted',
        samlEntityConfig: { entityId: SAML_ENTITY_ID }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('samlEntityId', SAML_ENTITY_ID);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('OIDC create path: IDM query returns empty → creates AM client + IDM app (created: true)', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'NewApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(true);

      // Verify AM PUT and IDM POST were called
      const amPut = getSpy().mock.calls.find(([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT');
      const idmPost = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('openidm/managed') && opts?.method === 'POST'
      );
      expect(amPut).toBeDefined();
      expect(idmPost).toBeDefined();
    });

    it('OIDC update path: IDM query returns existing → merges oauth2Client fields (created: false)', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-456', ssoEntities: { oidcId: 'existing-client' } }]
          });
        }),
        http.get('https://*/am/json/*/realm-config/agents/OAuth2Client/existing-client', () => {
          return HttpResponse.json({
            _id: 'existing-client',
            _rev: 'rev-1',
            coreOAuth2ClientConfig: { status: { inherited: false, value: 'Active' } }
          });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'ExistingApp',
        clientType: 'oidc',
        oauth2Client: {
          coreOAuth2ClientConfig: { redirectionUris: { inherited: false, value: ['https://new.example.com'] } }
        }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(false);

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const putBody = JSON.parse(putCall![2]?.body as string);
      // Should have merged: existing status + new redirectionUris
      expect(putBody.coreOAuth2ClientConfig.status).toBeDefined();
      expect(putBody.coreOAuth2ClientConfig.redirectionUris).toBeDefined();
    });

    it('SAML hosted create: 404 on GET → POST _action=create (created: true)', async () => {
      server.use(
        http.get(`https://*/am/json/*/realm-config/saml2/hosted/${SAML_ENTITY_ID_B64}`, () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'SamlApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'hosted',
        samlEntityConfig: { entityId: SAML_ENTITY_ID }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(true);

      const createCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('saml2/hosted') && opts?.method === 'POST'
      );
      expect(createCall).toBeDefined();
      expect(createCall![0]).toContain('_action=create');
    });

    it('SAML remote create: 404 on GET → POST _action=importEntity (created: true)', async () => {
      server.use(
        http.get(`https://*/am/json/*/realm-config/saml2/remote/${SAML_ENTITY_ID_B64}`, () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'SamlRemoteApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'remote',
        samlEntityConfig: { entityId: SAML_ENTITY_ID }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(true);

      const importCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('saml2/remote') && opts?.method === 'POST'
      );
      expect(importCall).toBeDefined();
      expect(importCall![0]).toContain('_action=importEntity');
    });

    it('SAML update path: entity found → strip _rev, merge config, PUT back (created: false)', async () => {
      // Default handler returns entity with _rev, so no override needed
      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'ExistingSamlApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'hosted',
        samlEntityConfig: { roles: ['IDPSSODescriptor'] }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(false);

      const putCall = getSpy().mock.calls.find(([url, , opts]) => url.includes('saml2') && opts?.method === 'PUT');
      expect(putCall).toBeDefined();
      const putBody = JSON.parse(putCall![2]?.body as string);
      // _rev should be stripped
      expect(putBody._rev).toBeUndefined();
      // merged config field present
      expect(putBody.roles).toEqual(['IDPSSODescriptor']);
    });

    it('OIDC update path with owners: PATCHes IDM app with owner IDs', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-789', ssoEntities: { oidcId: 'my-client' } }]
          });
        })
      );

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        owners: ['user-id-1', 'user-id-2']
      });

      const patchCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('alpha_application/app-789') && opts?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const patchBody = JSON.parse(patchCall![2]?.body as string);
      expect(patchBody[0].operation).toBe('replace');
      expect(patchBody[0].field).toBe('/owners');
    });

    it('OIDC create: sends oauth2Client as AM PUT body', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const oauth2Config = {
        coreOAuth2ClientConfig: { redirectionUris: { inherited: false, value: ['https://app.example.com/cb'] } }
      };

      await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'NewApp',
        clientType: 'oidc',
        oauth2Client: oauth2Config
      });

      const amPut = getSpy().mock.calls.find(([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT');
      const body = JSON.parse(amPut![2]?.body as string);
      expect(body.coreOAuth2ClientConfig.redirectionUris.value).toEqual(['https://app.example.com/cb']);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept only "oidc" or "saml" as clientType', () => {
      const schema = applyApplicationConfigurationTool.inputSchema.clientType;
      expect(() => schema.parse('oidc')).not.toThrow();
      expect(() => schema.parse('saml')).not.toThrow();
      expect(() => schema.parse('oauth2')).toThrow();
      expect(() => schema.parse('openid')).toThrow();
    });

    it('should accept only "alpha" or "bravo" as realm', () => {
      const schema = applyApplicationConfigurationTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('root')).toThrow();
    });

    it('should require samlEntityId for SAML path', async () => {
      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'SamlApp',
        clientType: 'saml'
        // samlEntityId intentionally omitted
      });

      expect(result.content[0].text).toContain('samlEntityId is required');
    });

    it('should accept only "hosted" or "remote" as samlLocation', () => {
      const schema = applyApplicationConfigurationTool.inputSchema.samlLocation!;
      expect(() => schema.parse('hosted')).not.toThrow();
      expect(() => schema.parse('remote')).not.toThrow();
      expect(() => schema.parse('both')).toThrow();
    });

    it('should make oauth2Client optional', () => {
      const schema = applyApplicationConfigurationTool.inputSchema.oauth2Client!;
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse({ key: 'value' })).not.toThrow();
    });

    it('should make owners an optional array of strings', () => {
      const schema = applyApplicationConfigurationTool.inputSchema.owners!;
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse(['user-1', 'user-2'])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface SAML entity 4xx error (non-404)', async () => {
      server.use(
        http.get(`https://*/am/json/*/realm-config/saml2/hosted/${SAML_ENTITY_ID_B64}`, () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'SamlApp',
        clientType: 'saml',
        samlEntityId: SAML_ENTITY_ID,
        samlLocation: 'hosted'
      });

      expect(result.content[0].text).toContain('Failed to check SAML entity');
    });

    it('should handle AM OAuth2Client PUT failure on OIDC create path', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        }),
        http.put('https://*/am/json/*/realm-config/agents/OAuth2Client/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'BadApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      expect(result.content[0].text).toContain('Failed to apply application configuration');
    });

    it('should handle IDM query failure', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return new HttpResponse(JSON.stringify({ error: 'server_error' }), { status: 500 });
        })
      );

      const result = await applyApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        clientType: 'oidc',
        oauth2Client: {}
      });

      expect(result.content[0].text).toContain('Failed to apply application configuration');
    });
  });
});
