import { describe, it, expect } from 'vitest';
import { updateSamlEntityTool } from '../../../src/tools/am/updateSamlEntity.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('updateSamlEntity', () => {
  const getSpy = setupTestEnvironment();

  const entityId64 = 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==';

  const callerOverrides = {
    assertionConsumerService: [
      { index: 0, isDefault: true, binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', location: 'https://example.com/acs/new' }
    ]
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateSamlEntity', updateSamlEntityTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should make GET request first to fetch existing entity', async () => {
      await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      const firstCall = getSpy().mock.calls[0];
      expect(firstCall[0]).toBe(
        `https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/hosted/${encodeURIComponent(entityId64)}`
      );
      expect(firstCall[2]?.method).toBe('GET');
    });

    it('should make PUT request second with merged entity', async () => {
      await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      const secondCall = getSpy().mock.calls[1];
      expect(secondCall[0]).toBe(
        `https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/hosted/${encodeURIComponent(entityId64)}`
      );
      expect(secondCall[2]?.method).toBe('PUT');
    });

    it('should use accept-api-version protocol=2.1,resource=1.0 for both calls', async () => {
      await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use scope fr:am:* for both calls', async () => {
      await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should strip _rev from fetched entity before PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return HttpResponse.json({
            _id: entityId64,
            _rev: 'rev-should-be-stripped',
            entityId: 'https://example.com/saml',
            roles: ['SPSSODescriptor']
          });
        })
      );

      await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should strip _rev from caller-supplied entityConfig before PUT', async () => {
      await updateSamlEntityTool.toolFunction({
        realm: 'alpha',
        location: 'hosted',
        entityId64,
        entityConfig: { ...callerOverrides, _rev: 'caller-rev-should-be-stripped' }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body._rev).toBeUndefined();
    });

    it('should merge caller overrides over existing entity fields', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return HttpResponse.json({
            _id: entityId64,
            entityId: 'https://example.com/saml',
            roles: ['SPSSODescriptor'],
            existingField: 'preserved'
          });
        })
      );

      await updateSamlEntityTool.toolFunction({
        realm: 'alpha',
        location: 'hosted',
        entityId64,
        entityConfig: { assertionConsumerService: [{ index: 0, location: 'https://example.com/new-acs' }] }
      });

      const putOptions = getSpy().mock.calls[1][2];
      const body = JSON.parse(putOptions?.body as string);
      expect(body.existingField).toBe('preserved');
      expect(body.entityId).toBe('https://example.com/saml');
      expect(body.assertionConsumerService[0].location).toBe('https://example.com/new-acs');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate location as hosted or remote', () => {
      const schema = updateSamlEntityTool.inputSchema.location;
      expect(() => schema.parse('hosted')).not.toThrow();
      expect(() => schema.parse('remote')).not.toThrow();
      expect(() => schema.parse('other')).toThrow();
    });

    it('should validate entityId64 with safePathSegmentSchema', () => {
      const schema = updateSamlEntityTool.inputSchema.entityId64;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('aHR0cHM6Ly9leGFtcGxlLmNvbQ==')).not.toThrow();
    });

    it('should accept any key-value pairs in entityConfig', () => {
      const schema = updateSamlEntityTool.inputSchema.entityConfig;
      expect(() => schema.parse({ entityId: 'https://example.com', custom: 42 })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface GET error when entity is not found', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      expect(result.content[0].text).toContain('Failed to update SAML entity');
      expect(result.content[0].text).toContain(entityId64);
    });

    it('should surface PUT error when update fails', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/saml2/:location/:entityId64', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await updateSamlEntityTool.toolFunction({ realm: 'alpha', location: 'hosted', entityId64, entityConfig: callerOverrides });

      expect(result.content[0].text).toContain('Failed to update SAML entity');
    });
  });
});
