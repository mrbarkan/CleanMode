#!/bin/sh
# Per-arch Sparkle feeds for the current package.json version.
# Reads release/CleanMode-<version>-{arm64,x64}.zip, signs them with the EdDSA key in
# the login keychain, and writes release/appcast-{arm64,x64}.xml. Upload those with the
# zips to the v<version> GitHub release (see BUILD.md).
set -eu

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
node scripts/embed-sparkle.js   # ensures vendor/Sparkle/bin exists

for ARCH in arm64 x64; do
  DIR="release/sparkle-$ARCH"
  rm -rf "$DIR" && mkdir -p "$DIR"
  cp "release/CleanMode-$VERSION-$ARCH.zip" "$DIR/"
  vendor/Sparkle/bin/generate_appcast --maximum-deltas 0 \
    --download-url-prefix "https://github.com/mrbarkan/CleanMode/releases/download/$TAG/" \
    -o "release/appcast-$ARCH.xml" "$DIR"
done

echo "Wrote release/appcast-arm64.xml and release/appcast-x64.xml for $TAG"
