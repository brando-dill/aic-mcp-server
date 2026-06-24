import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

export const setActiveSecretVersionTool = {
  name: 'setActiveSecretVersion',
  title: 'Set Active Secret Version (ESV)',
  description: 'Promote a specific version of an environment secret to ENABLED (active) status',
  scopes: SCOPES,
  annotations: {
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)'),
    version: safePathSegmentSchema.describe('Version number or identifier to promote to active status (e.g., "2")')
  },
  async toolFunction({ secretId, version }: { secretId: string; version: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/secrets/${secretId}/versions/${version}?_action=changestatus`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify({ status: 'ENABLED' })
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to set active version '${version}' for secret '${secretId}': ${error.message}`);
    }
  }
};
