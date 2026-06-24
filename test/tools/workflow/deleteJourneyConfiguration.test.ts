import { describe, it, expect } from 'vitest';
import { deleteJourneyConfigurationTool } from '../../../src/tools/workflow/deleteJourneyConfiguration.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteJourneyConfiguration', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteJourneyConfiguration', deleteJourneyConfigurationTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build journey DELETE URL with encoded journeyName', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/trees/Login');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.method).toBe('DELETE');
    });

    it('should include AM_API_HEADERS for journey DELETE', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should URL-encode journeyName with special characters', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Copy of Login'
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Copy%20of%20Login');
    });

    it('should build script DELETE URL for each scriptId', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['script-uuid-1', 'script-uuid-2']
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[1][0]).toContain('/am/json/alpha/scripts/script-uuid-1');
      expect(calls[2][0]).toContain('/am/json/alpha/scripts/script-uuid-2');
    });

    it('should include AM_SCRIPT_HEADERS_V2 for script DELETEs', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['script-uuid-1']
      });

      const scriptOptions = getSpy().mock.calls[1][2];
      expect(scriptOptions?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should use DELETE method for all requests', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['script-uuid-1']
      });

      const calls = getSpy().mock.calls;
      expect(calls[0][2]?.method).toBe('DELETE');
      expect(calls[1][2]?.method).toBe('DELETE');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return deleted array containing journey name on journey-only deletion', async () => {
      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('Login');
      expect(parsed.errors).toEqual([]);
    });

    it('should return deleted array with journey and scripts on journey + scripts deletion', async () => {
      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['script-uuid-1', 'script-uuid-2']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('Login');
      expect(parsed.deleted).toContain('script:script-uuid-1');
      expect(parsed.deleted).toContain('script:script-uuid-2');
      expect(parsed.errors).toEqual([]);
    });

    it('should return result as valid JSON', async () => {
      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('deleted');
      expect(parsed).toHaveProperty('errors');
      expect(Array.isArray(parsed.deleted)).toBe(true);
      expect(Array.isArray(parsed.errors)).toBe(true);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should not delete scripts when scriptIds is not provided', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      expect(getSpy().mock.calls).toHaveLength(1);
    });

    it('should not delete scripts when scriptIds is empty array', async () => {
      await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: []
      });

      expect(getSpy().mock.calls).toHaveLength(1);
    });

    it('should continue processing remaining scripts when one fails (partial failure)', async () => {
      server.use(
        http.delete('https://*/am/json/*/scripts/failing-script', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['failing-script', 'script-uuid-1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('Login');
      expect(parsed.deleted).toContain('script:script-uuid-1');
      expect(parsed.errors.some((e: string) => e.includes('failing-script'))).toBe(true);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => deleteJourneyConfigurationTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should reject invalid realm values', () => {
      expect(() => deleteJourneyConfigurationTool.inputSchema.realm.parse('invalid-realm')).toThrow();
    });

    it('should validate journeyName with safePathSegmentSchema — path traversal rejected', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
    });

    it('should validate journeyName — empty string rejected', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.journeyName;
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
    });

    it('should validate journeyName — valid value accepted', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.journeyName;
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });

    it('should validate scriptIds array entries with safePathSegmentSchema', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.scriptIds;
      expect(() => schema?.parse(['../etc/passwd'])).toThrow(/path traversal/);
    });

    it('should accept valid scriptIds', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.scriptIds;
      expect(() => schema?.parse(['valid-script-id-123'])).not.toThrow();
    });

    it('should accept missing scriptIds (optional)', () => {
      const schema = deleteJourneyConfigurationTool.inputSchema.scriptIds;
      expect(() => schema?.parse(undefined)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should add journey 404 to errors (not throw)', async () => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'NonexistentJourney'
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).not.toContain('NonexistentJourney');
      expect(parsed.errors.some((e: string) => e.includes('NonexistentJourney'))).toBe(true);
    });

    it('should add script 404 to errors but still process other scripts', async () => {
      server.use(
        http.delete('https://*/am/json/*/scripts/missing-script', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['missing-script', 'script-uuid-1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('Login');
      expect(parsed.deleted).toContain('script:script-uuid-1');
      expect(parsed.errors.some((e: string) => e.includes('missing-script'))).toBe(true);
    });

    it('should handle journey delete failure and still attempt scripts', async () => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'server error' }), { status: 500 });
        })
      );

      const result = await deleteJourneyConfigurationTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        scriptIds: ['script-uuid-1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.errors.some((e: string) => e.includes('Login'))).toBe(true);
      expect(parsed.deleted).toContain('script:script-uuid-1');
    });
  });
});
