import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess, MonitoringLogsApiResponse } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idc:monitoring:*', 'fr:idm:*'];

export const readAuditLogsTool = {
  name: 'readAuditLogs',
  title: 'Read Audit Logs',
  description:
    'Read audit logs from PingOne AIC for workflow observability. Supports filtering by user ID, event types, and time window. Optionally enriches results with user context from IDM when a userId and realm are provided.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    logSources: z.array(z.string()).min(1).describe('Log source names (e.g., ["am-core", "idm-core"])'),
    userId: z.string().optional().describe('Filter by user ID'),
    realm: z
      .enum(REALMS)
      .optional()
      .describe('Realm for user context enrichment (required if userId supplied for enrichment)'),
    timeWindow: z
      .object({ beginTime: z.string(), endTime: z.string() })
      .optional()
      .describe('Time window to restrict log results'),
    eventTypes: z.array(z.string()).optional().describe('Event type names to filter on'),
    pageSize: z.number().int().positive().optional().describe('Maximum number of log entries to return'),
    pagedResultsCookie: z
      .string()
      .optional()
      .describe('Opaque pagination cookie from a previous response to retrieve the next page')
  },
  async toolFunction({
    logSources,
    userId,
    realm,
    timeWindow,
    eventTypes,
    pageSize,
    pagedResultsCookie
  }: {
    logSources: string[];
    userId?: string;
    realm?: string;
    timeWindow?: { beginTime: string; endTime: string };
    eventTypes?: string[];
    pageSize?: number;
    pagedResultsCookie?: string;
  }) {
    // Build _queryFilter from inputs
    const filterParts: string[] = [];

    if (userId) {
      filterParts.push(`/payload/principal eq "${userId}"`);
    }

    if (eventTypes && eventTypes.length > 0) {
      const eventConditions = eventTypes.map((e) => `payload/eventName eq "${e}"`).join(' or ');
      filterParts.push(`(${eventConditions})`);
    }

    const queryFilter = filterParts.length > 0 ? filterParts.join(' and ') : 'true';

    // Build query URL for monitoring/logs/tail
    const url = new URL(`https://${aicBaseUrl}/monitoring/logs/tail`);
    url.searchParams.append('source', logSources.join(','));
    url.searchParams.append('_queryFilter', queryFilter);

    if (pageSize !== undefined) {
      url.searchParams.append('_pageSize', pageSize.toString());
    }

    if (timeWindow?.beginTime) {
      url.searchParams.append('beginTime', timeWindow.beginTime);
    }

    if (timeWindow?.endTime) {
      url.searchParams.append('endTime', timeWindow.endTime);
    }

    if (pagedResultsCookie) {
      url.searchParams.append('pagedResultsCookie', pagedResultsCookie);
    }

    let logsData: MonitoringLogsApiResponse;
    let logsResponse: Response;

    try {
      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES);
      logsData = data as MonitoringLogsApiResponse;
      logsResponse = response;
    } catch (error: any) {
      return createToolResponse(`Failed to read audit logs: ${error.message}`);
    }

    // Optionally enrich with user context from IDM
    let userContext: unknown | undefined;

    if (userId && realm) {
      try {
        const userUrl = `https://${aicBaseUrl}/openidm/managed/${realm}_user/${userId}`;
        const { data } = await makeAuthenticatedRequest(userUrl, ['fr:idm:*']);
        userContext = data;
      } catch {
        // Non-fatal — user context enrichment is best-effort
      }
    }

    const result: Record<string, any> = {
      logs: logsData
    };

    if (userContext !== undefined) {
      result.userContext = userContext;
    }

    return createToolResponse(formatSuccess(result, logsResponse));
  }
};
