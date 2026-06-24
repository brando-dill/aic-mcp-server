import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl, AM_SERVICES_LIST_HEADERS } from '../../utils/amHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

export const listAmServicesTool = {
  name: 'listAmServices',
  title: 'List AM Services',
  description:
    'List all configured AM services in a realm using the nextdescendents action. Returns all service instances with their type and current configuration. Uses accept-api-version: protocol=2.0,resource=1.0.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query (alpha or bravo)')
  },
  async toolFunction({ realm }: { realm: (typeof REALMS)[number] }) {
    try {
      const url = buildAMRealmUrl(realm, 'services?_action=nextdescendents');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_SERVICES_LIST_HEADERS,
        body: JSON.stringify({})
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list AM services for realm "${realm}": ${error.message}`);
    }
  }
};
