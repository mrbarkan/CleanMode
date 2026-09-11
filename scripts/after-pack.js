// afterPack hook: embed Sparkle, then compile build/AppIcon.icon (Icon Composer format) with
// actool into Assets.car + AppIcon.icns so macOS 26 shows the Liquid Glass icon
// (CFBundleIconName, set in package.json extendInfo). Older macOS falls back to icon.icns.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const embedSparkle = require('./embed-sparkle').default;

exports.default = async function afterPack(context) {
  await embedSparkle(context);
  if (context.electronPlatformName !== 'darwin') return;
  const res = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanmode-icon-'));
  execFileSync('xcrun', ['actool', path.join(__dirname, '..', 'build', 'AppIcon.icon'),
    '--compile', out, '--platform', 'macosx', '--minimum-deployment-target', '13.0',
    '--app-icon', 'AppIcon', '--include-all-app-icons',
    '--output-partial-info-plist', path.join(out, 'partial.plist')], { stdio: 'ignore' });
  for (const f of ['Assets.car', 'AppIcon.icns']) fs.copyFileSync(path.join(out, f), path.join(res, f));
  console.log('[icon] Compiled AppIcon.icon → Assets.car');
};
