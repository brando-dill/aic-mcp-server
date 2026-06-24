import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const setCookieDomainsTool = {
  name: 'setCookieDomains',
  title: 'Set Cookie Domains',
  description: 'Set cookie domains for the tenant',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    domains: z.array(z.string()).describe('Array of cookie domain strings')
  },
  async toolFunction({ domains }: { domains: string[] }) {
    const url = `https://${aicBaseUrl}/environment/cookie-domains`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify({ domains })
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to set cookie domains: ${error.message}`);
    }
  }
};
