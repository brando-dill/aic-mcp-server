import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

export const createSecretVersionTool = {
  name: 'createSecretVersion',
  title: 'Create Environment Secret Version (ESV)',
  description: 'Create a new version of an environment secret (ESV) with a new value',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)'),
    valueBase64: z.string().describe('Base64-encoded value for the new secret version')
  },
  async toolFunction({ secretId, valueBase64 }: { secretId: string; valueBase64: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/secrets/${secretId}/versions?_action=create`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify({ valueBase64 })
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create version for secret '${secretId}': ${error.message}`);
    }
  }
};
