import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_LIST_HEADERS } from '../../utils/amHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const describeAmServiceSchemaTool = {
  name: 'describeAmServiceSchema',
  title: 'Describe AM Service Schema',
  description:
    'Retrieve available AM service type descriptors and schema metadata for a realm using the getAllTypes action. Returns a list of all service types with their schema information. Useful for discovering what services can be configured. Uses accept-api-version: protocol=2.0,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query for service type schemas (alpha or bravo)')
  },
  async toolFunction({ realm }: { realm: (typeof REALMS)[number] }) {
    try {
      const url = buildAMRealmUrl(realm, 'services?_action=getAllTypes');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SERVICES_LIST_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to describe AM service schemas for realm "${realm}": ${error.message}`
      );
    }
  }
};
