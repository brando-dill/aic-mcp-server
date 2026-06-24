import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

export const setSecretTool = {
  name: 'setSecret',
  title: 'Set Environment Secret (ESV)',
  description: 'Create or update an environment secret (ESV) in PingOne AIC',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    secretId: safePathSegmentSchema.describe('Secret ID (format: esv-*)'),
    valueBase64: z.string().describe('Base64-encoded value for the secret'),
    description: z.string().optional().describe("Optional description of the secret's purpose"),
    encoding: z
      .enum(['generic', 'pem', 'base64hmac'])
      .optional()
      .describe('Encoding format of the secret value (default: generic)'),
    useInPlaceholders: z
      .boolean()
      .optional()
      .describe('Whether the secret can be referenced in placeholder expressions')
  },
  async toolFunction({
    secretId,
    valueBase64,
    description,
    encoding,
    useInPlaceholders
  }: {
    secretId: string;
    valueBase64: string;
    description?: string;
    encoding?: 'generic' | 'pem' | 'base64hmac';
    useInPlaceholders?: boolean;
  }) {
    try {
      const requestBody: Record<string, unknown> = {
        _id: secretId,
        valueBase64
      };

      if (description !== undefined) {
        requestBody.description = description;
      }

      if (encoding !== undefined) {
        requestBody.encoding = encoding;
      }

      if (useInPlaceholders !== undefined) {
        requestBody.useInPlaceholders = useInPlaceholders;
      }

      const url = `https://${aicBaseUrl}/environment/secrets/${secretId}`;

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'accept-api-version': 'resource=1.0'
        },
        body: JSON.stringify(requestBody)
      });

      return createToolResponse(
        formatSuccess(
          {
            _id: secretId,
            message: `Set secret '${secretId}'. Pod restart required for changes to take effect.`
          },
          response
        )
      );
    } catch (error: any) {
      return createToolResponse(`Failed to set secret '${secretId}': ${error.message}`);
    }
  }
};
