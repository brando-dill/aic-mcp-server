import { z } from 'zod';
import crypto from 'node:crypto';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*', 'fr:am:*'];

const AUTH_CONFIG_HEADERS = {
  'accept-api-version': 'protocol=1.0,resource=1.0',
  'Content-Type': 'application/json'
};

export const applySignInExperienceTool = {
  name: 'applySignInExperience',
  title: 'Apply Sign-In Experience',
  description:
    'Apply theme and sign-in experience changes for a realm. Reads the current themerealm config, finds or creates the target theme, merges supplied properties, optionally sets it as default, and optionally updates the default authentication journey.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to configure (alpha or bravo)'),
    themeProperties: z
      .record(z.any())
      .describe(
        'Theme properties to apply (e.g., primaryColor, logo, backgroundColor). Merged into existing theme or used to create new one.'
      ),
    themeName: z
      .string()
      .optional()
      .describe('Name of the theme to find/create. If omitted, a new theme is created with a generated name.'),
    setAsDefault: z.boolean().optional().describe('If true, sets this theme as the default for the realm'),
    defaultJourneyName: z
      .string()
      .optional()
      .describe('If supplied, updates the default authentication journey for the realm')
  },
  async toolFunction({
    realm,
    themeProperties,
    themeName,
    setAsDefault,
    defaultJourneyName
  }: {
    realm: string;
    themeProperties: Record<string, any>;
    themeName?: string;
    setAsDefault?: boolean;
    defaultJourneyName?: string;
  }) {
    const themerealUrl = `https://${aicBaseUrl}/openidm/config/ui/themerealm`;

    // Step 1: GET themerealm config
    let themeConfig: Record<string, any>;
    try {
      const { data } = await makeAuthenticatedRequest(themerealUrl, SCOPES, {
        method: 'GET'
      });
      themeConfig = data as Record<string, any>;
    } catch (error: any) {
      return createToolResponse(`Failed to fetch themerealm config: ${error.message}`);
    }

    // Step 2: Ensure realm array exists
    if (!themeConfig.realm) {
      themeConfig.realm = {};
    }
    if (!Array.isArray(themeConfig.realm[realm])) {
      themeConfig.realm[realm] = [];
    }

    const themes: Record<string, any>[] = themeConfig.realm[realm];

    // Step 3: Find or create theme
    let targetIndex = -1;
    if (themeName) {
      targetIndex = themes.findIndex((t) => t.name === themeName || t._id === themeName);
    }

    let created = false;
    let themeId: string;

    if (targetIndex === -1) {
      // Create new theme
      created = true;
      themeId = crypto.randomUUID();
      const newTheme: Record<string, any> = {
        _id: themeId,
        name: themeName || 'Custom Theme',
        ...themeProperties
      };
      themes.push(newTheme);
      targetIndex = themes.length - 1;
    } else {
      // Merge into existing theme
      const existing = themes[targetIndex];
      themeId = existing._id;
      themes[targetIndex] = { ...existing, ...themeProperties };
    }

    // Step 4: Optionally set as default
    if (setAsDefault) {
      for (let i = 0; i < themes.length; i++) {
        themes[i] = { ...themes[i], isDefault: i === targetIndex };
      }
    }

    // Step 5: Strip _rev from top-level config before PUT
    const configToSave = { ...themeConfig };
    delete configToSave._rev;

    // Step 6: PUT the updated config
    let putResponse: Response;
    try {
      const { response } = await makeAuthenticatedRequest(themerealUrl, SCOPES, {
        method: 'PUT',
        body: JSON.stringify(configToSave)
      });
      putResponse = response;
    } catch (error: any) {
      return createToolResponse(`Failed to save themerealm config: ${error.message}`);
    }

    // Step 7: Optionally update default journey
    let defaultJourneyUpdated = false;
    let journeyError: string | undefined;

    if (defaultJourneyName) {
      try {
        const authConfigUrl = buildAMRealmUrl(realm, 'realm-config/authentication');

        // GET current auth config
        const { data: currentAuthConfig } = await makeAuthenticatedRequest(authConfigUrl, SCOPES, {
          method: 'GET',
          headers: AUTH_CONFIG_HEADERS
        });

        const authData = currentAuthConfig as Record<string, any>;

        // PUT with orgConfig updated, preserving other fields
        await makeAuthenticatedRequest(authConfigUrl, SCOPES, {
          method: 'PUT',
          headers: AUTH_CONFIG_HEADERS,
          body: JSON.stringify({ ...authData, orgConfig: defaultJourneyName })
        });

        defaultJourneyUpdated = true;
      } catch (error: any) {
        journeyError = error.message;
      }
    }

    const result: Record<string, any> = {
      themeId,
      themeName: themeName || 'Custom Theme',
      created,
      setAsDefault: setAsDefault === true,
      defaultJourneyUpdated
    };

    if (journeyError) {
      result.defaultJourneyError = journeyError;
    }

    return createToolResponse(formatSuccess(result, putResponse!));
  }
};
