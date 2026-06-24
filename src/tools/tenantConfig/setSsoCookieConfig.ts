import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const setSsoCookieConfigTool = {
  name: 'setSsoCookieConfig',
  title: 'Set SSO Cookie Config',
  description: 'Set the SSO cookie configuration for the tenant',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    ssoCookieConfig: z.record(z.any()).describe('Partial or full SSO cookie configuration object')
  },
  async toolFunction({ ssoCookieConfig }: { ssoCookieConfig: Record<string, any> }) {
    const url = `https://${aicBaseUrl}/environment/sso-cookie`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'accept-api-version': 'protocol=1.0,resource=1.0'
        },
        body: JSON.stringify(ssoCookieConfig)
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to set SSO cookie config: ${error.message}`);
    }
  }
};
