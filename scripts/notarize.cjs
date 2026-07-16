// @ts-check
/**
 * macOS notarization script for electron-builder.
 *
 * Called automatically by electron-builder as an afterSign hook.
 * Requires the following environment variables:
 *   APPLE_ID              – Apple Developer account email
 *   APPLE_APP_SPECIFIC_PASSWORD – App-specific password (or @keychain: ref)
 *   APPLE_TEAM_ID         – 10-char Apple Developer Team ID
 *
 * If any of these are missing the script exits silently so local
 * unsigned builds still work without errors.
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization when credentials are not available (local builds)
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('[Notarize] Skipping – APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[Notarize] Submitting ${appPath} for notarization...`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log('[Notarize] Done.');
};
