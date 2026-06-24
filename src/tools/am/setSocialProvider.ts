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

export const setSocialProviderTool = {
  name: 'setSocialProvider',
  title: 'Set Social Identity Provider',
  description:
    'Create or update a Social Identity Provider configuration on the AM SocialIdentityProviders service (upsert via PUT). Strips _rev from the config before writing to prevent AM from rejecting the request with a conflict error. For read-then-write flows, supply the current config with _rev already stripped, or pass an entirely new config for creation.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to write to (alpha or bravo)'),
    providerType: safePathSegmentSchema.describe(
      'The social provider type (e.g., google, facebook, apple, oidcConfig)'
    ),
    providerId: safePathSegmentSchema.describe('The unique ID of the social provider instance'),
    providerConfig: z.record(z.any()).describe('The full provider configuration object to write')
  },
  async toolFunction({
    realm,
    providerType,
    providerId,
    providerConfig
  }: {
    realm: (typeof REALMS)[number];
    providerType: string;
    providerId: string;
    providerConfig: Record<string, unknown>;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `realm-config/services/SocialIdentityProviders/${encodeURIComponent(providerType)}/${encodeURIComponent(providerId)}`
      );

      // Strip _rev to prevent AM rejecting the PUT with a conflict error
      const { _rev, ...configWithoutRev } = providerConfig;
      void _rev; // intentionally discarded

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_SOCIAL_HEADERS,
        body: JSON.stringify(configWithoutRev)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to set social provider "${providerId}" (type: "${providerType}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
