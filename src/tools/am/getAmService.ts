import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const getAmServiceTool = {
  name: 'getAmService',
  title: 'Get AM Service',
  description:
    'Get the configuration of a specific AM service in a realm by service type. Returns the full service configuration object. Uses accept-api-version: protocol=2.1,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the service (alpha or bravo)'),
    serviceType: safePathSegmentSchema.describe(
      'The service type identifier (e.g., "SocialIdentityProviders", "validation", "scripting")'
    )
  },
  async toolFunction({ realm, serviceType }: { realm: (typeof REALMS)[number]; serviceType: string }) {
    try {
      const url = buildAMRealmUrl(realm, `services/${encodeURIComponent(serviceType)}`);

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SERVICES_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to get AM service "${serviceType}" for realm "${realm}": ${error.message}`
      );
    }
  }
};
