import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

const SAML_API_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0'
} as const;

const SAML_LOCATIONS = ['hosted', 'remote'] as const;

export const deleteApplicationConfigurationTool = {
  name: 'deleteApplicationConfiguration',
  title: 'Delete Application Configuration',
  description:
    'Deletes an application and all associated AM configuration. Removes the IDM managed application, optionally deletes the linked AM OAuth2Client, and optionally deletes a SAML 2.0 entity.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the application (alpha or bravo)'),
    applicationName: z.string().describe('Name of the application to delete'),
    samlEntityId: z.string().optional().describe('SAML 2.0 entity ID to delete (plain text, will be base64-encoded)'),
    samlLocation: z.enum(SAML_LOCATIONS).optional().describe('SAML entity location: hosted or remote')
  },
  async toolFunction({
    realm,
    applicationName,
    samlEntityId,
    samlLocation
  }: {
    realm: (typeof REALMS)[number];
    applicationName: string;
    samlEntityId?: string;
    samlLocation?: (typeof SAML_LOCATIONS)[number];
  }) {
    try {
      // Step 1: Query IDM for the managed application by name
      const idmQueryUrl =
        `https://${aicBaseUrl}/openidm/managed/${realm}_application` +
        `?_queryFilter=${encodeURIComponent(`name eq "${applicationName}"`)}&_fields=_id,ssoEntities`;

      const { data: queryData } = await makeAuthenticatedRequest(idmQueryUrl, SCOPES, {
        method: 'GET'
      });

      const idmResults = (
        queryData as {
          result: Array<{ _id: string; ssoEntities?: { oidcId?: string } }>;
        }
      ).result;

      // Step 2: If not found, return error — no deletions attempted
      if (!idmResults?.length) {
        return createToolResponse(
          `Application "${applicationName}" not found in realm "${realm}". No deletion performed.`
        );
      }

      const managedApp = idmResults[0];
      const oidcId = managedApp.ssoEntities?.oidcId;
      const deleted: string[] = [];

      // Step 3: Delete the IDM managed application
      await makeAuthenticatedRequest(
        `https://${aicBaseUrl}/openidm/managed/${realm}_application/${managedApp._id}`,
        SCOPES,
        { method: 'DELETE' }
      );
      deleted.push(`IDM managed application (${managedApp._id})`);

      // Step 4: Delete the AM OAuth2Client if the app had an oidcId
      if (oidcId) {
        const amOidcUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(oidcId)}`);
        await makeAuthenticatedRequest(amOidcUrl, SCOPES, {
          method: 'DELETE',
          headers: AM_API_HEADERS
        });
        deleted.push(`AM OAuth2Client (${oidcId})`);
      }

      // Step 5: Delete the SAML entity if samlEntityId + samlLocation supplied
      if (samlEntityId && samlLocation) {
        const base64EntityId = Buffer.from(samlEntityId, 'utf-8').toString('base64');
        const samlUrl = buildAMRealmUrl(
          realm,
          `realm-config/saml2/${samlLocation}/${encodeURIComponent(base64EntityId)}`
        );
        const { response: samlResponse } = await makeAuthenticatedRequest(samlUrl, SCOPES, {
          method: 'DELETE',
          headers: SAML_API_HEADERS
        });
        deleted.push(`AM SAML entity (${samlEntityId})`);

        return createToolResponse(formatSuccess({ deleted }, samlResponse));
      }

      // If no SAML deletion, return success with what was deleted
      // Use a minimal response object since DELETE returns 204
      return createToolResponse(formatSuccess({ deleted }, new Response(null, { status: 204 })));
    } catch (error: any) {
      return createToolResponse(`Failed to delete application configuration: ${error.message}`);
    }
  }
};
