import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const applyAmServiceTool = {
  name: 'applyAmService',
  title: 'Apply AM Service Configuration',
  description:
    'Apply configuration changes to an AM service using a read-merge-write pattern. Fetches the current service configuration, strips _rev, spreads caller-supplied serviceConfig fields on top, and PUTs the merged payload back. A 404 on GET is surfaced as an error — callers must supply a full config for creates (no partial merge on a missing service). Fields not supplied in serviceConfig are preserved from the existing configuration.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the service (alpha or bravo)'),
    serviceType: safePathSegmentSchema.describe(
      'The service type identifier (e.g., "SocialIdentityProviders", "validation")'
    ),
    serviceConfig: z
      .record(z.any())
      .describe('Partial or full service configuration fields to merge into the existing service configuration')
  },
  async toolFunction({
    realm,
    serviceType,
    serviceConfig
  }: {
    realm: (typeof REALMS)[number];
    serviceType: string;
    serviceConfig: Record<string, unknown>;
  }) {
    try {
      const url = buildAMRealmUrl(realm, `services/${encodeURIComponent(serviceType)}`);

      // Fetch existing service configuration
      const { data: fetchedService } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SERVICES_HEADERS
      });

      const currentService = fetchedService as Record<string, unknown>;

      // Strip _rev from fetched service before PUT
      const { _rev: _currentRev, ...serviceWithoutRev } = currentService;
      void _currentRev; // intentionally discarded

      // Strip _rev from caller-supplied config as well
      const { _rev: _callerRev, ...callerConfigWithoutRev } = serviceConfig;
      void _callerRev; // intentionally discarded

      // Merge caller overrides over current service config
      const mergedService = { ...serviceWithoutRev, ...callerConfigWithoutRev };

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_SERVICES_HEADERS,
        body: JSON.stringify(mergedService)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to apply AM service "${serviceType}" for realm "${realm}": ${error.message}`
      );
    }
  }
};
