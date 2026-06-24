import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteAmServiceTool = {
  name: 'deleteAmService',
  title: 'Delete AM Service',
  description:
    'Delete an AM service from a realm by service type. Warning: this is a permanent deletion and cannot be undone. Any configuration or sub-config instances associated with the service will also be removed.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the service to delete (alpha or bravo)'),
    serviceType: safePathSegmentSchema.describe(
      'The service type identifier to delete (e.g., "SocialIdentityProviders", "validation")'
    )
  },
  async toolFunction({ realm, serviceType }: { realm: (typeof REALMS)[number]; serviceType: string }) {
    try {
      const url = buildAMRealmUrl(realm, `services/${encodeURIComponent(serviceType)}`);

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_SERVICES_HEADERS
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `AM service "${serviceType}" deleted successfully from realm "${realm}".\nTransaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to delete AM service "${serviceType}" for realm "${realm}": ${error.message}`);
    }
  }
};
