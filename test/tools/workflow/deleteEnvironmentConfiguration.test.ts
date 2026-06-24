import { describe, it, expect } from 'vitest';
import { deleteEnvironmentConfigurationTool } from '../../../src/tools/workflow/deleteEnvironmentConfiguration.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteEnvironmentConfiguration', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteEnvironmentConfiguration', deleteEnvironmentConfigurationTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should return guidance when no arrays are supplied', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({});
      expect(result.content[0].text).toContain('No targets supplied');
      expect(getSpy().mock.calls).toHaveLength(0);
    });

    it('should return guidance when all arrays are empty', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: [],
        variableIds: [],
        certificateIds: []
      });
      expect(result.content[0].text).toContain('No targets supplied');
      expect(getSpy().mock.calls).toHaveLength(0);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should DELETE each secretId with correct URL and accept-api-version header', async () => {
      await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-mysecret', 'esv-othersecret']
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/secrets/esv-mysecret');
      expect(calls[0][1]).toEqual(['fr:idc:esv:update']);
      expect(calls[0][2]?.method).toBe('DELETE');
      expect((calls[0][2]?.headers as Record<string, string>)['accept-api-version']).toBe('resource=1.0');

      expect(calls[1][0]).toBe('https://test.forgeblocks.com/environment/secrets/esv-othersecret');
      expect(calls[1][2]?.method).toBe('DELETE');
    });

    it('should DELETE each variableId with correct URL and accept-api-version header', async () => {
      await deleteEnvironmentConfigurationTool.toolFunction({
        variableIds: ['esv-myvar']
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/variables/esv-myvar');
      expect(calls[0][1]).toEqual(['fr:idc:esv:update']);
      expect(calls[0][2]?.method).toBe('DELETE');
      expect((calls[0][2]?.headers as Record<string, string>)['accept-api-version']).toBe('protocol=1.0,resource=1.0');
    });

    it('should DELETE each certificateId with correct URL and accept-api-version header', async () => {
      await deleteEnvironmentConfigurationTool.toolFunction({
        certificateIds: ['cert-abc123']
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/environment/certificates/cert-abc123');
      expect(calls[0][1]).toEqual(['fr:idc:esv:update']);
      expect(calls[0][2]?.method).toBe('DELETE');
      expect((calls[0][2]?.headers as Record<string, string>)['accept-api-version']).toBe('resource=1.0');
    });

    it('should use scope fr:idc:esv:update for all resource types', async () => {
      await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-s1'],
        variableIds: ['esv-v1'],
        certificateIds: ['cert-c1']
      });

      const calls = getSpy().mock.calls;
      for (const call of calls) {
        expect(call[1]).toEqual(['fr:idc:esv:update']);
      }
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should populate deleted list when secrets are successfully deleted', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-s1', 'esv-s2']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('secret:esv-s1');
      expect(parsed.deleted).toContain('secret:esv-s2');
      expect(parsed.errors).toHaveLength(0);
    });

    it('should populate deleted list when variables are successfully deleted', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        variableIds: ['esv-v1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('variable:esv-v1');
      expect(parsed.errors).toHaveLength(0);
    });

    it('should populate deleted list when certificates are successfully deleted', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        certificateIds: ['cert-c1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('certificate:cert-c1');
      expect(parsed.errors).toHaveLength(0);
    });

    it('should return both deleted and errors arrays in response', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-s1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('deleted');
      expect(parsed).toHaveProperty('errors');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject path traversal in secretIds', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.secretIds;
      expect(() => schema!.parse(['../etc/passwd'])).toThrow();
    });

    it('should reject path traversal in variableIds', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.variableIds;
      expect(() => schema!.parse(['../etc/shadow'])).toThrow();
    });

    it('should reject path traversal in certificateIds', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.certificateIds;
      expect(() => schema!.parse(['../etc/hosts'])).toThrow();
    });

    it('should accept valid secretIds', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.secretIds;
      expect(() => schema!.parse(['esv-mysecret', 'esv-othersecret'])).not.toThrow();
    });

    it('should make secretIds optional', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.secretIds;
      expect(() => schema!.parse(undefined)).not.toThrow();
    });

    it('should make variableIds optional', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.variableIds;
      expect(() => schema!.parse(undefined)).not.toThrow();
    });

    it('should make certificateIds optional', () => {
      const schema = deleteEnvironmentConfigurationTool.inputSchema.certificateIds;
      expect(() => schema!.parse(undefined)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should record partial failure for a secret that returns 404 and continue processing', async () => {
      server.use(
        http.delete('https://*/environment/secrets/esv-notfound', () => {
          return new HttpResponse(JSON.stringify({ code: 404, message: 'Not Found' }), { status: 404 });
        })
      );

      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-notfound', 'esv-s1']
      });

      const parsed = JSON.parse(result.content[0].text);
      // The failing one should be in errors
      expect(parsed.errors.some((e: string) => e.startsWith('secret:esv-notfound'))).toBe(true);
      // The succeeding one should be in deleted
      expect(parsed.deleted).toContain('secret:esv-s1');
      // Both were attempted
      expect(getSpy().mock.calls).toHaveLength(2);
    });

    it('should continue processing remaining items after a variable failure', async () => {
      server.use(
        http.delete('https://*/environment/variables/esv-badvar', () => {
          return new HttpResponse(JSON.stringify({ code: 500, message: 'Server Error' }), { status: 500 });
        })
      );

      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        variableIds: ['esv-badvar', 'esv-v1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.errors.some((e: string) => e.startsWith('variable:esv-badvar'))).toBe(true);
      expect(parsed.deleted).toContain('variable:esv-v1');
    });

    it('should continue processing remaining items after a certificate failure', async () => {
      server.use(
        http.delete('https://*/environment/certificates/cert-bad', () => {
          return new HttpResponse(JSON.stringify({ code: 404, message: 'Not Found' }), { status: 404 });
        })
      );

      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        certificateIds: ['cert-bad', 'cert-c1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.errors.some((e: string) => e.startsWith('certificate:cert-bad'))).toBe(true);
      expect(parsed.deleted).toContain('certificate:cert-c1');
    });

    it('mixed targets: secrets + variables + certificates all processed in one call', async () => {
      const result = await deleteEnvironmentConfigurationTool.toolFunction({
        secretIds: ['esv-s1'],
        variableIds: ['esv-v1'],
        certificateIds: ['cert-c1']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toContain('secret:esv-s1');
      expect(parsed.deleted).toContain('variable:esv-v1');
      expect(parsed.deleted).toContain('certificate:cert-c1');
      expect(parsed.errors).toHaveLength(0);
      expect(getSpy().mock.calls).toHaveLength(3);
    });
  });
});
