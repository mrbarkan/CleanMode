const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      '[notarize] Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, ' +
      'or APPLE_TEAM_ID not set in environment.'
    );
    return;
  }

  console.log(`[notarize] Submitting ${appPath} for notarization (team ${teamId})…`);
  await notarize({
    tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('[notarize] Done.');
};
