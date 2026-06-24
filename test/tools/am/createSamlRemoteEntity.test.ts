import { describe, it, expect } from 'vitest';
import { createSamlRemoteEntityTool } from '../../../src/tools/am/createSamlRemoteEntity.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createSamlRemoteEntity', () => {
  const getSpy = setupTestEnvironment();

  const mockXmlMetadata = `<?xml version="1.0"?><EntityDescriptor entityID="https://remote.example.com/saml" xmlns="urn:oasis:names:tc:SAML:2.0:metadata"></EntityDescriptor>`;

  const baseEntityConfig = {
    entityId: 'https://remote.example.com/saml',
    roles: ['IDPSSODescriptor'],
    singleSignOnService: [
      { binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', location: 'https://remote.example.com/sso' }
    ]
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createSamlRemoteEntity', createSamlRemoteEntityTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL targeting the remote SAML importEntity action', async () => {
      await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', standardMetadata: mockXmlMetadata });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/remote/?_action=importEntity');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use POST method', async () => {
      await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', standardMetadata: mockXmlMetadata });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should send standardMetadata wrapped in object when provided', async () => {
      await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', standardMetadata: mockXmlMetadata });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body.standardMetadata).toBe(mockXmlMetadata);
    });

    it('should send entityConfig directly when standardMetadata is not provided', async () => {
      await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseEntityConfig });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body.entityId).toBe('https://remote.example.com/saml');
      expect(body.roles).toContain('IDPSSODescriptor');
    });

    it('should prefer standardMetadata over entityConfig when both are provided', async () => {
      await createSamlRemoteEntityTool.toolFunction({
        realm: 'alpha',
        standardMetadata: mockXmlMetadata,
        entityConfig: baseEntityConfig
      });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body.standardMetadata).toBe(mockXmlMetadata);
      expect(body.entityId).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the imported entity configuration', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/saml2/remote/', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ _id: 'imported-entity', ...body }, { status: 201 });
        })
      );

      const result = await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseEntityConfig });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('imported-entity');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should return early with guidance when neither standardMetadata nor entityConfig is provided', async () => {
      const result = await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Either standardMetadata or entityConfig must be provided');
    });

    it('should validate realm as alpha or bravo', () => {
      const schema = createSamlRemoteEntityTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('epsilon')).toThrow();
    });

    it('should accept standardMetadata as an optional string', () => {
      const schema = createSamlRemoteEntityTool.inputSchema.standardMetadata;
      expect(schema).toBeDefined();
      expect(() => schema!.parse(mockXmlMetadata)).not.toThrow();
      expect(() => schema!.parse(undefined)).not.toThrow();
    });

    it('should accept entityConfig as an optional record', () => {
      const schema = createSamlRemoteEntityTool.inputSchema.entityConfig;
      expect(schema).toBeDefined();
      expect(() => schema!.parse(baseEntityConfig)).not.toThrow();
      expect(() => schema!.parse(undefined)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request (invalid metadata)' },
      { status: 409, desc: '409 Conflict (entity already exists)' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.post('https://*/am/json/*/realm-config/saml2/remote/', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await createSamlRemoteEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseEntityConfig });

      expect(result.content[0].text).toContain('Failed to create remote SAML entity');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
