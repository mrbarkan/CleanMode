# CleanMode — Build, Sign, Notarize

This doc covers producing a signed + notarized release artifact (DMG + zip, per-arch).

## One-time prerequisites

1. **Apple Developer account.** $99/yr at developer.apple.com.
2. **Developer ID Application certificate** in your login keychain.
   - In Xcode → Settings → Accounts, select your team → "Manage Certificates" → "+ → Developer ID Application".
3. **App-specific password.** Generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords. **This is not your Apple ID password.**
4. **Xcode Command Line Tools** for the native build: `xcode-select --install`.

## One-time per-machine setup

```bash
git clone <this repo>
cd cleanmode
npm install
npm run native:build-current   # builds the eventtap native module for your arch
```

## Local dev

```bash
npm run electron:dev
```

If you change `electron/native/eventtap/eventtap.mm`, rebuild the native module:

```bash
npm run native:build-current
```

(Use `npm run native:build` to rebuild for both arm64 and x64; only needed before a release build.)

## Release build

Signing env vars live in a gitignored `.env.signing` at the repo root (see
`.env.signing` — created locally, never committed):

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCD123456"
export CSC_NAME="Your Name (ABCD123456)"   # no "Developer ID Application:" prefix
```

Load them into your shell before building:

```bash
set -a && source .env.signing && set +a
```

Then build:

```bash
# 1. Build native module for both arm64 and x64
npm run native:build

# 2. Build renderer
npm run build

# 3. Package, sign, and notarize
npm run electron:build
```

The release artifacts land in `release/` (or `dist/` depending on electron-builder's default — check the output).

## Updates (Sparkle)

Sparkle 2 is embedded at package time by `scripts/embed-sparkle.js` (the `afterPack` hook). It downloads a pinned, checksum-verified Sparkle into `vendor/Sparkle/` (gitignored), then copies `Sparkle.framework` into the app so electron-builder signs it. Unpackaged dev runs have no framework, so updates are off there.

- **Feeds:** `https://github.com/mrbarkan/CleanMode/releases/latest/download/appcast-<arch>.xml`, one per arch (`FEED_URL` in `electron/main.js`). `latest` skips pre-releases, so publish updates as regular releases.
- **Signing key:** the EdDSA public key is `mac.extendInfo.SUPublicEDKey` in `package.json`. Its private key lives in your login keychain. Back it up with `vendor/Sparkle/bin/generate_keys -x sparkle-private.key` and keep that file safe: if the key is lost, existing installs can never update again.
- **Automatic checks are opt-in.** Sparkle asks on the second launch. "Check for Updates…" is in the app menu.
- Sparkle compares `CFBundleVersion` (= `version` in `package.json`), so every release must bump it.

Shipping an update:

```bash
# 1. Bump "version" in package.json and utils/changelog.ts, then run the release build above.
# 2. Sign the zips and write release/appcast-{arm64,x64}.xml:
scripts/appcast.sh
# 3. Publish the release with everything attached (tag must be v<version>):
gh release create v1.0.1 release/CleanMode-1.0.1-*.dmg release/CleanMode-1.0.1-*.zip release/appcast-*.xml
```

## Verifying a release artifact

```bash
# Open and drag .app into /Applications, then:
codesign -dv --verbose=4 "/Applications/CleanMode.app"
# expect: Authority=Developer ID Application: <your name>
# expect: entitlements include device.input-monitoring

xcrun stapler validate "/Applications/CleanMode.app"
# expect: "The validate action worked!"
```

## What to do if notarization fails

`@electron/notarize` will print Apple's failure log. Common causes:
- Hardened runtime missing entitlement → fix `build/entitlements.mac.plist`.
- Unsigned nested binary (helper/framework) → check `electron-builder` logs for "skipping signing".
- App-specific password expired → regenerate at appleid.apple.com.
