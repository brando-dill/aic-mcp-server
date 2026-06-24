import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:read'];

export const getCertificateTool = {
  name: 'getCertificate',
  title: 'Get Certificate',
  description: 'Get a specific server certificate by ID',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    id: safePathSegmentSchema.describe('The certificate ID')
  },
  async toolFunction({ id }: { id: string }) {
    const url = `https://${aicBaseUrl}/environment/certificates/${id}`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        headers: {
          'accept-api-version': 'resource=1.0'
        }
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get certificate: ${error.message}`);
    }
  }
};
