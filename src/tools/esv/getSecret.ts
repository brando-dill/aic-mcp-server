import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:read'];

export const getSecretTool = {
  name: 'getSecret',
  title: 'Get Environment Secret (ESV)',
  description: 'Retrieve a specific environment secret (ESV) by ID',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)')
  },
  async toolFunction({ secretId }: { secretId: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/secrets/${secretId}`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        headers: {
          'accept-api-version': 'resource=1.0'
        }
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get secret '${secretId}': ${error.message}`);
    }
  }
};
