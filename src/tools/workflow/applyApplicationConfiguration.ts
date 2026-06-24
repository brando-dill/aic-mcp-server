import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

const SAML_API_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
};

function deepMergeConfig(current: Record<string, any>, updates: Record<string, any>): Record<string, any> {
  const merged = structuredClone(current);
  for (const [key, value] of Object.entries(updates)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export const applyApplicationConfigurationTool = {
  name: 'applyApplicationConfiguration',
  title: 'Apply Application Configuration',
  description:
    'Apply an OIDC or SAML application configuration, creating or updating as needed. ' +
    'For OIDC: queries IDM for an existing application by name, then creates (AM OAuth2Client + IDM app) or updates (merges config fields). ' +
    'For SAML: queries AM for an existing entity by ID, then creates (hosted POST or remote import) or updates (merges entity config).',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS),
    applicationName: z.string().describe('Application name'),
    clientType: z.enum(['oidc', 'saml']),
    oauth2Client: z.record(z.any()).optional().describe('AM OAuth2Client config fields (for OIDC)'),
    samlEntityId: z.string().optional().describe('SAML entity ID (required for SAML path)'),
    samlLocation: z.enum(['hosted', 'remote']).optional().describe('SAML entity location'),
    samlEntityConfig: z.record(z.any()).optional().describe('SAML entity config fields'),
    owners: z.array(z.string()).optional().describe('IDM app owner IDs (for OIDC update path)')
  },
  async toolFunction({
    realm,
    applicationName,
    clientType,
    oauth2Client,
    samlEntityId,
    samlLocation,
    samlEntityConfig,
    owners
  }: {
    realm: (typeof REALMS)[number];
    applicationName: string;
    clientType: 'oidc' | 'saml';
    oauth2Client?: Record<string, any>;
    samlEntityId?: string;
    samlLocation?: 'hosted' | 'remote';
    samlEntityConfig?: Record<string, any>;
    owners?: string[];
  }) {
    try {
      if (clientType === 'oidc') {
        return await applyOidcConfiguration(realm, applicationName, oauth2Client, owners);
      } else {
        return await applySamlConfiguration(realm, applicationName, samlEntityId, samlLocation, samlEntityConfig);
      }
    } catch (error: any) {
      return createToolResponse(`Failed to apply application configuration: ${error.message}`);
    }
  }
};

async function applyOidcConfiguration(
  realm: string,
  applicationName: string,
  oauth2Client?: Record<string, any>,
  owners?: string[]
): Promise<ReturnType<typeof createToolResponse>> {
  // Step 1: Query IDM for existing application by name
  const idmQueryUrl =
    `https://${aicBaseUrl}/openidm/managed/${realm}_application` +
    `?_queryFilter=${encodeURIComponent(`name eq "${applicationName}"`)}&_fields=_id,ssoEntities`;

  const { data: queryData } = await makeAuthenticatedRequest(idmQueryUrl, SCOPES, {
    method: 'GET'
  });

  const idmResults = (queryData as { result: Array<{ _id: string; ssoEntities?: { oidcId?: string } }> }).result;
  const existingApp = idmResults?.length ? idmResults[0] : null;

  if (!existingApp) {
    // Create path: PUT AM OAuth2Client, POST IDM app
    const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(applicationName)}`);
    await makeAuthenticatedRequest(amUrl, SCOPES, {
      method: 'PUT',
      headers: AM_OAUTH2_CLIENT_HEADERS,
      body: JSON.stringify(oauth2Client || {})
    });

    const idmPayload: Record<string, any> = {
      name: applicationName,
      ssoEntities: { oidcId: applicationName },
      templateName: 'custom',
      templateVersion: '1.0'
    };
    if (owners?.length) {
      idmPayload.owners = owners.map((id) => ({ _ref: `managed/${realm}_user/${id}` }));
    }

    await makeAuthenticatedRequest(`https://${aicBaseUrl}/openidm/managed/${realm}_application`, SCOPES, {
      method: 'POST',
      body: JSON.stringify(idmPayload)
    });

    return createToolResponse(
      JSON.stringify(
        {
          applicationName,
          clientType: 'oidc',
          realm,
          created: true,
          oidcClientId: applicationName
        },
        null,
        2
      )
    );
  } else {
    // Update path: GET AM OAuth2Client, merge, PUT; if owners supplied, PATCH IDM app
    const clientId = existingApp.ssoEntities?.oidcId || applicationName;
    const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(clientId)}`);

    if (oauth2Client) {
      const { data: currentConfig } = await makeAuthenticatedRequest(amUrl, SCOPES, {
        method: 'GET',
        headers: AM_OAUTH2_CLIENT_HEADERS
      });

      const currentObj = currentConfig as Record<string, any>;
      delete currentObj._rev;
      delete currentObj._id;
      delete currentObj._type;

      const mergedConfig = deepMergeConfig(currentObj, oauth2Client);

      await makeAuthenticatedRequest(amUrl, SCOPES, {
        method: 'PUT',
        headers: AM_OAUTH2_CLIENT_HEADERS,
        body: JSON.stringify(mergedConfig)
      });
    }

    if (owners?.length) {
      const patchOperations = [
        {
          operation: 'replace',
          field: '/owners',
          value: owners.map((id) => ({ _ref: `managed/${realm}_user/${id}` }))
        }
      ];
      await makeAuthenticatedRequest(
        `https://${aicBaseUrl}/openidm/managed/${realm}_application/${existingApp._id}`,
        SCOPES,
        {
          method: 'PATCH',
          body: JSON.stringify(patchOperations)
        }
      );
    }

    return createToolResponse(
      JSON.stringify(
        {
          applicationName,
          clientType: 'oidc',
          realm,
          created: false,
          oidcClientId: clientId
        },
        null,
        2
      )
    );
  }
}

async function applySamlConfiguration(
  realm: string,
  applicationName: string,
  samlEntityId?: string,
  samlLocation?: string,
  samlEntityConfig?: Record<string, any>
): Promise<ReturnType<typeof createToolResponse>> {
  if (!samlEntityId) {
    return createToolResponse('samlEntityId is required for SAML application configuration.');
  }

  const location = samlLocation || 'hosted';
  const base64EntityId = Buffer.from(samlEntityId).toString('base64');
  const entityUrl = buildAMRealmUrl(realm, `realm-config/saml2/${location}/${base64EntityId}`);

  let existingEntity: Record<string, any> | null = null;

  try {
    const { data } = await makeAuthenticatedRequest(entityUrl, SCOPES, {
      method: 'GET',
      headers: SAML_API_HEADERS
    });
    existingEntity = data as Record<string, any>;
  } catch (error: any) {
    // 404 means not found → create path
    if (!error.message?.includes('404')) {
      return createToolResponse(`Failed to check SAML entity: ${error.message}`);
    }
  }

  if (!existingEntity) {
    // Create path
    if (location === 'hosted') {
      const createUrl = buildAMRealmUrl(realm, 'realm-config/saml2/hosted/?_action=create');
      await makeAuthenticatedRequest(createUrl, SCOPES, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify(samlEntityConfig || {})
      });
    } else {
      const importUrl = buildAMRealmUrl(realm, 'realm-config/saml2/remote/?_action=importEntity');
      await makeAuthenticatedRequest(importUrl, SCOPES, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify(samlEntityConfig || {})
      });
    }

    return createToolResponse(
      JSON.stringify(
        {
          applicationName,
          clientType: 'saml',
          realm,
          created: true,
          samlEntityId
        },
        null,
        2
      )
    );
  } else {
    // Update path: strip _rev, merge, PUT back
    const entityToUpdate = { ...existingEntity, ...(samlEntityConfig || {}) };
    delete entityToUpdate._rev;

    await makeAuthenticatedRequest(entityUrl, SCOPES, {
      method: 'PUT',
      headers: SAML_API_HEADERS,
      body: JSON.stringify(entityToUpdate)
    });

    return createToolResponse(
      JSON.stringify(
        {
          applicationName,
          clientType: 'saml',
          realm,
          created: false,
          samlEntityId
        },
        null,
        2
      )
    );
  }
}
