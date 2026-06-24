import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

export const deleteSecretTool = {
  name: 'deleteSecret',
  title: 'Delete Environment Secret (ESV)',
  description: 'Delete an environment secret (ESV) from PingOne AIC',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)')
  },
  async toolFunction({ secretId }: { secretId: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/secrets/${secretId}`;

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: {
          'accept-api-version': 'resource=1.0'
        }
      });

      return createToolResponse(
        formatSuccess(
          {
            _id: secretId,
            message: `Deleted secret '${secretId}'. Pod restart required for changes to take effect.`
          },
          response
        )
      );
    } catch (error: any) {
      return createToolResponse(`Failed to delete secret '${secretId}': ${error.message}`);
    }
  }
};
