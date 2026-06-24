import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const getAmServiceSubconfigTool = {
  name: 'getAmServiceSubconfig',
  title: 'Get AM Service Sub-Configuration',
  description:
    'Get a specific sub-configuration instance from an AM service in a realm. Returns the full sub-config object for the given serviceType, subType, and id. Uses accept-api-version: protocol=2.1,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the service (alpha or bravo)'),
    serviceType: safePathSegmentSchema.describe(
      'The service type identifier (e.g., "SocialIdentityProviders", "validation")'
    ),
    subType: safePathSegmentSchema.describe(
      'The sub-type identifier within the service (e.g., "google" within SocialIdentityProviders)'
    ),
    id: safePathSegmentSchema.describe('The specific sub-configuration instance ID (e.g., "my-google-provider")')
  },
  async toolFunction({
    realm,
    serviceType,
    subType,
    id
  }: {
    realm: (typeof REALMS)[number];
    serviceType: string;
    subType: string;
    id: string;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `services/${encodeURIComponent(serviceType)}/${encodeURIComponent(subType)}/${encodeURIComponent(id)}`
      );

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SERVICES_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to get sub-configuration "${id}" (subType: "${subType}") from AM service "${serviceType}" in realm "${realm}": ${error.message}`
      );
    }
  }
};
