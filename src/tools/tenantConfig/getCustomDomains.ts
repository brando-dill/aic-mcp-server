import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:read'];

export const getCustomDomainsTool = {
  name: 'getCustomDomains',
  title: 'Get Custom Domains',
  description: 'Retrieve custom domains configured for a realm',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to get custom domains for')
  },
  async toolFunction({ realm }: { realm: (typeof REALMS)[number] }) {
    const url = `https://${aicBaseUrl}/environment/custom-domains/${realm}`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        headers: {
          'accept-api-version': 'resource=1.0'
        }
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get custom domains: ${error.message}`);
    }
  }
};
