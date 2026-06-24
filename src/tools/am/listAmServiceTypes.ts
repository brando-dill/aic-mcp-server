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

export const listAmServiceTypesTool = {
  name: 'listAmServiceTypes',
  title: 'List AM Social Identity Provider Service Types',
  description:
    'List all available Social Identity Provider type schemas on the AM SocialIdentityProviders service. Returns the type descriptors including type IDs, names, and configuration schema metadata. Use this to discover supported provider types (e.g., google, facebook, apple) before creating a new provider instance.',
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
      const url = buildAMRealmUrl(realm, 'realm-config/services/SocialIdentityProviders?_action=getAllTypes');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SOCIAL_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list AM service types for realm "${realm}": ${error.message}`);
    }
  }
};
