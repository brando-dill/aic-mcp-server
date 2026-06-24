import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];
const SOCIAL_PROVIDER_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
};

export const applySocialLoginExperienceTool = {
  name: 'applySocialLoginExperience',
  title: 'Apply Social Login Experience',
  description:
    'Configure a social identity provider for a realm. On first call (provider not found), creates the provider directly. On subsequent calls, reads the existing config, merges supplied fields, and writes back via PUT.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS),
    providerType: safePathSegmentSchema.describe('Provider type (e.g., "google", "facebook", "oidcConfig")'),
    providerId: safePathSegmentSchema.describe('Provider instance ID (e.g., "my-google-provider")'),
    providerConfig: z
      .record(z.any())
      .describe('Provider configuration fields to apply (clientId, clientSecret, scopes, redirectURI, etc.)'),
    journeyName: z
      .string()
      .optional()
      .describe('Journey name to associate with this provider (informational only — recorded in result, not validated)')
  },
  async toolFunction({
    realm,
    providerType,
    providerId,
    providerConfig,
    journeyName
  }: {
    realm: string;
    providerType: string;
    providerId: string;
    providerConfig: Record<string, any>;
    journeyName?: string;
  }) {
    const providerUrl = buildAMRealmUrl(
      realm,
      `realm-config/services/SocialIdentityProviders/${encodeURIComponent(providerType)}/${encodeURIComponent(providerId)}`
    );

    // Step 1: Try to GET the existing provider config
    let existingConfig: Record<string, any> | null = null;
    let created = false;

    try {
      const { data } = await makeAuthenticatedRequest(providerUrl, SCOPES, {
        method: 'GET',
        headers: SOCIAL_PROVIDER_HEADERS
      });
      existingConfig = data as Record<string, any>;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        // Provider does not exist yet — create path
        existingConfig = null;
      } else {
        return createToolResponse(`Failed to fetch social provider config: ${error.message}`);
      }
    }

    // Step 2: Build the config to PUT
    let configToPut: Record<string, any>;

    if (existingConfig === null) {
      // Create path: PUT the caller-supplied config directly
      created = true;
      configToPut = providerConfig;
    } else {
      // Update path: strip _rev, merge caller-supplied fields on top
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _rev, ...baseConfig } = existingConfig;
      configToPut = { ...baseConfig, ...providerConfig };
    }

    // Step 3: PUT the config
    let putResponse: Response;
    try {
      const { response } = await makeAuthenticatedRequest(providerUrl, SCOPES, {
        method: 'PUT',
        headers: SOCIAL_PROVIDER_HEADERS,
        body: JSON.stringify(configToPut)
      });
      putResponse = response;
    } catch (error: any) {
      return createToolResponse(`Failed to save social provider config: ${error.message}`);
    }

    // Step 4: Build result
    const result: Record<string, any> = {
      providerId,
      providerType,
      realm,
      created,
      config: configToPut
    };

    if (journeyName !== undefined) {
      result.journeyName = journeyName;
    }

    return createToolResponse(formatSuccess(result, putResponse!));
  }
};
