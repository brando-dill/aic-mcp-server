import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const SCOPES = ['fr:am:*'];

// SAML 2.0 entity API version header (protocol=2.1,resource=1.0)
const AM_SAML_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

const SAML_LOCATIONS = ['hosted', 'remote'] as const;

export const updateSamlEntityTool = {
  name: 'updateSamlEntity',
  title: 'Update SAML 2.0 Entity',
  description:
    'Update an existing SAML 2.0 entity configuration using a read-merge-write pattern. Fetches the current entity configuration, strips _rev, merges the caller-supplied overrides on top, and PUTs the merged payload back. Fields not supplied in entityConfig are preserved from the existing configuration.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the entity (alpha or bravo)'),
    location: z.enum(SAML_LOCATIONS).describe('Whether the entity is hosted or remote'),
    entityId64: safePathSegmentSchema.describe('The base64-encoded entity ID of the SAML entity to update'),
    entityConfig: z
      .record(z.any())
      .describe('Partial or full entity configuration fields to merge into the existing entity')
  },
  async toolFunction({
    realm,
    location,
    entityId64,
    entityConfig
  }: {
    realm: (typeof REALMS)[number];
    location: (typeof SAML_LOCATIONS)[number];
    entityId64: string;
    entityConfig: Record<string, unknown>;
  }) {
    try {
      const url = buildAMRealmUrl(
        realm,
        `realm-config/saml2/${encodeURIComponent(location)}/${encodeURIComponent(entityId64)}`
      );

      // Fetch existing entity configuration
      const { data: fetchedEntity } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SAML_HEADERS
      });

      const currentEntity = fetchedEntity as Record<string, unknown>;

      // Strip _rev from fetched entity and caller-supplied config before PUT
      const { _rev: _currentRev, ...entityWithoutRev } = currentEntity;
      void _currentRev; // intentionally discarded

      const { _rev: _callerRev, ...callerConfigWithoutRev } = entityConfig;
      void _callerRev; // intentionally discarded

      // Merge caller overrides over current entity
      const mergedEntity = { ...entityWithoutRev, ...callerConfigWithoutRev };

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_SAML_HEADERS,
        body: JSON.stringify(mergedEntity)
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to update SAML entity "${entityId64}" (location: "${location}") for realm "${realm}": ${error.message}`
      );
    }
  }
};
