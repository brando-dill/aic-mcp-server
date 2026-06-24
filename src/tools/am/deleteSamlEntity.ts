import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// SAML 2.0 entity API version header (protocol=2.1,resource=1.0)
const AM_SAML_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

const SAML_LOCATIONS = ['hosted', 'remote'] as const;

export const deleteSamlEntityTool = {
  name: 'deleteSamlEntity',
  title: 'Delete SAML 2.0 Entity',
  description:
    'Delete a SAML 2.0 entity configuration by its location (hosted or remote) and base64-encoded entity ID. Warning: this is a permanent deletion and cannot be undone. Any circle-of-trust memberships or federation partnerships that reference this entity must be updated separately.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the entity (alpha or bravo)'),
    location: z.enum(SAML_LOCATIONS).describe('Whether the entity is hosted or remote'),
    entityId64: safePathSegmentSchema.describe('The base64-encoded entity ID of the SAML entity to delete')
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

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_SAML_HEADERS
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `SAML entity "${entityId64}" (location: "${location}") deleted successfully from realm "${realm}".\nTransaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(
        `Failed to delete SAML entity "${entityId64}" (location: "${location}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
