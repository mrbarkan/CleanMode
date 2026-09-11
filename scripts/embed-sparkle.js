// afterPack hook: copy Sparkle.framework into Contents/Frameworks so electron-builder
// signs it along with the app. Run directly (`node scripts/embed-sparkle.js`) to just
// fetch vendor/Sparkle — its bin/ has generate_keys, sign_update and generate_appcast.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ponytail: pinned by path — delete vendor/Sparkle when bumping VERSION.
const VERSION = '2.9.6';
const SHA256 = '52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192';
const VENDOR = path.join(__dirname, '..', 'vendor', 'Sparkle');

function fetchSparkle() {
  if (fs.existsSync(path.join(VENDOR, 'Sparkle.framework'))) return;
  fs.mkdirSync(VENDOR, { recursive: true });
  const tarball = path.join(VENDOR, `Sparkle-${VERSION}.tar.xz`);
  const url = `https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz`;
  console.log(`[sparkle] Downloading ${url}…`);
  execFileSync('curl', ['-fsSL', '-o', tarball, url], { stdio: 'inherit' });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
  if (sha !== SHA256) {
    fs.rmSync(tarball);
    throw new Error(`[sparkle] Checksum mismatch for Sparkle ${VERSION}: got ${sha}`);
  }
  execFileSync('tar', ['-xf', tarball, '-C', VENDOR], { stdio: 'inherit' });
}

exports.default = async function embedSparkle(context) {
  if (context.electronPlatformName !== 'darwin') return;
  fetchSparkle();
  const appName = context.packager.appInfo.productFilename;
  const dest = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Frameworks', 'Sparkle.framework');
  fs.rmSync(dest, { recursive: true, force: true });
  // ditto keeps the framework's Versions/Current symlinks; a dereferencing copy breaks codesign.
  execFileSync('ditto', [path.join(VENDOR, 'Sparkle.framework'), dest], { stdio: 'inherit' });
  console.log(`[sparkle] Embedded Sparkle ${VERSION}`);
};

if (require.main === module) fetchSparkle();
