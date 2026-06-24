import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const updateCertificateTool = {
  name: 'updateCertificate',
  title: 'Update Certificate',
  description: 'Update the active flag of a server certificate',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    id: safePathSegmentSchema.describe('The certificate ID'),
    active: z.boolean().describe('Whether the certificate is active')
  },
  async toolFunction({ id, active }: { id: string; active: boolean }) {
    const url = `https://${aicBaseUrl}/environment/certificates/${id}`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PATCH',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify({ active })
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to update certificate: ${error.message}`);
    }
  }
};
