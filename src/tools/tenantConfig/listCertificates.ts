import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:read'];

export const listCertificatesTool = {
  name: 'listCertificates',
  title: 'List Certificates',
  description: 'List all server certificates configured in the environment',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {},
  async toolFunction(_input: Record<string, never>) {
    const url = `https://${aicBaseUrl}/environment/certificates`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        headers: {
          'accept-api-version': 'resource=1.0'
        }
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list certificates: ${error.message}`);
    }
  }
};
