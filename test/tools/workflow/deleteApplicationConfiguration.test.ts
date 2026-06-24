import { describe, it, expect } from 'vitest';
import { deleteApplicationConfigurationTool } from '../../../src/tools/workflow/deleteApplicationConfiguration.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { validateAuthHeader } from '../../mocks/handlers.js';

const APP_ID = 'app-abc123';
const OIDC_ID = 'my-oidc-client';

/** Returns an MSW handler that serves a single application with optional ssoEntities */
function mockIdmAppQuery(ssoEntities?: { oidcId?: string }) {
  return http.get('https://*/openidm/managed/:objectType', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;
    return HttpResponse.json({
      result: [{ _id: APP_ID, name: 'MyApp', ...(ssoEntities ? { ssoEntities } : {}) }],
      resultCount: 1,
      totalPagedResults: 1
    });
  });
}

/** Returns an MSW handler that reports no results for the IDM app query */
function mockIdmAppNotFound() {
  return http.get('https://*/openidm/managed/:objectType', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;
    return HttpResponse.json({
      result: [],
      resultCount: 0,
      totalPagedResults: 0
    });
  });
}

describe('deleteApplicationConfiguration', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteApplicationConfiguration', deleteApplicationConfigurationTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should query IDM managed application by name first', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const calls = getSpy().mock.calls;
      expect(calls[0][0]).toContain('/openidm/managed/alpha_application');
      expect(calls[0][0]).toContain('_queryFilter=');
      expect(calls[0][0]).toContain('MyApp');
      expect(calls[0][2]?.method).toBe('GET');
    });

    it('should DELETE IDM managed application by ID', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const calls = getSpy().mock.calls;
      expect(calls[1][0]).toContain(`/openidm/managed/alpha_application/${APP_ID}`);
      expect(calls[1][2]?.method).toBe('DELETE');
    });

    it('should DELETE AM OAuth2Client when ssoEntities.oidcId is present', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const calls = getSpy().mock.calls;
      expect(calls[2][0]).toContain(`realm-config/agents/OAuth2Client/${OIDC_ID}`);
      expect(calls[2][2]?.method).toBe('DELETE');
    });

    it('should not call AM OAuth2Client DELETE when ssoEntities.oidcId is absent', async () => {
      server.use(mockIdmAppQuery());

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const calls = getSpy().mock.calls;
      // Only IDM query + IDM delete = 2 calls
      expect(calls.length).toBe(2);
      expect(calls.every((c) => !String(c[0]).includes('OAuth2Client'))).toBe(true);
    });

    it('should include AM API version header on OAuth2Client DELETE', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const calls = getSpy().mock.calls;
      expect(calls[2][2]?.headers).toMatchObject({ 'accept-api-version': 'protocol=2.1,resource=1.0' });
    });

    it('should DELETE SAML entity when samlEntityId + samlLocation are supplied', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: 'https://example.com/saml',
        samlLocation: 'hosted'
      });

      const calls = getSpy().mock.calls;
      // calls[3] should be the SAML delete
      const samlCall = calls[3];
      expect(samlCall[0]).toContain('realm-config/saml2/hosted/');
      expect(samlCall[2]?.method).toBe('DELETE');
    });

    it('should base64-encode the samlEntityId in the SAML DELETE URL', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      const entityId = 'https://example.com/saml';
      const base64Id = Buffer.from(entityId).toString('base64');

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: entityId,
        samlLocation: 'remote'
      });

      const calls = getSpy().mock.calls;
      expect(calls[3][0]).toContain(encodeURIComponent(base64Id));
    });

    it('should use scopes ["fr:am:*", "fr:idm:*"]', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return deleted array in result for IDM-only delete (no OIDC, no SAML)', async () => {
      server.use(mockIdmAppQuery());

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('deleted');
      expect(Array.isArray(parsed.deleted)).toBe(true);
      expect(parsed.deleted).toContain(`IDM managed application (${APP_ID})`);
    });

    it('should include IDM and AM OAuth2Client in deleted array on OIDC delete', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text.split('\n\nTransaction ID:')[0]);
      expect(parsed.deleted).toContain(`IDM managed application (${APP_ID})`);
      expect(parsed.deleted).toContain(`AM OAuth2Client (${OIDC_ID})`);
    });

    it('should include SAML entity in deleted array on full delete', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: 'https://example.com/saml',
        samlLocation: 'hosted'
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text.split('\n\nTransaction ID:')[0]);
      expect(parsed.deleted).toContain('AM SAML entity (https://example.com/saml)');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('full delete: IDM query → IDM delete → AM OAuth2Client delete → SAML delete (4 total API calls)', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: 'https://example.com/saml',
        samlLocation: 'hosted'
      });

      expect(getSpy().mock.calls.length).toBe(4);
    });

    it('OIDC-only delete (no SAML): IDM query → IDM delete → AM OAuth2Client delete (3 total API calls)', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      expect(getSpy().mock.calls.length).toBe(3);
    });

    it('IDM-only delete (no OIDC, no SAML): IDM query → IDM delete (2 total API calls)', async () => {
      server.use(mockIdmAppQuery());

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('should not attempt SAML delete when only samlEntityId supplied (missing samlLocation)', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: 'https://example.com/saml'
        // samlLocation intentionally omitted
      });

      // Only 3 calls: IDM query + IDM delete + OAuth2Client delete
      expect(getSpy().mock.calls.length).toBe(3);
      expect(getSpy().mock.calls.every((c) => !String(c[0]).includes('saml2'))).toBe(true);
    });

    it('should not attempt SAML delete when only samlLocation supplied (missing samlEntityId)', async () => {
      server.use(mockIdmAppQuery({ oidcId: OIDC_ID }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlLocation: 'hosted'
        // samlEntityId intentionally omitted
      });

      expect(getSpy().mock.calls.length).toBe(3);
      expect(getSpy().mock.calls.every((c) => !String(c[0]).includes('saml2'))).toBe(true);
    });

    it('should URL-encode the OIDC client ID in the AM OAuth2Client URL', async () => {
      const specialClientId = 'client/with/slashes';
      server.use(mockIdmAppQuery({ oidcId: specialClientId }));

      await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      const amCall = getSpy().mock.calls[2];
      expect(amCall[0]).toContain(encodeURIComponent(specialClientId));
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('realm only accepts "alpha" or "bravo"', () => {
      const schema = deleteApplicationConfigurationTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('applicationName is a required string', () => {
      const schema = deleteApplicationConfigurationTool.inputSchema.applicationName;
      expect(() => schema.parse('MyApp')).not.toThrow();
      expect(() => schema.parse('')).not.toThrow();
    });

    it('samlEntityId is optional', () => {
      const schema = deleteApplicationConfigurationTool.inputSchema.samlEntityId;
      expect(() => schema!.parse(undefined)).not.toThrow();
      expect(() => schema!.parse('https://example.com/saml')).not.toThrow();
    });

    it('samlLocation only accepts "hosted" or "remote"', () => {
      const schema = deleteApplicationConfigurationTool.inputSchema.samlLocation;
      expect(() => schema!.parse('hosted')).not.toThrow();
      expect(() => schema!.parse('remote')).not.toThrow();
      expect(() => schema!.parse('invalid')).toThrow();
    });

    it('samlLocation is optional', () => {
      const schema = deleteApplicationConfigurationTool.inputSchema.samlLocation;
      expect(() => schema!.parse(undefined)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should return error when application not found — no delete calls', async () => {
      server.use(mockIdmAppNotFound());

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'NonExistentApp'
      });

      expect(result.content[0].text).toContain('not found');
      // Only the IDM query was made — no deletes
      expect(getSpy().mock.calls.length).toBe(1);
    });

    it('should surface error when IDM query returns 4xx', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      expect(result.content[0].text).toContain('Failed to delete application configuration');
    });

    it('should surface error when IDM delete returns 4xx', async () => {
      server.use(
        mockIdmAppQuery({ oidcId: OIDC_ID }),
        http.delete('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      expect(result.content[0].text).toContain('Failed to delete application configuration');
    });

    it('should surface error when SAML DELETE returns 4xx', async () => {
      server.use(
        mockIdmAppQuery({ oidcId: OIDC_ID }),
        http.delete('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp',
        samlEntityId: 'https://example.com/saml',
        samlLocation: 'hosted'
      });

      expect(result.content[0].text).toContain('Failed to delete application configuration');
    });

    it('should surface error when AM OAuth2Client DELETE returns 4xx', async () => {
      server.use(
        mockIdmAppQuery({ oidcId: OIDC_ID }),
        http.delete('https://*/am/json/*/realm-config/agents/OAuth2Client/:clientId', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteApplicationConfigurationTool.toolFunction({
        realm: 'alpha',
        applicationName: 'MyApp'
      });

      expect(result.content[0].text).toContain('Failed to delete application configuration');
    });
  });
});
