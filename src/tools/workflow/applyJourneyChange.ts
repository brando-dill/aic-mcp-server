import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import {
  buildAMJourneyUrl,
  AM_API_HEADERS,
  generateNodeIdMapping,
  validateConnectionTargets,
  transformJourneyIds,
  JourneyInput,
  JourneyNodeInput
} from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const applyJourneyChangeTool = {
  name: 'applyJourneyChange',
  title: 'Apply Journey Change',
  description:
    'Update an existing authentication journey. Fetches the current journey, merges metadata fields and/or replaces the node graph, and PUTs back. At least one metadata field or nodes+entryNodeId must be supplied.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey'),
    journeyName: safePathSegmentSchema.describe('Name of the journey to update'),
    description: z.string().optional().describe('Admin-facing description of the journey'),
    identityResource: z.string().optional().describe('Identity resource the journey authenticates against'),
    mustRun: z.boolean().optional().describe('Whether the journey must run to completion'),
    innerTreeOnly: z.boolean().optional().describe('Whether the journey can only be used as an inner tree'),
    uiConfig: z.record(z.any()).optional().describe('UI configuration key/value pairs'),
    enabled: z.boolean().optional().describe('Whether the journey is enabled'),
    maximumSessionTime: z.number().optional().describe('Maximum session time in minutes'),
    maximumIdleTime: z.number().optional().describe('Maximum idle time in minutes'),
    entryNodeId: z
      .string()
      .optional()
      .describe('ID of the entry node — required when providing nodes for graph replacement'),
    nodes: z
      .record(
        z.object({
          nodeType: z.string().describe('The AM node type'),
          displayName: z.string().describe('Admin-facing display name'),
          connections: z.record(z.string()).describe('Outcome ID → target node ID or alias (success/failure)'),
          config: z.record(z.any()).describe('Node-specific configuration')
        })
      )
      .optional()
      .describe(
        'Map of node IDs to node definitions. When provided, replaces the existing graph and requires entryNodeId.'
      )
  },
  async toolFunction({
    realm,
    journeyName,
    description,
    identityResource,
    mustRun,
    innerTreeOnly,
    uiConfig,
    enabled,
    maximumSessionTime,
    maximumIdleTime,
    entryNodeId,
    nodes
  }: {
    realm: string;
    journeyName: string;
    description?: string;
    identityResource?: string;
    mustRun?: boolean;
    innerTreeOnly?: boolean;
    uiConfig?: Record<string, any>;
    enabled?: boolean;
    maximumSessionTime?: number;
    maximumIdleTime?: number;
    entryNodeId?: string;
    nodes?: Record<string, JourneyNodeInput>;
  }) {
    const hasMetadata =
      description !== undefined ||
      identityResource !== undefined ||
      mustRun !== undefined ||
      innerTreeOnly !== undefined ||
      uiConfig !== undefined ||
      enabled !== undefined ||
      maximumSessionTime !== undefined ||
      maximumIdleTime !== undefined;
    const hasGraph = nodes !== undefined;

    if (!hasMetadata && !hasGraph) {
      return createToolResponse(
        'No updates provided. Specify at least one metadata field or supply nodes + entryNodeId.'
      );
    }

    if (hasGraph && entryNodeId === undefined) {
      return createToolResponse('When providing "nodes" for graph replacement, "entryNodeId" must also be provided.');
    }

    if (!hasGraph && entryNodeId !== undefined) {
      return createToolResponse('"entryNodeId" can only be updated together with a full "nodes" graph replacement.');
    }

    try {
      const url = buildAMJourneyUrl(realm, journeyName);

      // Step 1: GET current journey
      const { data: fetchedData } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_API_HEADERS
      });

      const fetchedJourney = { ...(fetchedData as Record<string, unknown>) };
      delete fetchedJourney._rev;

      // Build metadata overrides
      const metadataOverrides: Record<string, unknown> = {
        ...(description !== undefined && { description }),
        ...(identityResource !== undefined && { identityResource }),
        ...(mustRun !== undefined && { mustRun }),
        ...(innerTreeOnly !== undefined && { innerTreeOnly }),
        ...(uiConfig !== undefined && { uiConfig }),
        ...(enabled !== undefined && { enabled }),
        ...(maximumSessionTime !== undefined && { maximumSessionTime }),
        ...(maximumIdleTime !== undefined && { maximumIdleTime })
      };

      // Step 2: Build payload
      let payload: Record<string, unknown>;
      let idMapping: Record<string, string> | undefined;

      if (nodes !== undefined) {
        const journeyData: JourneyInput = { entryNodeId: entryNodeId!, nodes };

        const validation = validateConnectionTargets(journeyData);
        if (!validation.isValid) {
          return createToolResponse(`Invalid journey structure: ${validation.errors.join('; ')}`);
        }

        idMapping = generateNodeIdMapping(journeyData);
        const transformedJourney = transformJourneyIds(journeyName, journeyData, idMapping);

        payload = {
          ...fetchedJourney,
          ...transformedJourney,
          ...metadataOverrides
        };
      } else {
        payload = {
          ...fetchedJourney,
          ...metadataOverrides
        };
      }

      // Step 3: PUT merged payload
      await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_API_HEADERS,
        body: JSON.stringify(payload)
      });

      const result: Record<string, unknown> = { success: true, journeyName };
      if (idMapping !== undefined) {
        result.nodeIdMapping = idMapping;
      }

      return createToolResponse(JSON.stringify(result, null, 2));
    } catch (error: any) {
      return createToolResponse(`Failed to update journey "${journeyName}": ${error.message}`);
    }
  }
};
