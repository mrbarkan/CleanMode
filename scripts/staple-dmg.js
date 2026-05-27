// afterAllArtifactBuild hook: notarize + staple each .dmg so the disk image
// itself verifies offline. The .app inside is already notarized + stapled by
// scripts/notarize.js (afterSign); this covers the DMG wrapper.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function stapleDmg(buildResult) {
  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !password || !teamId) {
    console.warn(
      '[staple-dmg] Skipping DMG notarization: APPLE_ID, ' +
      'APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not set.'
    );
    return [];
  }

  // electron-builder doesn't code-sign the DMG container itself. An unsigned DMG
  // fails `spctl -a -t open` ("no usable signature") even when notarized, so we
  // sign → notarize → staple, in that order (notarization requires a signature).
  const identity = process.env.CSC_NAME;
  if (!identity) {
    console.warn('[staple-dmg] CSC_NAME not set — DMG will be notarized but not signed.');
  }

  const dmgs = buildResult.artifactPaths.filter((p) => p.endsWith('.dmg'));
  for (const dmg of dmgs) {
    const name = path.basename(dmg);
    if (identity) {
      console.log(`[staple-dmg] Signing ${name}…`);
      execFileSync('codesign', ['--force', '--sign', identity, '--timestamp', dmg], { stdio: 'inherit' });
    }
    console.log(`[staple-dmg] Submitting ${name} for notarization…`);
    execFileSync(
      'xcrun',
      ['notarytool', 'submit', dmg,
        '--apple-id', appleId, '--password', password, '--team-id', teamId,
        '--wait'],
      { stdio: 'inherit' }
    );
    console.log(`[staple-dmg] Stapling ${name}…`);
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
  }

  return [];
};
