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
