import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// Social Identity Provider sub-config API version header (protocol=2.1,resource=1.0)
const AM_SOCIAL_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

export const listSocialProvidersTool = {
  name: 'listSocialProviders',
  title: 'List Social Identity Providers',
  description:
    'List all configured Social Identity Provider instances across all provider types on the AM SocialIdentityProviders service. Returns all provider instances with their type and configuration. Uses the nextdescendents action to retrieve all sub-configurations at once.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query (alpha or bravo)')
  },
  async toolFunction({ realm }: { realm: (typeof REALMS)[number] }) {
    try {
      const url = buildAMRealmUrl(realm, 'realm-config/services/SocialIdentityProviders?_action=nextdescendents');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_SOCIAL_HEADERS,
        body: JSON.stringify({})
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list social providers for realm "${realm}": ${error.message}`);
    }
  }
};
