---
name: serve-it
description: Use when the user says "serve it" or "/serve-it", or asks to ship, release, or publish a new CleanMode version to GitHub and Sparkle auto-update users.
---

# Serve it

Ships the working tree as a signed, notarized CleanMode release that existing installs receive through Sparkle. Run the steps in order. Each step's check must pass before the next; on any failure, stop and report the exact output.

Invoking this skill authorizes committing to `main`, pushing, building, and publishing. Ask the user only at the two marked **ASK** points.

**Variables:** shell variables don't persist between Bash tool calls. Start every snippet by setting what it uses, for example `cd /path/to/cleanmode && V=1.1.2 PREV=v1.1.1 NOTES=<scratchpad>/release-notes-1.1.2.md`. `V` has no `v` prefix; tags are `v$V`.

## 1. Commit

1. `npm run type-check` must pass.
2. Read `git status` and `git diff`. Group the changes into conventional commits matching `git log --oneline` (`feat:`, `fix:`, `docs:`, `chore:`, optional scope). Commit straight to `main`: this repo keeps a linear history with no feature branches.
3. Never stage `.env.signing`, `release/`, or `vendor/`. Add attribution trailers if the session instructions define them.

Nothing to commit is fine; continue.

## 2. Version

1. `git fetch --tags origin`: release tags are created on GitHub, so they can be missing locally. `PREV` is the release marked Latest in `gh release list --limit 3`.
2. Compare `version` in `package.json` with `PREV` (without its `v`):
   - **Equal:** a bump is required, because Sparkle won't offer an equal version. **ASK** for the version and recommend the next patch; this repo ships feature releases as patch bumps too (1.1.0 → 1.1.1). Then run `npm version $V --no-git-tag-version`, set `appVersion` in `utils/changelog.ts` to `$V`, and commit `chore: bump version to $V`.
   - **Greater** (bumped but never released): use that version as `V` without asking. If `appVersion` in `utils/changelog.ts` differs, set it and commit `chore: bump version to $V`.

## 3. Push

`git push origin main`

## 4. Native module

Prebuilds are gitignored and built locally. Run `npm run native:build` if either prebuild is missing or the native source changed since `PREV`. Compare with git, not file timestamps: a checkout or merge updates the source's timestamp without changing its contents.

```bash
for a in arm64 x64; do [ -f electron/native/eventtap/prebuilds/darwin-$a/cleanmode-eventtap.node ] || echo "REBUILD (missing $a)"; done
git diff --quiet "$PREV" HEAD -- electron/native/eventtap/eventtap.mm electron/native/eventtap/binding.gyp electron/native/eventtap/package.json || echo "REBUILD (source or build flags changed)"
```

## 5. Build: signed and notarized

```bash
cd /path/to/cleanmode && set -a && source ./.env.signing && set +a && npm run electron:build
```

Run it in the background; notarizing two architectures (app plus DMG) takes 10–30 min. Wait for the completion notification instead of polling. Never print `.env.signing` values.

Treat any of these log lines as a failure: `[notarize] Skipping`, `[staple-dmg] Skipping`, or `[staple-dmg] CSC_NAME not set`.

## 6. Verify (publish nothing unless every line passes)

```bash
for app in release/mac-arm64/CleanMode.app release/mac/CleanMode.app; do   # arm64, x64
  /usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$app/Contents/Info.plist"  # = $V
  codesign --verify --deep --strict "$app" && xcrun stapler validate "$app"
  spctl -a -vv -t exec "$app"   # accepted, source=Notarized Developer ID
done
for dmg in release/CleanMode-$V-*.dmg; do
  xcrun stapler validate "$dmg" && spctl -a -vv -t open --context context:primary-signature "$dmg"
done
```

## 7. Appcast

Run `scripts/appcast.sh`. It signs the zips with the Sparkle EdDSA key in the login keychain; if macOS asks for keychain access, tell the user to click Allow.

The appcasts keep earlier versions, so check that the new version is present rather than that it's the only one:

```bash
grep -c "<sparkle:version>$V<" release/appcast-arm64.xml release/appcast-x64.xml   # 1 each
grep -c "/download/v$V/" release/appcast-arm64.xml release/appcast-x64.xml         # 1 each
```

## 8. Release notes

Start from `gh release view "$PREV" --json body -q .body`. Keep its headings in the same order, and rewrite the content for `$V`:
- Update the summary and the DMG file names.
- **What's new:** user-facing bullets from `git log "$PREV"..HEAD`. Leave out `chore:` and `docs:` commits.
- Tell existing users they can update with **CleanMode → Check for Updates…**.
- Remove anything that applied only to `PREV`, such as notes about upgrading from an older version.

Write the notes to `$NOTES`. **ASK** the user to approve them.

## 9. Publish

```bash
gh release create "v$V" --target main --title "CleanMode $V" --notes-file "$NOTES" \
  release/CleanMode-$V-*.dmg release/CleanMode-$V-*.zip release/appcast-arm64.xml release/appcast-x64.xml
```

Publish a regular release, not a draft or prerelease. The app's feed URL (`releases/latest/download/appcast-<arch>.xml`) skips drafts and prereleases.

## 10. Update git and confirm it's live

`main` has no upstream configured, so compare commits directly:

```bash
git fetch --tags origin
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] && git rev-parse -q --verify "refs/tags/v$V" >/dev/null && echo "git in sync" || echo "git NOT in sync"
gh release list --limit 1   # v$V marked Latest
for a in arm64 x64; do curl -sfL "https://github.com/mrbarkan/CleanMode/releases/latest/download/appcast-$a.xml" | grep -c "<sparkle:version>$V<"; done   # 1, twice
```

Report the commits, the version, the release URL, and whether the live feed serves `$V`.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Version not bumped | Sparkle never offers the update |
| `utils/changelog.ts` not bumped | About shows the old version |
| `$V` used in a new Bash call without setting it | `CleanMode--*.dmg` matches nothing; checks fail |
| Built without loading `.env.signing` | Notarization silently skipped; Gatekeeper warns users |
| Published before `scripts/appcast.sh` | Uploads the previous version's appcast |
| Draft or prerelease | `latest` feed skips it; nobody updates |
| `eventtap.mm` changed, prebuild not rebuilt | Ships old native input blocking |
