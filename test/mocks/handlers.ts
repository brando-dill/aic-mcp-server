import { http, HttpResponse } from 'msw';
import { mockManagedObjects, mockManagedObjectConfig, mockThemes, mockVariables, mockLogSources } from './mockData.js';

/**
 * Helper to validate Authorization header is present and valid
 * Returns error response if invalid, null if valid
 *
 * Reusable in test-specific MSW handlers via server.use()
 */
export function validateAuthHeader(request: Request): HttpResponse<string> | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new HttpResponse(JSON.stringify({ error: 'unauthorized', message: 'Missing Authorization header' }), {
      status: 401
    });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return new HttpResponse(JSON.stringify({ error: 'unauthorized', message: 'Invalid Authorization header format' }), {
      status: 401
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (!token || token !== 'mock-scoped-token') {
    return new HttpResponse(JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token' }), {
      status: 401
    });
  }

  return null; // Valid auth
}

export const handlers = [
  // OAuth - PKCE authorization code exchange
  http.post('https://*/am/oauth2/access_token', async ({ request }) => {
    const body = await request.text();
    const params = new URLSearchParams(body);

    if (params.get('grant_type') === 'authorization_code') {
      return HttpResponse.json({
        access_token: 'mock-primary-token',
        expires_in: 3600,
        token_type: 'Bearer'
      });
    }

    // RFC 8693 token exchange
    if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
      const subjectToken = params.get('subject_token');
      const requestedScopes = params.get('scope');
      const clientId = params.get('client_id');

      // Validate parameters
      if (!subjectToken || subjectToken !== 'mock-token') {
        return new HttpResponse(JSON.stringify({ error: 'invalid_token' }), { status: 401 });
      }

      if (clientId !== 'AICMCPExchangeClient') {
        return new HttpResponse(JSON.stringify({ error: 'invalid_client' }), { status: 400 });
      }

      if (!requestedScopes) {
        return new HttpResponse(JSON.stringify({ error: 'invalid_scope' }), { status: 400 });
      }

      return HttpResponse.json({
        access_token: 'mock-scoped-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: requestedScopes // Echo back the requested scopes
      });
    }

    return new HttpResponse(null, { status: 400 });
  }),

  // Query managed objects (generic for all object types)
  http.get('https://*/openidm/managed/:objectType', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const pageSize = parseInt(url.searchParams.get('_pageSize') || '50');

    return HttpResponse.json({
      result: mockManagedObjects.slice(0, pageSize),
      resultCount: mockManagedObjects.length,
      totalPagedResults: mockManagedObjects.length,
      pagedResultsCookie: null
    });
  }),

  // Get managed object schema
  http.get('https://*/openidm/config/managed', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json(mockManagedObjectConfig);
  }),

  // Patch managed object config (definition-level operations)
  http.patch('https://*/openidm/config/managed', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'managed',
      _rev: '2',
      objects: mockManagedObjectConfig.objects
    });
  }),

  // Create managed object
  http.post('https://*/openidm/managed/:objectType', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: 'new-id', _rev: '1', ...body });
  }),

  // Get single managed object
  http.get('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockManagedObjects[0], _id: params.objectId });
  }),

  // Patch managed object
  http.patch('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.objectId, _rev: '2' });
  }),

  // Delete managed object
  http.delete('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.objectId });
  }),

  // Schema service - PUT relationship property
  http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json(body);
  }),

  // Schema service - DELETE relationship property
  http.delete('https://*/openidm/schema/managed/:objectType/properties/:propertyName', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204, headers: { 'content-length': '0' } });
  }),

  // Themes - getThemes endpoint (query all themes)
  http.get('https://*/openidm/ui/theme/', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: mockThemes,
      resultCount: mockThemes.length
    });
  }),

  // Themes - config endpoint (used by other theme operations)
  http.get('https://*/openidm/config/ui/theming', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ themes: mockThemes });
  }),

  http.get('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.put('https://*/openidm/config/ui/theming', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: 'theme-new', ...body });
  }),

  http.patch('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.delete('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.themeId });
  }),

  // ESVs
  http.get('https://*/environment/variables', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: mockVariables,
      resultCount: mockVariables.length,
      totalPagedResults: mockVariables.length
    });
  }),

  http.get('https://*/environment/variables/:variableId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockVariables[0], _id: params.variableId });
  }),

  http.put('https://*/environment/variables/:variableId', async ({ request, params }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.variableId, ...body });
  }),

  http.delete('https://*/environment/variables/:variableId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.variableId });
  }),

  // Secret versions - list all versions for a secret
  http.get('https://*/environment/secrets/:secretId/versions', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [
        { version: '1', status: 'DISABLED', createDate: '2025-01-10T08:00:00Z' },
        { version: '2', status: 'ENABLED', createDate: '2025-01-11T10:00:00Z' }
      ],
      resultCount: 2
    });
  }),

  // Secret versions - create new version (_action=create)
  http.post('https://*/environment/secrets/:secretId/versions', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      version: '3',
      status: 'DISABLED',
      createDate: '2025-06-22T10:00:00Z'
    });
  }),

  // Secret versions - change status for a specific version (_action=changestatus)
  http.post('https://*/environment/secrets/:secretId/versions/:version', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      version: params.version,
      status: 'ENABLED',
      createDate: '2025-01-11T10:00:00Z'
    });
  }),

  // Secrets
  http.get('https://*/environment/secrets/:secretId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.secretId,
      description: 'Mock secret',
      encoding: 'generic',
      useInPlaceholders: false,
      lastChangeDate: '2025-01-11T10:00:00Z',
      lastChangedBy: 'user-123',
      loaded: true,
      loadedVersion: '1',
      activeVersion: '1'
    });
  }),

  http.put('https://*/environment/secrets/:secretId', async ({ request, params }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.secretId, ...body });
  }),

  http.delete('https://*/environment/secrets/:secretId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.secretId });
  }),

  // Logs
  http.get('https://*/monitoring/logs/sources', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json(mockLogSources);
  }),

  http.post('https://*/monitoring/logs', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [],
      resultCount: 0,
      totalPagedResults: 0
    });
  }),

  // AM - Journey list
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [],
      resultCount: 0
    });
  }),

  // AM - Single journey
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'Login',
      nodes: {}
    });
  }),

  // AM - Node schema (POST with _action=schema)
  http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      type: 'object',
      properties: {}
    });
  }),

  // AM - Node config (GET)
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'node-123',
      nodeType: 'TestNode'
    });
  }),

  // AM - Scripts
  http.get('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'script-123',
      name: 'TestScript',
      script: '',
      language: 'JAVASCRIPT'
    });
  }),

  // AM - Create script
  http.post('https://*/am/json/*/scripts', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'create') {
      return HttpResponse.json({ _id: 'new-script-id', name: 'NewScript' });
    }
    return HttpResponse.json({ error: 'Invalid action' }, { status: 400 });
  }),

  // AM - Update script
  http.put('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'script-123', name: 'UpdatedScript' });
  }),

  // AM - Delete script
  http.delete('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Script contexts
  http.get('https://*/am/json/*/contexts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      bindings: [{ name: 'outcome', type: 'java.lang.String' }],
      allowedImports: ['java.lang.Math']
    });
  }),

  // AM - Save journey (PUT)
  http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'TestJourney' });
  }),

  // AM - Delete journey
  http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Update node (PUT)
  http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'node-123' });
  }),

  // AM - Delete node
  http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Auth config (GET)
  http.get('https://*/am/json/*/realm-config/authentication', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ core: { orgConfig: 'Login', adminAuthModule: 'Login' } });
  }),

  // AM - Auth config (PUT)
  http.put('https://*/am/json/*/realm-config/authentication', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ core: { orgConfig: 'NewDefault', adminAuthModule: 'Login' } });
  }),

  // AM - OAuth2Client agent (GET single, PUT create/update, DELETE)
  http.get('https://*/am/json/*/realm-config/agents/OAuth2Client/:clientId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.clientId, coreOAuth2ClientConfig: {} });
  }),

  http.put('https://*/am/json/*/realm-config/agents/OAuth2Client/:clientId', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.clientId });
  }),

  http.delete('https://*/am/json/*/realm-config/agents/OAuth2Client/:clientId', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - OAuth2Client schema/template (POST with _action)
  http.post('https://*/am/json/*/realm-config/agents/OAuth2Client', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ type: 'object', properties: {} });
  }),

  // AM - CORS policy list (GET with _queryFilter=true)
  http.get('https://*/am/json/global-config/services/CorsService/configuration', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [],
      resultCount: 0
    });
  }),

  // AM - CORS policy create (POST with _action=create)
  http.post('https://*/am/json/global-config/services/CorsService/configuration', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'new-cors-policy-id' });
  }),

  // AM - CORS policy get (GET by ID)
  http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.policyId,
      acceptedOrigins: ['https://example.org'],
      acceptedMethods: ['GET', 'POST'],
      acceptedHeaders: ['Content-Type'],
      exposedHeaders: [],
      maxAge: 600,
      allowCredentials: true,
      enabled: true
    });
  }),

  // AM - CORS policy update (PUT by ID)
  http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.policyId });
  }),

  // AM - CORS policy delete (DELETE by ID)
  http.delete('https://*/am/json/global-config/services/CorsService/configuration/:policyId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.policyId });
  }),

  // AM - Global service config - GET (generic, for non-CORS global services like OAuth2Provider)
  // Placed after CorsService-specific handlers so CorsService paths are matched first
  http.get('https://*/am/json/global-config/services/:serviceName/configuration', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.serviceName,
      _rev: 'rev-global-service-123',
      _type: { _id: params.serviceName, name: String(params.serviceName) },
      enabled: true
    });
  }),

  // AM - Global service config - PUT (generic, for non-CORS global services)
  // Placed after CorsService-specific handlers so CorsService paths are matched first
  http.put('https://*/am/json/global-config/services/:serviceName/configuration', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.serviceName, ...body });
  }),

  // AM - Services - list all configured services (POST _action=nextdescendents)
  http.post('https://*/am/json/*/services', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'nextdescendents') {
      return HttpResponse.json({
        result: [
          {
            _id: 'scripting',
            _type: { _id: 'scripting', name: 'Scripting' }
          },
          {
            _id: 'SocialIdentityProviders',
            _type: { _id: 'SocialIdentityProviders', name: 'Social Identity Provider' }
          }
        ],
        resultCount: 2
      });
    }

    return HttpResponse.json({ result: [], resultCount: 0 });
  }),

  // AM - Services - get service type schemas (GET _action=getAllTypes)
  http.get('https://*/am/json/*/services', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'getAllTypes') {
      return HttpResponse.json({
        result: [
          { _id: 'scripting', name: 'Scripting', description: 'Scripting service' },
          { _id: 'SocialIdentityProviders', name: 'Social Identity Provider', description: 'Social IdP service' },
          { _id: 'validation', name: 'Validation', description: 'Validation service' }
        ],
        resultCount: 3
      });
    }

    return HttpResponse.json({ result: [], resultCount: 0 });
  }),

  // AM - Services - sub-config: list all instances (GET with _queryFilter)
  http.get('https://*/am/json/*/services/:serviceType/:subType', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [
        {
          _id: `${String(params.subType)}-instance-1`,
          _type: { _id: params.subType, name: String(params.subType) }
        }
      ],
      resultCount: 1,
      pagedResultsCookie: null,
      totalPagedResultsPolicy: 'NONE',
      totalPagedResults: -1,
      remainingPagedResults: -1
    });
  }),

  // AM - Services - sub-config: get single instance (GET by serviceType/subType/id)
  http.get('https://*/am/json/*/services/:serviceType/:subType/:id', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.id,
      _rev: 'rev-subconfig-123',
      _type: { _id: params.subType, name: String(params.subType) }
    });
  }),

  // AM - Services - sub-config: upsert instance (PUT by serviceType/subType/id)
  http.put('https://*/am/json/*/services/:serviceType/:subType/:id', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.id, ...body });
  }),

  // AM - Services - sub-config: delete instance (DELETE by serviceType/subType/id)
  http.delete('https://*/am/json/*/services/:serviceType/:subType/:id', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, {
      status: 204,
      headers: { 'x-forgerock-transactionid': 'mock-tx-id-subconfig-delete' }
    });
  }),

  // AM - Services - get single service config (GET by serviceType)
  http.get('https://*/am/json/*/services/:serviceType', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.serviceType,
      _rev: 'rev-service-123',
      _type: { _id: params.serviceType, name: String(params.serviceType) }
    });
  }),

  // AM - Services - update/create service config (PUT by serviceType)
  http.put('https://*/am/json/*/services/:serviceType', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.serviceType, ...body });
  }),

  // AM - Services - delete service (DELETE by serviceType)
  http.delete('https://*/am/json/*/services/:serviceType', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, {
      status: 204,
      headers: { 'x-forgerock-transactionid': 'mock-tx-id-service-delete' }
    });
  }),

  // AM - SocialIdentityProviders - list all types (GET with _action=getAllTypes)
  http.get('https://*/am/json/*/realm-config/services/SocialIdentityProviders', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'getAllTypes') {
      return HttpResponse.json({
        result: [
          { _id: 'google', name: 'Google', description: 'Google Identity Provider' },
          { _id: 'facebook', name: 'Facebook', description: 'Facebook Identity Provider' },
          { _id: 'oidcConfig', name: 'OpenID Connect', description: 'Generic OIDC Provider' }
        ],
        resultCount: 3
      });
    }

    return HttpResponse.json({ result: [], resultCount: 0 });
  }),

  // AM - SocialIdentityProviders - list all provider instances (POST with _action=nextdescendents)
  http.post('https://*/am/json/*/realm-config/services/SocialIdentityProviders', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'nextdescendents') {
      return HttpResponse.json({
        result: [
          {
            _id: 'google-provider',
            _type: { _id: 'google', name: 'Google' },
            clientId: 'mock-client-id',
            redirectURI: 'https://example.com/callback'
          }
        ],
        resultCount: 1
      });
    }

    return HttpResponse.json({ result: [], resultCount: 0 });
  }),

  // AM - SocialIdentityProviders - get/update/delete single provider by type and id
  http.get(
    'https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId',
    ({ params, request }) => {
      const authError = validateAuthHeader(request);
      if (authError) return authError;

      return HttpResponse.json({
        _id: params.providerId,
        _type: { _id: params.providerType, name: String(params.providerType) },
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
        redirectURI: 'https://example.com/callback',
        scopes: ['openid', 'profile', 'email']
      });
    }
  ),

  http.put(
    'https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId',
    async ({ params, request }) => {
      const authError = validateAuthHeader(request);
      if (authError) return authError;

      const body = (await request.json()) as Record<string, any>;
      return HttpResponse.json({ _id: params.providerId, ...body });
    }
  ),

  http.delete(
    'https://*/am/json/*/realm-config/services/SocialIdentityProviders/:providerType/:providerId',
    ({ request }) => {
      const authError = validateAuthHeader(request);
      if (authError) return authError;

      return new HttpResponse(null, {
        status: 204,
        headers: { 'x-forgerock-transactionid': 'mock-tx-id-delete' }
      });
    }
  ),

  // AM - SAML 2.0 - get single entity (GET by location and entityId64)
  http.get('https://*/am/json/*/realm-config/saml2/:location/:entityId64', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: params.entityId64,
      _rev: 'rev-abc123',
      entityId: `https://example.com/saml/${params.entityId64}`,
      location: params.location,
      roles: ['SPSSODescriptor'],
      assertionConsumerService: [
        {
          index: 0,
          isDefault: true,
          binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
          location: 'https://example.com/acs'
        }
      ]
    });
  }),

  // AM - SAML 2.0 - create hosted entity (POST _action=create)
  http.post('https://*/am/json/*/realm-config/saml2/hosted/', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: body.entityId || 'new-hosted-entity', ...body }, { status: 201 });
  }),

  // AM - SAML 2.0 - create remote entity (POST _action=importEntity)
  http.post('https://*/am/json/*/realm-config/saml2/remote/', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: 'imported-remote-entity', ...body }, { status: 201 });
  }),

  // AM - SAML 2.0 - update entity (PUT by location and entityId64)
  http.put('https://*/am/json/*/realm-config/saml2/:location/:entityId64', async ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({ _id: params.entityId64, ...body });
  }),

  // AM - SAML 2.0 - delete entity (DELETE by location and entityId64)
  http.delete('https://*/am/json/*/realm-config/saml2/:location/:entityId64', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, {
      status: 204,
      headers: { 'x-forgerock-transactionid': 'mock-tx-id-saml-delete' }
    });
  })
];
