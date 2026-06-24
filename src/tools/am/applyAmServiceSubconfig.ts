import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_HEADERS } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const applyAmServiceSubconfigTool = {
  name: 'applyAmServiceSubconfig',
  title: 'Apply AM Service Sub-Configuration',
  description:
    'Apply configuration changes to an AM service sub-config instance using a read-merge-write pattern. Fetches the current sub-config, strips _rev, spreads caller-supplied subconfig fields on top, and PUTs the merged payload back. If the sub-config does not exist (404 on GET), performs a direct PUT with the supplied subconfig as a create. This differs from applyAmService — a missing sub-config triggers creation rather than an error. Fields not supplied in subconfig are preserved from the existing configuration on update.',
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
    subType: safePathSegmentSchema.describe(
      'The sub-type identifier within the service (e.g., "google" within SocialIdentityProviders)'
    ),
    id: safePathSegmentSchema.describe('The specific sub-configuration instance ID (e.g., "my-google-provider")'),
    subconfig: z
      .record(z.any())
      .describe(
        'Partial or full sub-configuration fields to merge into the existing sub-config. For creates (404 on GET), the full desired config must be supplied.'
      )
  },
  async toolFunction({
    realm,
    serviceType,
    subType,
    id,
    subconfig
  }: {
    realm: (typeof REALMS)[number];
    serviceType: string;
    subType: string;
    id: string;
    subconfig: Record<string, unknown>;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `services/${encodeURIComponent(serviceType)}/${encodeURIComponent(subType)}/${encodeURIComponent(id)}`
      );

      // Strip _rev from caller-supplied subconfig
      const { _rev: _callerRev, ...subconfigWithoutRev } = subconfig;
      void _callerRev; // intentionally discarded

      let mergedSubconfig: Record<string, unknown>;

      try {
        // Attempt to fetch existing sub-config
        const { data: fetchedSubconfig } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'GET',
          headers: AM_SERVICES_HEADERS
        });

        const currentSubconfig = fetchedSubconfig as Record<string, unknown>;

        // Strip _rev from fetched sub-config before PUT
        const { _rev: _currentRev, ...subconfigFetchedWithoutRev } = currentSubconfig;
        void _currentRev; // intentionally discarded

        // Merge caller overrides over current sub-config
        mergedSubconfig = { ...subconfigFetchedWithoutRev, ...subconfigWithoutRev };
      } catch (getError: any) {
        // 404 on GET — sub-config does not exist; create via direct PUT
        if (getError.message?.includes('404')) {
          mergedSubconfig = subconfigWithoutRev;
        } else {
          throw getError;
        }
      }

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_SERVICES_HEADERS,
        body: JSON.stringify(mergedSubconfig)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to apply sub-configuration "${id}" (subType: "${subType}") for AM service "${serviceType}" in realm "${realm}": ${error.message}`
      );
    }
  }
};
