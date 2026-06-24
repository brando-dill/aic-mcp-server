import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMJourneyUrl, buildAMRealmUrl, AM_API_HEADERS, AM_SCRIPT_HEADERS_V2 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteJourneyConfigurationTool = {
  name: 'deleteJourneyConfiguration',
  title: 'Delete Journey Configuration',
  description:
    'Delete an authentication journey and optionally its associated scripts. Returns a summary of deleted resources and any errors. Script failures do not abort the operation.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS),
    journeyName: safePathSegmentSchema.describe('Name of the journey to delete'),
    scriptIds: z.array(safePathSegmentSchema).optional().describe('Script IDs to also delete')
  },
  async toolFunction({ realm, journeyName, scriptIds }: { realm: string; journeyName: string; scriptIds?: string[] }) {
    const deleted: string[] = [];
    const errors: string[] = [];

    // Step 1: DELETE the journey
    try {
      const journeyUrl = buildAMJourneyUrl(realm, journeyName);
      await makeAuthenticatedRequest(journeyUrl, SCOPES, {
        method: 'DELETE',
        headers: AM_API_HEADERS
      });
      deleted.push(journeyName);
    } catch (error: any) {
      errors.push(`journey "${journeyName}": ${error.message}`);
    }

    // Step 2: DELETE each script (failures do not abort)
    if (scriptIds && scriptIds.length > 0) {
      for (const scriptId of scriptIds) {
        try {
          const scriptUrl = buildAMRealmUrl(realm, `scripts/${encodeURIComponent(scriptId)}`);
          await makeAuthenticatedRequest(scriptUrl, SCOPES, {
            method: 'DELETE',
            headers: AM_SCRIPT_HEADERS_V2
          });
          deleted.push(`script:${scriptId}`);
        } catch (error: any) {
          errors.push(`script "${scriptId}": ${error.message}`);
        }
      }
    }

    const result = { deleted, errors };
    return createToolResponse(JSON.stringify(result, null, 2));
  }
};
