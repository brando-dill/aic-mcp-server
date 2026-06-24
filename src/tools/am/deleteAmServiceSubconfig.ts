import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteAmServiceSubconfigTool = {
  name: 'deleteAmServiceSubconfig',
  title: 'Delete AM Service Sub-Configuration',
  description:
    'Delete a specific sub-configuration instance from an AM service in a realm. Warning: this is a permanent deletion and cannot be undone. Uses accept-api-version: protocol=2.1,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
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
    id: safePathSegmentSchema.describe(
      'The specific sub-configuration instance ID to delete (e.g., "my-google-provider")'
    )
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

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_SERVICES_HEADERS
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `Sub-configuration "${id}" (subType: "${subType}") deleted successfully from AM service "${serviceType}" in realm "${realm}".\nTransaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(
        `Failed to delete sub-configuration "${id}" (subType: "${subType}") from AM service "${serviceType}" in realm "${realm}": ${error.message}`
      );
    }
  }
};
