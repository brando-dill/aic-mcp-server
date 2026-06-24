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

export const createSamlHostedEntityTool = {
  name: 'createSamlHostedEntity',
  title: 'Create SAML 2.0 Hosted Entity',
  description:
    'Create a new hosted SAML 2.0 entity configuration in AM using the POST _action=create endpoint. A hosted entity is one where this AIC instance acts as the identity provider or service provider.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to create the entity in (alpha or bravo)'),
    entityConfig: z.record(z.any()).describe('The full SAML 2.0 entity configuration object to create')
  },
  async toolFunction({
    realm,
    entityConfig
  }: {
    realm: (typeof REALMS)[number];
    entityConfig: Record<string, unknown>;
  }) {
    try {
      const url = buildAMRealmUrl(realm, 'realm-config/saml2/hosted/?_action=create');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_SAML_HEADERS,
        body: JSON.stringify(entityConfig)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create hosted SAML entity for realm "${realm}": ${error.message}`);
    }
  }
};
