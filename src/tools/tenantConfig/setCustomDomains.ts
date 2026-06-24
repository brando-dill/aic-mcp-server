import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const setCustomDomainsTool = {
  name: 'setCustomDomains',
  title: 'Set Custom Domains',
  description: 'Set custom domains for a realm',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to set custom domains for'),
    domains: z.array(z.string()).describe('Array of custom domain strings')
  },
  async toolFunction({ realm, domains }: { realm: (typeof REALMS)[number]; domains: string[] }) {
    const url = `https://${aicBaseUrl}/environment/custom-domains/${realm}`;
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
      return createToolResponse(`Failed to set custom domains: ${error.message}`);
    }
  }
};
