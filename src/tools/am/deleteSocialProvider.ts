import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// Social Identity Provider sub-config API version header (protocol=2.1,resource=1.0)
const AM_SOCIAL_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

export const deleteSocialProviderTool = {
  name: 'deleteSocialProvider',
  title: 'Delete Social Identity Provider',
  description:
    'Delete a Social Identity Provider configuration by type and ID from the AM SocialIdentityProviders service. Warning: this is a permanent deletion and cannot be undone. Any journeys that reference this provider will need to be updated separately.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to write to (alpha or bravo)'),
    providerType: safePathSegmentSchema.describe(
      'The social provider type (e.g., google, facebook, apple, oidcConfig)'
    ),
    providerId: safePathSegmentSchema.describe('The unique ID of the social provider instance to delete')
  },
  async toolFunction({
    realm,
    providerType,
    providerId
  }: {
    realm: (typeof REALMS)[number];
    providerType: string;
    providerId: string;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `realm-config/services/SocialIdentityProviders/${encodeURIComponent(providerType)}/${encodeURIComponent(providerId)}`
      );

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_SOCIAL_HEADERS
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `Social provider "${providerId}" (type: "${providerType}") deleted successfully from realm "${realm}".\nTransaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(
        `Failed to delete social provider "${providerId}" (type: "${providerType}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
