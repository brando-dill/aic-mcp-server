import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';
import { safePathSegmentSchema, REALMS } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update', 'fr:idc:esv:read', 'fr:am:*'];

export const applyEnvironmentConfigurationTool = {
  name: 'applyEnvironmentConfiguration',
  title: 'Apply Environment Configuration',
  description:
    'Apply one or more environment-level configuration targets in a single call. Each supplied target is processed independently; partial success is allowed. Returns a results map with success/error per target. At least one target must be supplied. ' +
    'Supports ESV secrets/variables, custom/cookie domains, certificates, SSO cookie config, global AM services, and well-known file hosting for Android asset links and Apple app site association (required for mobile WebAuthn).',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  inputSchema: {
    esvSecret: z
      .object({
        secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)'),
        valueBase64: z.string().describe('Base64-encoded value for the secret'),
        description: z.string().optional().describe("Optional description of the secret's purpose"),
        encoding: z.enum(['generic', 'pem', 'base64hmac']).optional().describe('Encoding format of the secret value'),
        useInPlaceholders: z.boolean().optional().describe('Whether the secret can be used in placeholder expressions')
      })
      .optional()
      .describe('Create/update an ESV secret and activate the new version'),
    esvVariable: z
      .object({
        variableId: safePathSegmentSchema.describe('Variable ID (format: esv-*)'),
        value: z.string().describe('Variable value (plain string; will be base64-encoded internally)'),
        expressionType: z.string().optional().describe('Expression type (default: string)')
      })
      .optional()
      .describe('Create/update an ESV variable'),
    customDomains: z
      .object({
        realm: z.enum(REALMS).describe('The realm to configure custom domains for'),
        domains: z.array(z.string()).describe('Additional custom domains to merge (union) with existing ones')
      })
      .optional()
      .describe('Merge custom domains for a realm (GET then PUT union)'),
    cookieDomains: z
      .object({
        domains: z.array(z.string()).describe('Additional cookie domains to merge (union) with existing ones')
      })
      .optional()
      .describe('Merge cookie domains for the tenant (GET then PUT union)'),
    certificate: z
      .object({
        certificateId: safePathSegmentSchema.optional().describe('Certificate ID for update (omit to create)'),
        active: z.boolean().describe('Whether the certificate should be active'),
        certificate: z.string().optional().describe('PEM-encoded certificate (required for create)'),
        privateKey: z.string().optional().describe('PEM-encoded private key (required for create)')
      })
      .optional()
      .describe('Create (no certificateId) or update active flag (with certificateId) of a certificate'),
    ssoCookieConfig: z
      .record(z.any())
      .optional()
      .describe('Partial SSO cookie config fields to merge on top of existing config (GET then PUT)'),
    globalAmService: z
      .object({
        serviceName: safePathSegmentSchema.describe('Global AM service name (e.g., "CorsService")'),
        serviceConfig: z.record(z.any()).describe('Partial service configuration fields to merge')
      })
      .optional()
      .describe('Merge configuration into a global AM service (GET, strip _rev, merge, PUT)'),
    androidAssetLinks: z
      .object({
        domain: safePathSegmentSchema.describe(
          'FQDN of the AIC tenant or custom domain (e.g. "openam-example.forgeblocks.com")'
        ),
        assetLinks: z
          .array(z.record(z.any()))
          .min(1)
          .describe('Array of asset link objects with relation, namespace, package_name, sha256_cert_fingerprints')
      })
      .optional()
      .describe('Upload Android Digital Asset Links file to AIC well-known hosting (required for mobile WebAuthn)'),
    appleAppAssociation: z
      .object({
        domain: safePathSegmentSchema.describe(
          'FQDN of the AIC tenant or custom domain (e.g. "openam-example.forgeblocks.com")'
        ),
        applinks: z.record(z.any()).describe('Apple applinks object with details array (appIDs + components)'),
        webcredentials: z.record(z.any()).describe('Apple webcredentials object with apps array')
      })
      .optional()
      .describe('Upload Apple App Site Association file to AIC well-known hosting (required for iOS WebAuthn)')
  },
  async toolFunction({
    esvSecret,
    esvVariable,
    customDomains,
    cookieDomains,
    certificate,
    ssoCookieConfig,
    globalAmService,
    androidAssetLinks,
    appleAppAssociation
  }: {
    esvSecret?: {
      secretId: string;
      valueBase64: string;
      description?: string;
      encoding?: 'generic' | 'pem' | 'base64hmac';
      useInPlaceholders?: boolean;
    };
    esvVariable?: {
      variableId: string;
      value: string;
      expressionType?: string;
    };
    customDomains?: {
      realm: (typeof REALMS)[number];
      domains: string[];
    };
    cookieDomains?: {
      domains: string[];
    };
    certificate?: {
      certificateId?: string;
      active: boolean;
      certificate?: string;
      privateKey?: string;
    };
    ssoCookieConfig?: Record<string, any>;
    globalAmService?: {
      serviceName: string;
      serviceConfig: Record<string, unknown>;
    };
    androidAssetLinks?: {
      domain: string;
      assetLinks: Record<string, any>[];
    };
    appleAppAssociation?: {
      domain: string;
      applinks: Record<string, any>;
      webcredentials: Record<string, any>;
    };
  }) {
    // Guard: at least one target must be supplied
    if (
      esvSecret === undefined &&
      esvVariable === undefined &&
      customDomains === undefined &&
      cookieDomains === undefined &&
      certificate === undefined &&
      ssoCookieConfig === undefined &&
      globalAmService === undefined &&
      androidAssetLinks === undefined &&
      appleAppAssociation === undefined
    ) {
      return createToolResponse(
        'No configuration targets supplied. Provide at least one of: esvSecret, esvVariable, customDomains, cookieDomains, certificate, ssoCookieConfig, globalAmService, androidAssetLinks, or appleAppAssociation.'
      );
    }

    const results: Record<string, { success: boolean; error?: string }> = {};

    // --- ESV Secret ---
    if (esvSecret !== undefined) {
      try {
        const { secretId, valueBase64, description, encoding, useInPlaceholders } = esvSecret;

        // 1. PUT secret (create/update metadata)
        const secretBody: Record<string, unknown> = { _id: secretId, valueBase64 };
        if (description !== undefined) secretBody.description = description;
        if (encoding !== undefined) secretBody.encoding = encoding;
        if (useInPlaceholders !== undefined) secretBody.useInPlaceholders = useInPlaceholders;

        await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/secrets/${secretId}`, SCOPES, {
          method: 'PUT',
          headers: { 'accept-api-version': 'resource=1.0' },
          body: JSON.stringify(secretBody)
        });

        // 2. POST to create a new version
        const { data: versionData } = await makeAuthenticatedRequest(
          `https://${aicBaseUrl}/environment/secrets/${secretId}/versions?_action=create`,
          SCOPES,
          {
            method: 'POST',
            headers: { 'accept-api-version': 'resource=1.0' },
            body: JSON.stringify({ valueBase64 })
          }
        );

        const version = (versionData as Record<string, unknown>).version as string;

        // 3. POST to enable (changestatus) the new version
        await makeAuthenticatedRequest(
          `https://${aicBaseUrl}/environment/secrets/${secretId}/versions/${version}?_action=changestatus`,
          SCOPES,
          {
            method: 'POST',
            headers: { 'accept-api-version': 'resource=1.0' },
            body: JSON.stringify({ status: 'ENABLED' })
          }
        );

        results.esvSecret = { success: true };
      } catch (error: any) {
        results.esvSecret = { success: false, error: error.message };
      }
    }

    // --- ESV Variable ---
    if (esvVariable !== undefined) {
      try {
        const { variableId, value, expressionType } = esvVariable;
        const valueBase64 = Buffer.from(value).toString('base64');

        await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/variables/${variableId}`, SCOPES, {
          method: 'PUT',
          headers: { 'accept-api-version': 'resource=2.0' },
          body: JSON.stringify({ valueBase64, expressionType: expressionType ?? 'string' })
        });

        results.esvVariable = { success: true };
      } catch (error: any) {
        results.esvVariable = { success: false, error: error.message };
      }
    }

    // --- Custom Domains ---
    if (customDomains !== undefined) {
      try {
        const { realm, domains } = customDomains;
        const url = `https://${aicBaseUrl}/environment/custom-domains/${realm}`;

        const { data: existing } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'GET',
          headers: { 'accept-api-version': 'resource=1.0' }
        });

        const existingDomains: string[] = (existing as Record<string, any>).domains ?? [];
        const mergedDomains = Array.from(new Set([...existingDomains, ...domains]));

        await makeAuthenticatedRequest(url, SCOPES, {
          method: 'PUT',
          headers: { 'accept-api-version': 'resource=1.0' },
          body: JSON.stringify({ domains: mergedDomains })
        });

        results.customDomains = { success: true };
      } catch (error: any) {
        results.customDomains = { success: false, error: error.message };
      }
    }

    // --- Cookie Domains ---
    if (cookieDomains !== undefined) {
      try {
        const { domains } = cookieDomains;
        const url = `https://${aicBaseUrl}/environment/cookie-domains`;

        const { data: existing } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'GET'
        });

        const existingDomains: string[] = (existing as Record<string, any>).domains ?? [];
        const mergedDomains = Array.from(new Set([...existingDomains, ...domains]));

        await makeAuthenticatedRequest(url, SCOPES, {
          method: 'PUT',
          body: JSON.stringify({ domains: mergedDomains })
        });

        results.cookieDomains = { success: true };
      } catch (error: any) {
        results.cookieDomains = { success: false, error: error.message };
      }
    }

    // --- Certificate ---
    if (certificate !== undefined) {
      try {
        const { certificateId, active, certificate: certPem, privateKey } = certificate;

        if (certificateId === undefined) {
          // Create new certificate
          await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/certificates`, SCOPES, {
            method: 'POST',
            body: JSON.stringify({ active, certificate: certPem, privateKey })
          });
        } else {
          // Update existing certificate's active flag
          await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/certificates/${certificateId}`, SCOPES, {
            method: 'PATCH',
            body: JSON.stringify({ active })
          });
        }

        results.certificate = { success: true };
      } catch (error: any) {
        results.certificate = { success: false, error: error.message };
      }
    }

    // --- SSO Cookie Config ---
    if (ssoCookieConfig !== undefined) {
      try {
        const url = `https://${aicBaseUrl}/environment/sso-cookie`;

        const { data: existing } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'GET',
          headers: { 'accept-api-version': 'protocol=1.0,resource=1.0' }
        });

        const merged = { ...(existing as Record<string, unknown>), ...ssoCookieConfig };

        await makeAuthenticatedRequest(url, SCOPES, {
          method: 'PUT',
          headers: { 'accept-api-version': 'protocol=1.0,resource=1.0' },
          body: JSON.stringify(merged)
        });

        results.ssoCookieConfig = { success: true };
      } catch (error: any) {
        results.ssoCookieConfig = { success: false, error: error.message };
      }
    }

    // --- Global AM Service ---
    if (globalAmService !== undefined) {
      try {
        const { serviceName, serviceConfig } = globalAmService;
        const url = buildAMGlobalConfigUrl(encodeURIComponent(serviceName));

        const { data: fetchedService } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'GET',
          headers: AM_CORS_HEADERS
        });

        const currentService = fetchedService as Record<string, unknown>;
        const { _rev: _currentRev, ...serviceWithoutRev } = currentService;
        void _currentRev;

        const { _rev: _callerRev, ...callerConfigWithoutRev } = serviceConfig;
        void _callerRev;

        const mergedService = { ...serviceWithoutRev, ...callerConfigWithoutRev };

        await makeAuthenticatedRequest(url, SCOPES, {
          method: 'PUT',
          headers: AM_CORS_HEADERS,
          body: JSON.stringify(mergedService)
        });

        results.globalAmService = { success: true };
      } catch (error: any) {
        results.globalAmService = { success: false, error: error.message };
      }
    }

    // --- Android Asset Links ---
    if (androidAssetLinks !== undefined) {
      try {
        const { domain, assetLinks } = androidAssetLinks;
        const url = `https://${aicBaseUrl}/openidm/config/fidc/assetlinks.${domain}`;

        await makeAuthenticatedRequest(url, ['fr:idm:*'], {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: assetLinks })
        });

        results.androidAssetLinks = { success: true };
      } catch (error: any) {
        results.androidAssetLinks = { success: false, error: error.message };
      }
    }

    // --- Apple App Site Association ---
    if (appleAppAssociation !== undefined) {
      try {
        const { domain, applinks, webcredentials } = appleAppAssociation;
        const url = `https://${aicBaseUrl}/openidm/config/fidc/apple-app-site-association.${domain}`;

        await makeAuthenticatedRequest(url, ['fr:idm:*'], {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { applinks, webcredentials } })
        });

        results.appleAppAssociation = { success: true };
      } catch (error: any) {
        results.appleAppAssociation = { success: false, error: error.message };
      }
    }

    return createToolResponse(JSON.stringify({ results }, null, 2));
  }
};
