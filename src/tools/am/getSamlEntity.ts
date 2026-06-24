import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// SAML 2.0 entity API version header (protocol=2.1,resource=1.0)
const AM_SAML_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

const SAML_LOCATIONS = ['hosted', 'remote'] as const;

export const getSamlEntityTool = {
  name: 'getSamlEntity',
  title: 'Get SAML 2.0 Entity',
  description:
    'Retrieve a SAML 2.0 entity configuration by its location (hosted or remote) and base64-encoded entity ID. Returns the full entity configuration including service provider and identity provider settings.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query (alpha or bravo)'),
    location: z.enum(SAML_LOCATIONS).describe('Whether the entity is hosted or remote'),
    entityId64: safePathSegmentSchema.describe('The base64-encoded entity ID of the SAML entity')
  },
  async toolFunction({
    realm,
    location,
    entityId64
  }: {
    realm: (typeof REALMS)[number];
    location: (typeof SAML_LOCATIONS)[number];
    entityId64: string;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `realm-config/saml2/${encodeURIComponent(location)}/${encodeURIComponent(entityId64)}`
      );

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SAML_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to get SAML entity "${entityId64}" (location: "${location}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
