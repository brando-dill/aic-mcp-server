import { describe, it, expect } from 'vitest';
import { createSamlHostedEntityTool } from '../../../src/tools/am/createSamlHostedEntity.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createSamlHostedEntity', () => {
  const getSpy = setupTestEnvironment();

  const baseConfig = {
    entityId: 'https://example.com/saml/hosted',
    roles: ['SPSSODescriptor'],
    assertionConsumerService: [
      { index: 0, isDefault: true, binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', location: 'https://example.com/acs' }
    ]
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createSamlHostedEntity', createSamlHostedEntityTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL targeting the hosted SAML create action', async () => {
      await createSamlHostedEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseConfig });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/realm-config/saml2/hosted/?_action=create');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use POST method', async () => {
      await createSamlHostedEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseConfig });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should send entityConfig as JSON body', async () => {
      await createSamlHostedEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseConfig });

      const options = getSpy().mock.calls[0][2];
      const body = JSON.parse(options?.body as string);
      expect(body.entityId).toBe('https://example.com/saml/hosted');
      expect(body.roles).toContain('SPSSODescriptor');
    });

    it('should include realm in the URL path', async () => {
      await createSamlHostedEntityTool.toolFunction({ realm: 'bravo', entityConfig: baseConfig });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('/am/json/bravo/');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return the created entity configuration', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/saml2/hosted/', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ _id: body.entityId, ...body }, { status: 201 });
        })
      );

      const result = await createSamlHostedEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseConfig });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entityId).toBe('https://example.com/saml/hosted');
      expect(parsed.roles).toContain('SPSSODescriptor');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate realm as alpha or bravo', () => {
      const schema = createSamlHostedEntityTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
      expect(() => schema.parse('delta')).toThrow();
    });

    it('should accept any key-value pairs in entityConfig', () => {
      const schema = createSamlHostedEntityTool.inputSchema.entityConfig;
      expect(() => schema.parse({ entityId: 'https://example.com', roles: ['SPSSODescriptor'], custom: 42 })).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request' },
      { status: 409, desc: '409 Conflict (entity already exists)' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.post('https://*/am/json/*/realm-config/saml2/hosted/', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await createSamlHostedEntityTool.toolFunction({ realm: 'alpha', entityConfig: baseConfig });

      expect(result.content[0].text).toContain('Failed to create hosted SAML entity');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
