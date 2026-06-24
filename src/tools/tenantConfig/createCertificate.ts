import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

// Scope assumption (AD-2): /environment/* endpoints follow the same fr:idc:esv scope pattern as ESV tools.
// Correct if confirmed otherwise during testing.

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const createCertificateTool = {
  name: 'createCertificate',
  title: 'Create Certificate',
  description: 'Create a new server certificate in the environment',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  inputSchema: {
    active: z.boolean().describe('Whether the certificate should be active'),
    certificate: z.string().describe('PEM-encoded certificate'),
    privateKey: z.string().describe('PEM-encoded private key')
  },
  async toolFunction({
    active,
    certificate,
    privateKey
  }: {
    active: boolean;
    certificate: string;
    privateKey: string;
  }) {
    const url = `https://${aicBaseUrl}/environment/certificates`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify({ active, certificate, privateKey })
      });
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create certificate: ${error.message}`);
    }
  }
};
