import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// SAML 2.0 entity API version header (protocol=2.1,resource=1.0)
const AM_SAML_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

export const createSamlRemoteEntityTool = {
  name: 'createSamlRemoteEntity',
  title: 'Create SAML 2.0 Remote Entity',
  description:
    'Import a remote SAML 2.0 entity configuration into AM using the POST _action=importEntity endpoint. A remote entity represents a federation partner (e.g., an external service provider or identity provider). Supply either standardMetadata (XML metadata string) or entityConfig (structured object) — standardMetadata takes precedence if both are provided.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to import the entity into (alpha or bravo)'),
    standardMetadata: z
      .string()
      .optional()
      .describe('Standard SAML metadata XML string to import. Takes precedence over entityConfig if both are supplied.'),
    entityConfig: z
      .record(z.any())
      .optional()
      .describe('Structured entity configuration object. Used when standardMetadata is not available.')
  },
  async toolFunction({
    realm,
    standardMetadata,
    entityConfig
  }: {
    realm: (typeof REALMS)[number];
    standardMetadata?: string;
    entityConfig?: Record<string, unknown>;
  }) {
    try {
      if (!standardMetadata && !entityConfig) {
        return createToolResponse(
          'Either standardMetadata or entityConfig must be provided to import a remote SAML entity.'
        );
      }

      const url = buildAMRealmUrl(realm, 'realm-config/saml2/remote/?_action=importEntity');

      const body = standardMetadata ? { standardMetadata } : entityConfig;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_SAML_HEADERS,
        body: JSON.stringify(body)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create remote SAML entity for realm "${realm}": ${error.message}`);
    }
  }
};
