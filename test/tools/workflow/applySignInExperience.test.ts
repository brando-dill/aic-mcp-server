import { describe, it, expect } from 'vitest';
import { applySignInExperienceTool } from '../../../src/tools/workflow/applySignInExperience.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applySignInExperience', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applySignInExperience', applySignInExperienceTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should GET themerealm first', async () => {
      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      const calls = getSpy().mock.calls;
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/ui/themerealm');
    });

    it('should PUT themerealm second', async () => {
      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      const calls = getSpy().mock.calls;
      expect(calls[1][2]?.method).toBe('PUT');
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/openidm/config/ui/themerealm');
    });

    it('should use scopes ["fr:idm:*", "fr:am:*"]', async () => {
      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:idm:*', 'fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return themeId field', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('themeId');
    });

    it('should return themeName field', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('themeName');
    });

    it('should return created field', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('created');
    });

    it('should return setAsDefault field', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('setAsDefault');
    });

    it('should return defaultJourneyUpdated field', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('defaultJourneyUpdated');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should create new theme when name not found (result.created === true)', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'NonExistentTheme'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.created).toBe(true);
    });

    it('should update existing theme when name found (result.created === false)', async () => {
      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'Default'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.created).toBe(false);
    });

    it('should set isDefault on target theme and false on others when setAsDefault is true', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'ui/themerealm',
            realm: {
              alpha: [
                { _id: 'theme-1', name: 'Default', isDefault: true },
                { _id: 'theme-2', name: 'Dark', isDefault: false }
              ]
            }
          });
        })
      );

      let capturedBody: Record<string, any> | null = null;
      server.use(
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json(capturedBody);
        })
      );

      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#0000ff' },
        themeName: 'Dark',
        setAsDefault: true
      });

      expect(capturedBody).not.toBeNull();
      const alphaThemes = capturedBody!.realm.alpha;
      const defaultTheme = alphaThemes.find((t: any) => t.name === 'Dark');
      const otherTheme = alphaThemes.find((t: any) => t.name === 'Default');
      expect(defaultTheme.isDefault).toBe(true);
      expect(otherTheme.isDefault).toBe(false);
    });

    it('should update default journey when defaultJourneyName supplied (GET + PUT to realm-config/authentication)', async () => {
      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        defaultJourneyName: 'Registration'
      });

      const calls = getSpy().mock.calls;
      // calls: [GET themerealm, PUT themerealm, GET auth config, PUT auth config]
      expect(calls.length).toBe(4);
      expect(calls[2][0]).toContain('realm-config/authentication');
      expect(calls[2][2]?.method).toBe('GET');
      expect(calls[3][0]).toContain('realm-config/authentication');
      expect(calls[3][2]?.method).toBe('PUT');
    });

    it('should include orgConfig in auth config PUT body', async () => {
      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        defaultJourneyName: 'Registration'
      });

      const calls = getSpy().mock.calls;
      const putAuthBody = JSON.parse(calls[3][2]?.body as string);
      expect(putAuthBody.orgConfig).toBe('Registration');
    });

    it('should strip _rev from config before PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'ui/themerealm',
            _rev: '5',
            realm: { alpha: [] }
          });
        })
      );

      let capturedBody: Record<string, any> | null = null;
      server.use(
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json(capturedBody);
        })
      );

      await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!._rev).toBeUndefined();
    });

    it('should create theme with generated name "Custom Theme" when no themeName given', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'ui/themerealm',
            realm: { alpha: [] }
          });
        })
      );

      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.themeName).toBe('Custom Theme');
      expect(parsed.created).toBe(true);
    });

    it('should initialize realm array if config.realm[realm] does not exist', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({
            _id: 'ui/themerealm',
            realm: {}
          });
        })
      );

      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        themeName: 'NewTheme'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.created).toBe(true);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept only "alpha" or "bravo" as realm', () => {
      const schema = applySignInExperienceTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept any record for themeProperties', () => {
      const schema = applySignInExperienceTool.inputSchema.themeProperties;
      expect(() => schema.parse({ primaryColor: '#fff', logo: 'url' })).not.toThrow();
      expect(() => schema.parse({})).not.toThrow();
    });

    it('should make themeName optional', () => {
      const schema = applySignInExperienceTool.inputSchema.themeName;
      expect(() => schema!.parse(undefined)).not.toThrow();
      expect(() => schema!.parse('MyTheme')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface error when themerealm GET returns 4xx', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' }
      });

      expect(result.content[0].text).toContain('Failed to fetch themerealm config');
    });

    it('should return defaultJourneyUpdated: false when defaultJourneyName update fails', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication', () => {
          return new HttpResponse(JSON.stringify({ error: 'server error' }), { status: 500 });
        })
      );

      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        defaultJourneyName: 'Registration'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.defaultJourneyUpdated).toBe(false);
      expect(parsed.defaultJourneyError).toBeDefined();
    });

    it('should not fail the whole tool when defaultJourneyName update fails', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication', () => {
          return new HttpResponse(JSON.stringify({ error: 'server error' }), { status: 500 });
        })
      );

      const result = await applySignInExperienceTool.toolFunction({
        realm: 'alpha',
        themeProperties: { primaryColor: '#ff0000' },
        defaultJourneyName: 'Registration'
      });

      // Should still include themeId etc (not a top-level failure message)
      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.themeId).toBeDefined();
    });
  });
});
