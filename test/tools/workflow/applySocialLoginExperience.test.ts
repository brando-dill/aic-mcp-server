import { describe, it, expect } from 'vitest';
import { applySocialLoginExperienceTool } from '../../../src/tools/workflow/applySocialLoginExperience.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applySocialLoginExperience', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applySocialLoginExperience', applySocialLoginExperienceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should include realm-config/services/SocialIdentityProviders/{providerType}/{providerId} in URL', async () => {
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const calls = getSpy().mock.calls;
      expect(calls[0][0]).toContain('realm-config/services/SocialIdentityProviders/google/my-google-provider');
    });

    it('should include accept-api-version: protocol=2.1,resource=1.0 header', async () => {
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const calls = getSpy().mock.calls;
      const options = calls[0][2];
      expect(options?.headers).toMatchObject({ 'accept-api-version': 'protocol=2.1,resource=1.0' });
    });

    it('should use scope ["fr:am:*"]', async () => {
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should GET first then PUT second on the update path (2 calls total)', async () => {
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'new-client-id' }
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should URL-encode providerType and providerId in the URL', async () => {
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'oidcConfig',
        providerId: 'my provider',
        providerConfig: { clientId: 'abc' }
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('oidcConfig');
      expect(url).toContain('my%20provider');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return providerId in result', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('providerId', 'my-google-provider');
    });

    it('should return providerType in result', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('providerType', 'google');
    });

    it('should return realm in result', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('realm', 'alpha');
    });

    it('should return created field', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('created');
    });

    it('should return config field', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('config');
    });

    it('should return created: false on update path', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.created).toBe(false);
    });

    it('should return created: true when provider does not exist (404)', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return new HttpResponse(JSON.stringify({ code: 404, reason: 'Not Found', message: 'Not Found' }), {
            status: 404
          });
        })
      );

      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'new-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.created).toBe(true);
    });

    it('should include journeyName in result when supplied', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' },
        journeyName: 'SocialLogin'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('journeyName', 'SocialLogin');
    });

    it('should not include journeyName in result when not supplied', async () => {
      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).not.toHaveProperty('journeyName');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('create path: GET 404 → PUT with raw providerConfig, only 2 calls total', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return new HttpResponse(JSON.stringify({ code: 404, reason: 'Not Found', message: 'Not Found' }), {
            status: 404
          });
        })
      );

      let capturedPutBody: Record<string, any> | null = null;
      server.use(
        http.put('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          capturedPutBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ _id: 'new-provider', ...capturedPutBody });
        })
      );

      const providerConfig = { clientId: 'brand-new-client', clientSecret: 'secret123' };
      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'new-provider',
        providerConfig
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
      expect(capturedPutBody).toEqual(providerConfig);
    });

    it('update path: GET existing → strip _rev → merge providerConfig on top → PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'my-google-provider',
            _rev: 'abc123',
            clientId: 'old-client-id',
            scopes: ['openid', 'profile']
          });
        })
      );

      let capturedPutBody: Record<string, any> | null = null;
      server.use(
        http.put('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          capturedPutBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ _id: 'my-google-provider', ...capturedPutBody });
        })
      );

      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'new-client-id' }
      });

      expect(capturedPutBody).not.toBeNull();
      // Existing fields preserved
      expect(capturedPutBody!.scopes).toEqual(['openid', 'profile']);
      // Caller-supplied fields merged on top
      expect(capturedPutBody!.clientId).toBe('new-client-id');
    });

    it('should strip _rev from PUT body on update path', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'my-google-provider',
            _rev: 'should-be-stripped',
            clientId: 'original-client'
          });
        })
      );

      let capturedPutBody: Record<string, any> | null = null;
      server.use(
        http.put('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          capturedPutBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ _id: 'my-google-provider', ...capturedPutBody });
        })
      );

      await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'updated-client' }
      });

      expect(capturedPutBody).not.toBeNull();
      expect(capturedPutBody!._rev).toBeUndefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('providerType rejects path traversal (../etc/passwd)', () => {
      const schema = applySocialLoginExperienceTool.inputSchema.providerType;
      expect(() => schema.parse('../etc/passwd')).toThrow();
    });

    it('providerId rejects path traversal', () => {
      const schema = applySocialLoginExperienceTool.inputSchema.providerId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
    });

    it('realm only accepts alpha or bravo', () => {
      const schema = applySocialLoginExperienceTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('providerConfig accepts any record', () => {
      const schema = applySocialLoginExperienceTool.inputSchema.providerConfig;
      expect(() => schema.parse({ clientId: 'abc', clientSecret: 'xyz', scopes: ['openid'] })).not.toThrow();
      expect(() => schema.parse({})).not.toThrow();
    });

    it('journeyName is optional', () => {
      const schema = applySocialLoginExperienceTool.inputSchema.journeyName;
      expect(() => schema!.parse(undefined)).not.toThrow();
      expect(() => schema!.parse('SocialLogin')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface error message when GET returns non-404 error (e.g. 401)', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'my-google-provider',
        providerConfig: { clientId: 'abc123' }
      });

      expect(result.content[0].text).toContain('Failed to fetch social provider config');
    });

    it('should surface error message when PUT returns 4xx', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return new HttpResponse(JSON.stringify({ code: 404, reason: 'Not Found', message: 'Not Found' }), {
            status: 404
          });
        }),
        http.put('https://*/am/json/*/realm-config/services/SocialIdentityProviders/*/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applySocialLoginExperienceTool.toolFunction({
        realm: 'alpha',
        providerType: 'google',
        providerId: 'new-provider',
        providerConfig: { clientId: 'abc123' }
      });

      expect(result.content[0].text).toContain('Failed to save social provider config');
    });
  });
});
