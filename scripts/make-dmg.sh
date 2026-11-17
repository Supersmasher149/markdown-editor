#!/usr/bin/env bash
#
# Sign the built .app and package it into a distributable .dmg using hdiutil.
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
#   scripts/make-dmg.sh                     sign (if an identity is available) and package
#   scripts/make-dmg.sh --build             build the .app first, then sign and package
#   scripts/make-dmg.sh --no-sign           package without signing
#
# Environment:
#   APPLE_SIGNING_IDENTITY   Identity to sign with. Prefer the SHA-1 hash from
#                            `security find-identity -v -p codesigning`, which is
#                            unambiguous when several certificates share a name.
#                            If unset, the only valid identity is used when there
#                            is exactly one.
#   OUT_DIR                  Output directory. Defaults to the Tauri bundle dir.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT=$(pwd)

DO_BUILD=0
SKIP_SIGN=0
while [[ $# -gt 0 ]]; do
	case "$1" in
	--build) DO_BUILD=1 ;;
	--no-sign) SKIP_SIGN=1 ;;
	-h | --help)
		sed -n '2,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
		exit 0
		;;
	*)
		echo "error: unknown argument '$1' (see --help)" >&2
		exit 2
		;;
	esac
	shift
done

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

if [[ $DO_BUILD -eq 1 ]]; then
	echo "==> Building $PRODUCT $VERSION (app bundle only)"
	npm run tauri build -- --bundles app
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

# --- Code signing -----------------------------------------------------------

SIGN_ID="${APPLE_SIGNING_IDENTITY:-}"

if [[ $SKIP_SIGN -eq 1 ]]; then
	echo "==> Skipping code signing (--no-sign)"
	SIGN_ID=""
elif [[ -z $SIGN_ID ]]; then
	IDENTITY_COUNT=$(security find-identity -v -p codesigning 2>/dev/null |
		grep -cE '^[[:space:]]+[0-9]+\)' || true)
	if [[ $IDENTITY_COUNT -eq 1 ]]; then
		SIGN_ID=$(security find-identity -v -p codesigning |
			awk 'match($0, /^[[:space:]]+[0-9]+\)/) {print $2; exit}')
		echo "==> Using the only valid signing identity: $SIGN_ID"
	elif [[ $IDENTITY_COUNT -eq 0 ]]; then
		echo "==> No signing identity found; the app will be left unsigned"
	else
		echo "error: $IDENTITY_COUNT signing identities available." >&2
		echo "       Set APPLE_SIGNING_IDENTITY to the one you want:" >&2
		security find-identity -v -p codesigning >&2
		exit 1
	fi
fi

if [[ -n $SIGN_ID ]]; then
	ENTITLEMENTS="$ROOT/src-tauri/entitlements.plist"
	SIGN_ARGS=(--force --sign "$SIGN_ID" --options runtime --timestamp)
	if [[ -f $ENTITLEMENTS ]]; then
		SIGN_ARGS+=(--entitlements "$ENTITLEMENTS")
	else
		echo "warning: $ENTITLEMENTS not found; signing without entitlements" >&2
	fi

	echo "==> Signing $PRODUCT.app"
	codesign "${SIGN_ARGS[@]}" "$APP"
	codesign --verify --deep --strict "$APP"
fi

# --- Disk image -------------------------------------------------------------

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

if [[ -n $SIGN_ID ]]; then
	echo "==> Signing the disk image"
	codesign --force --sign "$SIGN_ID" --timestamp "$DMG"
fi

echo "==> Verifying"
hdiutil verify "$DMG" >/dev/null 2>&1 || {
	echo "error: checksum verification failed for $DMG" >&2
	exit 1
}

echo
echo "Created $DMG ($(du -h "$DMG" | cut -f1))"

# --- Distribution readiness -------------------------------------------------

# Report what the app actually carries, not what this run did: --no-sign leaves
# any signature from an earlier run in place. A freshly built Tauri app is
# linker-signed "adhoc", which is not a real signature for distribution purposes.
# A real signature reports "Signature size=N"; an unsigned build reports
# "Signature=adhoc" (Tauri's binaries are linker-signed) or has none at all.
SIG_INFO=$(codesign -dv "$APP" 2>&1 || true)
if grep -qE 'Signature=adhoc|not signed at all' <<<"$SIG_INFO"; then
	echo
	echo "This build is UNSIGNED and cannot be distributed as-is."
elif spctl -a -t exec "$APP" >/dev/null 2>&1; then
	echo
	echo "Gatekeeper accepts this app. It is ready to distribute."
else
	# spctl exits non-zero on rejection, which is the case we are already in;
	# with `pipefail` that would abort the script before the explanation prints.
	ORIGIN=$(spctl -a -vv "$APP" 2>&1 | awk -F'origin=' '/origin=/ {print $2; exit}' || true)
	echo
	echo "Gatekeeper REJECTS this app (signed by: ${ORIGIN:-unknown})."
	echo
	echo "Signing alone is not enough to distribute. Gatekeeper only accepts an app"
	echo "signed with a \"Developer ID Application\" certificate AND notarized by"
	echo "Apple. An \"Apple Development\" certificate is for local use only."
	echo "Downloaders will be blocked; on macOS 15 and later they must go to"
	echo "System Settings > Privacy & Security > Open Anyway to run it."
	echo "See https://tauri.app/distribute/sign/macos/"
fi
