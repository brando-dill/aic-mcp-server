import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*'];

export const applyAppleAppAssociationTool = {
  name: 'applyAppleAppAssociation',
  title: 'Apply Apple App Site Association',
  description:
    'Upload or replace the Apple App Site Association file (.well-known/apple-app-site-association) hosted by PingOne AIC. ' +
    'Required before WebAuthn passkeys can work on iOS — Apple fetches this file to verify the app-to-domain binding via Associated Domains. ' +
    'The domain must match the WebAuthn relying party ID configured in the journey nodes.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    domain: safePathSegmentSchema.describe(
      'FQDN of the AIC tenant or custom domain that serves the file (e.g. "openam-example.forgeblocks.com")'
    ),
    applinks: z
      .record(z.any())
      .describe(
        'Apple applinks object. Should contain a "details" array of objects with "appIDs" (format: "<TeamID>.<BundleID>") ' +
          'and "components" (URL path components to match).'
      ),
    webcredentials: z
      .record(z.any())
      .describe('Apple webcredentials object. Should contain an "apps" array of app IDs (format: "<TeamID>.<BundleID>").')
  },
  async toolFunction({
    domain,
    applinks,
    webcredentials
  }: {
    domain: string;
    applinks: Record<string, any>;
    webcredentials: Record<string, any>;
  }) {
    try {
      const url = `https://${aicBaseUrl}/openidm/config/fidc/apple-app-site-association.${domain}`;

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { applinks, webcredentials } })
      });

      return createToolResponse(formatSuccess({ domain, updated: true }, response));
    } catch (error: any) {
      return createToolResponse(`Failed to upload Apple app site association: ${error.message}`);
    }
  }
};
