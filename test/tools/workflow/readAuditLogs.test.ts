import { describe, it, expect } from 'vitest';
import { readAuditLogsTool } from '../../../src/tools/workflow/readAuditLogs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('readAuditLogs', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('readAuditLogs', readAuditLogsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should use GET monitoring/logs/tail with encoded source query param', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/monitoring/logs/tail');
      expect(url).toContain('source=am-core');
    });

    it('should join multiple log sources with comma', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core', 'idm-core'] });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('source=am-core%2Cidm-core');
    });

    it('should set _queryFilter=true when no filters supplied', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('_queryFilter=true');
    });

    it('should add userId condition in _queryFilter when userId supplied', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core'], userId: 'user123' });

      const [url] = getSpy().mock.calls[0];
      // URLSearchParams encodes spaces as '+'; replace before decoding
      const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
      expect(decoded).toContain('/payload/principal eq "user123"');
    });

    it('should add OR-joined eventName conditions when eventTypes supplied', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        eventTypes: ['AM-LOGIN-COMPLETED', 'AM-LOGIN-FAILED']
      });

      const [url] = getSpy().mock.calls[0];
      // URLSearchParams encodes spaces as '+'; replace before decoding
      const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
      expect(decoded).toContain('payload/eventName eq "AM-LOGIN-COMPLETED"');
      expect(decoded).toContain('payload/eventName eq "AM-LOGIN-FAILED"');
      expect(decoded).toContain(' or ');
    });

    it('should combine userId and eventTypes filters with " and "', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123',
        eventTypes: ['AM-LOGIN-COMPLETED']
      });

      const [url] = getSpy().mock.calls[0];
      // URLSearchParams encodes spaces as '+'; replace before decoding
      const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
      expect(decoded).toContain('/payload/principal eq "user123"');
      expect(decoded).toContain(' and ');
      expect(decoded).toContain('payload/eventName eq "AM-LOGIN-COMPLETED"');
    });

    it('should append _pageSize when pageSize is supplied', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core'], pageSize: 50 });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('_pageSize=50');
    });

    it('should append pagedResultsCookie when supplied', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        pagedResultsCookie: 'cookie-abc123'
      });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('pagedResultsCookie=cookie-abc123');
    });

    it('should append beginTime and endTime from timeWindow when supplied', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        timeWindow: { beginTime: '2025-01-01T00:00:00Z', endTime: '2025-01-02T00:00:00Z' }
      });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('beginTime=2025-01-01T00%3A00%3A00Z');
      expect(url).toContain('endTime=2025-01-02T00%3A00%3A00Z');
    });

    it('should use scopes ["fr:idc:monitoring:*", "fr:idm:*"]', async () => {
      await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idc:monitoring:*', 'fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return a logs object in the result', async () => {
      const result = await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('logs');
    });

    it('should not include userContext when userId not supplied', async () => {
      const result = await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).not.toHaveProperty('userContext');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should make a second call to IDM when userId and realm are supplied', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123',
        realm: 'alpha'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toContain('/openidm/managed/alpha_user/user123');
    });

    it('should include userContext in result when userId and realm are supplied', async () => {
      const result = await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123',
        realm: 'alpha'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('userContext');
    });

    it('should use ["fr:idm:*"] scopes for the IDM user enrichment call', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123',
        realm: 'alpha'
      });

      const calls = getSpy().mock.calls;
      expect(calls[1][1]).toEqual(['fr:idm:*']);
    });

    it('should not make IDM call when userId supplied but realm omitted', async () => {
      await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1);
    });

    it('should succeed and omit userContext when IDM enrichment call fails', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(null, { status: 401 });
          }
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await readAuditLogsTool.toolFunction({
        logSources: ['am-core'],
        userId: 'user123',
        realm: 'alpha'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed).toHaveProperty('logs');
      expect(parsed).not.toHaveProperty('userContext');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require at least one logSource', () => {
      const schema = readAuditLogsTool.inputSchema.logSources;
      expect(() => schema.parse([])).toThrow();
      expect(() => schema.parse(['am-core'])).not.toThrow();
    });

    it('should accept only "alpha" or "bravo" as realm', () => {
      const schema = readAuditLogsTool.inputSchema.realm!;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('invalid-realm')).toThrow();
    });

    it('should make realm optional', () => {
      const schema = readAuditLogsTool.inputSchema.realm!;
      expect(() => schema.parse(undefined)).not.toThrow();
    });

    it('should make userId optional', () => {
      const schema = readAuditLogsTool.inputSchema.userId!;
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse('user123')).not.toThrow();
    });

    it('should make pageSize optional and require positive integer', () => {
      const schema = readAuditLogsTool.inputSchema.pageSize!;
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse(10)).not.toThrow();
      expect(() => schema.parse(0)).toThrow();
      expect(() => schema.parse(-1)).toThrow();
    });

    it('should make eventTypes optional array of strings', () => {
      const schema = readAuditLogsTool.inputSchema.eventTypes!;
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse(['AM-LOGIN-COMPLETED'])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface error message when monitoring/logs/tail returns 4xx', async () => {
      server.use(
        http.get('https://*/monitoring/logs/tail', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await readAuditLogsTool.toolFunction({ logSources: ['am-core'] });
      expect(result.content[0].text).toContain('Failed to read audit logs');
    });
  });
});
