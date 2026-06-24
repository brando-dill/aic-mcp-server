import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:esv:update'];

export const deleteEnvironmentConfigurationTool = {
  name: 'deleteEnvironmentConfiguration',
  title: 'Delete Environment Configuration',
  description:
    'Delete one or more environment configuration items (secrets, variables, and/or certificates) from PingOne AIC. At least one target array must be supplied. Failures on individual items are collected and returned without stopping the remaining deletions.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    secretIds: z.array(safePathSegmentSchema).optional().describe('Secret IDs to delete'),
    variableIds: z.array(safePathSegmentSchema).optional().describe('Variable IDs to delete'),
    certificateIds: z.array(safePathSegmentSchema).optional().describe('Certificate IDs to delete')
  },
  async toolFunction({
    secretIds,
    variableIds,
    certificateIds
  }: {
    secretIds?: string[];
    variableIds?: string[];
    certificateIds?: string[];
  }) {
    const hasSecrets = Array.isArray(secretIds) && secretIds.length > 0;
    const hasVariables = Array.isArray(variableIds) && variableIds.length > 0;
    const hasCertificates = Array.isArray(certificateIds) && certificateIds.length > 0;

    if (!hasSecrets && !hasVariables && !hasCertificates) {
      return createToolResponse(
        'No targets supplied. Provide at least one non-empty array: secretIds, variableIds, or certificateIds.'
      );
    }

    const deleted: string[] = [];
    const errors: string[] = [];

    // Delete secrets
    if (hasSecrets) {
      for (const secretId of secretIds!) {
        try {
          await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/secrets/${secretId}`, SCOPES, {
            method: 'DELETE',
            headers: {
              'accept-api-version': 'resource=1.0'
            }
          });
          deleted.push(`secret:${secretId}`);
        } catch (error: any) {
          errors.push(`secret:${secretId}: ${error.message}`);
        }
      }
    }

    // Delete variables
    if (hasVariables) {
      for (const variableId of variableIds!) {
        try {
          await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/variables/${variableId}`, SCOPES, {
            method: 'DELETE',
            headers: {
              'accept-api-version': 'protocol=1.0,resource=1.0'
            }
          });
          deleted.push(`variable:${variableId}`);
        } catch (error: any) {
          errors.push(`variable:${variableId}: ${error.message}`);
        }
      }
    }

    // Delete certificates
    if (hasCertificates) {
      for (const certificateId of certificateIds!) {
        try {
          await makeAuthenticatedRequest(`https://${aicBaseUrl}/environment/certificates/${certificateId}`, SCOPES, {
            method: 'DELETE',
            headers: {
              'accept-api-version': 'resource=1.0'
            }
          });
          deleted.push(`certificate:${certificateId}`);
        } catch (error: any) {
          errors.push(`certificate:${certificateId}: ${error.message}`);
        }
      }
    }

    return createToolResponse(JSON.stringify({ deleted, errors }, null, 2));
  }
};
