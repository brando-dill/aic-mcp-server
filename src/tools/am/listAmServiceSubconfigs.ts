import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const listAmServiceSubconfigsTool = {
  name: 'listAmServiceSubconfigs',
  title: 'List AM Service Sub-Configurations',
  description:
    'List all sub-configuration instances under a given AM service in a realm. Returns all sub-config instances by GETting the service with _queryFilter=true. Useful for discovering existing sub-configs before creating or updating them. Uses accept-api-version: protocol=2.1,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the service (alpha or bravo)'),
    serviceType: safePathSegmentSchema.describe(
      'The service type identifier (e.g., "SocialIdentityProviders", "validation")'
    )
  },
  async toolFunction({ realm, serviceType }: { realm: (typeof REALMS)[number]; serviceType: string }) {
    try {
      const url = buildAMRealmUrl(realm, `services/${encodeURIComponent(serviceType)}?_queryFilter=true`);

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SERVICES_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to list sub-configurations for AM service "${serviceType}" in realm "${realm}": ${error.message}`
      );
    }
  }
};
