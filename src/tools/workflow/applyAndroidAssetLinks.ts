import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*'];

export const applyAndroidAssetLinksTool = {
  name: 'applyAndroidAssetLinks',
  title: 'Apply Android Asset Links',
  description:
    'Upload or replace the Android Digital Asset Links file (.well-known/assetlinks.json) hosted by PingOne AIC. ' +
    'Required before WebAuthn passkeys can work on Android — the OS fetches this file to verify the app-to-domain binding. ' +
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
    assetLinks: z
      .array(z.record(z.any()))
      .min(1)
      .describe(
        'Array of asset link objects. Each object should contain "relation" (array of permission strings), ' +
          '"target" with "namespace", "package_name", and "sha256_cert_fingerprints".'
      )
  },
  async toolFunction({ domain, assetLinks }: { domain: string; assetLinks: Record<string, any>[] }) {
    try {
      const url = `https://${aicBaseUrl}/openidm/config/fidc/assetlinks.${domain}`;

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: assetLinks })
      });

      return createToolResponse(formatSuccess({ domain, updated: true }, response));
    } catch (error: any) {
      return createToolResponse(`Failed to upload Android asset links: ${error.message}`);
    }
  }
};
