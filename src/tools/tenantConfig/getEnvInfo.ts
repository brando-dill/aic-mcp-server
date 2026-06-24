import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:read'];

export const getEnvInfoTool = {
  name: 'getEnvInfo',
  title: 'Get Environment Info',
  description: 'Retrieve environment information for the tenant',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {},
  async toolFunction(_args: Record<string, never>) {
    const url = `https://${aicBaseUrl}/environment/info`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        headers: {
          'accept-api-version': 'protocol=1.0,resource=1.0'
        }
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get environment info: ${error.message}`);
    }
  }
};
