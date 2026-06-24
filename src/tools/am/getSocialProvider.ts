import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// Social Identity Provider sub-config API version header (protocol=2.1,resource=1.0)
const AM_SOCIAL_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

export const getSocialProviderTool = {
  name: 'getSocialProvider',
  title: 'Get Social Identity Provider',
  description:
    'Retrieve a specific Social Identity Provider configuration by its type and ID from the AM SocialIdentityProviders service. Returns the full provider configuration including client ID, redirect URI, scope, and type-specific settings.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query (alpha or bravo)'),
    providerType: safePathSegmentSchema.describe(
      'The social provider type (e.g., google, facebook, apple, oidcConfig)'
    ),
    providerId: safePathSegmentSchema.describe('The unique ID of the social provider instance')
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

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SOCIAL_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to get social provider "${providerId}" (type: "${providerType}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
