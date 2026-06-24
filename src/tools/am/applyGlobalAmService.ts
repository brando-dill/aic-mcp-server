import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const applyGlobalAmServiceTool = {
  name: 'applyGlobalAmService',
  title: 'Apply Global AM Service Configuration',
  description:
    'Apply configuration changes to a global (non-realm-scoped) AM service using a read-merge-write pattern. Fetches the current global service configuration via buildAMGlobalConfigUrl(serviceName), strips _rev, spreads caller-supplied serviceConfig fields on top, and PUTs the merged payload back. A 404 on GET is surfaced as an error — the service must already exist. This is the primitive used by applyEnvironmentConfiguration for global-tier AM service configuration.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    serviceName: safePathSegmentSchema.describe(
      'The name of the global AM service (e.g., "CorsService", "OAuth2Provider")'
    ),
    serviceConfig: z
      .record(z.any())
      .describe('Partial or full service configuration fields to merge into the existing global service configuration')
  },
  async toolFunction({
    serviceName,
    serviceConfig
  }: {
    serviceName: string;
    serviceConfig: Record<string, unknown>;
  }) {
    try {
      // accept-api-version: resource=1.0 — matching AM_CORS_HEADERS pattern for global config endpoints (AD-15)
      const url = buildAMGlobalConfigUrl(serviceName);

      // Fetch existing global service configuration
      const { data: fetchedService } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_CORS_HEADERS
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
        headers: AM_CORS_HEADERS,
        body: JSON.stringify(mergedService)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to apply global AM service "${serviceName}": ${error.message}`
      );
    }
  }
};
