#!/usr/bin/env bash
#
# Package the built .app into a distributable .dmg using hdiutil alone.
#
# Tauri's own DMG step (bundle_dmg.sh) drives Finder over AppleScript to lay out
# the disk image window. That needs Automation permission, which a CI runner — or
# any terminal that cannot show the macOS consent prompt — does not have. The step
# then fails with "-1743: Not authorized to send Apple events to Finder" and aborts
# the build with exit 64, *after* the .app has already been written successfully.
#
# This script skips the cosmetics and produces a plain, functional disk image: the
# app plus the conventional /Applications drag target. No custom background or icon
# positioning, and no GUI permission required.
#
# Usage:
#   scripts/make-dmg.sh           package the existing .app
#   scripts/make-dmg.sh --build   run `tauri build --bundles app` first
#
# Override the output directory with OUT_DIR=/some/path.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT=$(pwd)

CONF="$ROOT/src-tauri/tauri.conf.json"
[[ -f $CONF ]] || {
	echo "error: $CONF not found" >&2
	exit 1
}

PRODUCT=$(node -e 'process.stdout.write(require(process.argv[1]).productName)' "$CONF")
VERSION=$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$CONF")

# Match Tauri's own bundle naming.
case "$(uname -m)" in
arm64) ARCH=aarch64 ;;
x86_64) ARCH=x64 ;;
*) ARCH=$(uname -m) ;;
esac

if [[ ${1:-} == --build ]]; then
	echo "==> Building $PRODUCT $VERSION (app bundle only)"
	npm run tauri build -- --bundles app
elif [[ -n ${1:-} ]]; then
	echo "error: unknown argument '$1' (expected --build or nothing)" >&2
	exit 2
fi

BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
APP="$BUNDLE_DIR/macos/$PRODUCT.app"
OUT_DIR="${OUT_DIR:-$BUNDLE_DIR/dmg}"
DMG="$OUT_DIR/${PRODUCT}_${VERSION}_${ARCH}.dmg"

[[ -d $APP ]] || {
	echo "error: $APP not found." >&2
	echo "       Run 'scripts/make-dmg.sh --build' to build it first." >&2
	exit 1
}

# A volume left mounted by an earlier failed run makes hdiutil fail on the name.
VOLUME="/Volumes/$PRODUCT"
if [[ -d $VOLUME ]]; then
	echo "==> Detaching stale volume $VOLUME"
	hdiutil detach "$VOLUME" -quiet || true
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging $PRODUCT.app"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
# Stray Finder metadata would otherwise be baked into the image.
find "$STAGE" -name .DS_Store -delete 2>/dev/null || true

mkdir -p "$OUT_DIR"
rm -f "$DMG"

echo "==> Creating disk image"
hdiutil create \
	-volname "$PRODUCT" \
	-srcfolder "$STAGE" \
	-ov -format UDZO -quiet \
	"$DMG"

echo "==> Verifying"
hdiutil verify "$DMG" >/dev/null 2>&1 || {
	echo "error: checksum verification failed for $DMG" >&2
	exit 1
}

echo
echo "Created $DMG ($(du -h "$DMG" | cut -f1))"
echo
echo "Note: this build is unsigned. macOS will refuse to open it on another"
echo "machine until it is signed and notarized, or until the user right-clicks"
echo "the app and chooses Open."
