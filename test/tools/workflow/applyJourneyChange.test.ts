import { describe, it, expect } from 'vitest';
import { applyJourneyChangeTool } from '../../../src/tools/workflow/applyJourneyChange.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('applyJourneyChange', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('applyJourneyChange', applyJourneyChangeTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should GET current journey before PUT', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'Updated description'
      });

      const calls = getSpy().mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should build journey URL with encoded journeyName', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Copy of Login',
        description: 'Updated'
      });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/trees/Copy%20of%20Login');
    });

    it('should use AM_API_HEADERS (protocol=2.1,resource=1.0)', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        enabled: true
      });

      const getOptions = getSpy().mock.calls[0][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should use scope ["fr:am:*"]', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'test'
      });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should strip _rev from fetched journey before PUT', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'Updated'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2]?.body as string);
      expect(putBody._rev).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success: true and journeyName on metadata-only update', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'test'
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.journeyName).toBe('Login');
    });

    it('should include nodeIdMapping when nodes are provided', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        entryNodeId: 'username-node',
        nodes: {
          'username-node': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Collect Username',
            connections: { outcome: 'success' },
            config: {}
          }
        }
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.nodeIdMapping).toBeDefined();
      expect(parsed.nodeIdMapping['username-node']).toBeDefined();
    });

    it('should not include nodeIdMapping on metadata-only update', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        enabled: false
      });

      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);
      expect(parsed.nodeIdMapping).toBeUndefined();
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('metadata-only: merges supplied fields on top of fetched journey', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'New description',
        enabled: false
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2]?.body as string);
      expect(putBody.description).toBe('New description');
      expect(putBody.enabled).toBe(false);
    });

    it('graph replacement: runs UUID pipeline and replaces nodes in payload', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        entryNodeId: 'node1',
        nodes: {
          node1: {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Username',
            connections: { outcome: 'success' },
            config: {}
          }
        }
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2]?.body as string);
      // The entryNodeId in PUT body should be a UUID (not 'node1')
      expect(putBody.entryNodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it('combined: graph replacement with metadata overrides', async () => {
      await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'With graph',
        entryNodeId: 'node1',
        nodes: {
          node1: {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Username',
            connections: { outcome: 'success' },
            config: {}
          }
        }
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2]?.body as string);
      expect(putBody.description).toBe('With graph');
      expect(putBody.entryNodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should return error when no fields are supplied', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });

      expect(result.content[0].text).toContain('No updates provided');
    });

    it('should return error when nodes supplied without entryNodeId', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        nodes: {
          node1: {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Username',
            connections: { outcome: 'success' },
            config: {}
          }
        }
      });

      expect(result.content[0].text).toContain('entryNodeId');
    });

    it('should return error when entryNodeId supplied without nodes', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        entryNodeId: 'some-node'
      });

      expect(result.content[0].text).toContain('entryNodeId');
    });

    it('should reject path traversal in journeyName', () => {
      const schema = applyJourneyChangeTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
    });

    it('should accept valid realm values', () => {
      const schema = applyJourneyChangeTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm', () => {
      const schema = applyJourneyChangeTool.inputSchema.realm;
      expect(() => schema.parse('root')).toThrow();
    });

    it('should return error for invalid connection targets in node graph', async () => {
      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        entryNodeId: 'node1',
        nodes: {
          node1: {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Username',
            connections: { outcome: 'non-existent-node' },
            config: {}
          }
        }
      });

      expect(result.content[0].text).toContain('Invalid journey structure');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should surface GET 404 error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'NonexistentJourney',
        description: 'test'
      });

      expect(result.content[0].text).toContain('Failed to update journey');
    });

    it('should surface PUT 4xx error', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await applyJourneyChangeTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
        description: 'test'
      });

      expect(result.content[0].text).toContain('Failed to update journey');
    });
  });
});
