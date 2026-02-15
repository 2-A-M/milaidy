#!/bin/bash
set -euo pipefail

# Milady Build & Verify Script
# This script builds the electron app, signs it (if credentials are present), 
# verifies the signature, and runs E2E tests against the packaged app.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

echo "=== Milady Build & Verify ==="
echo "Repo Root: ${REPO_ROOT}"

cd "${REPO_ROOT}/apps/app"

# 1. Check for Signing Credentials
echo "--- Checking Signing Credentials ---"
HAS_SIGNING_CREDS=false

if [ -n "${CSC_LINK:-}" ] && [ -n "${CSC_KEY_PASSWORD:-}" ]; then
  echo "✅ Found CSC_LINK and CSC_KEY_PASSWORD env vars."
  HAS_SIGNING_CREDS=true
elif security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
  echo "✅ Found 'Developer ID Application' in Keychain."
  HAS_SIGNING_CREDS=true
  # Enable auto-discovery for electron-builder
  export CSC_IDENTITY_AUTO_DISCOVERY=true
else
  echo "⚠️  No signing credentials found (Env vars or Keychain)."
  echo "   The build will be unsigned or ad-hoc signed."
  echo "   To sign, ensure 'Developer ID Application' cert is in Keychain"
  echo "   OR set CSC_LINK (p12 path/base64) and CSC_KEY_PASSWORD."
fi

# 2. Build & Package
echo "--- Building & Packaging ---"

# Build Root Project first
echo "--- Building Root Project ---"
cd "${REPO_ROOT}"
bun install
bunx tsdown
node --import tsx scripts/write-build-info.ts
echo '{"type":"module"}' > dist/package.json

# Build App
cd "${REPO_ROOT}/apps/app"
bun install
bun run cap:sync:electron

# Build web assets (Capacitor)
bun run build

# Build Electron
cd electron
bun install
bun run build

echo "--- Packaging Electron App ---"
# If we have creds, perform a regular build which includes signing if configured.
# If not, we might want to force ad-hoc or standard build.
# electron-builder handles skipping signing if no identity found, usually.

if [ "$HAS_SIGNING_CREDS" = true ]; then
  echo "Building with signing enabled..."
  bun run build && bun run build:whisper && bunx electron-builder build --mac --x64 --publish never
else
  echo "Building without explicit signing identity (will fall back to ad-hoc or skip)..."
  # Force ad-hoc signing or skip signing usually requires config tweaks, 
  # but electron-builder typically warns and proceeds or fails if hardenedRuntime is on.
  # We'll try standard build.
  bun run build && bun run build:whisper && bunx electron-builder build --mac --x64 --publish never -c.mac.identity=null
fi

# 3. Verify Signature
echo "--- Verifying Signature ---"
APP_PATH=$(find dist/mac* -name "Milaidy.app" | head -n 1)

if [ -z "$APP_PATH" ]; then
  echo "❌ Build failed? Could not find Milaidy.app in dist/mac*"
  exit 1
fi

echo "Found App: $APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if [ "$HAS_SIGNING_CREDS" = true ]; then
  echo "Checking for Developer ID authority..."
  codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep "Authority=Developer ID Application" && echo "✅ Signed with Developer ID" || echo "⚠️  Not signed with Developer ID (local dev cert?)"
  
  echo "Validating with spctl (Gatekeeper assessment)..."
  spctl -a -vv --type exec "$APP_PATH" || echo "⚠️  spctl rejected (might be expected if not notarized yet)"
else
  echo "Skipping strict signature checks (unsigned/ad-hoc)."
fi

# 4. Run E2E Tests against Packaged App
echo "--- Running E2E Verification ---"
export MILAIDY_TEST_DMG_PATH="${PWD}/${APP_PATH}" # Actually we usually test the DMG but app works too for some tests? 
# The workflow uses the DMG path. Let's find the dmg.
DMG_PATH=$(find dist -name "*.dmg" | head -n 1)

if [ -n "$DMG_PATH" ]; then
  echo "Testing with DMG: $DMG_PATH"
  export MILAIDY_TEST_DMG_PATH="${PWD}/${DMG_PATH}"
else
  echo "⚠️  No DMG found, testing with .app directly if supported by test framework"
  # Provide app path as fallback if test supports it, otherwise might fail.
fi

cd ..
echo "Running: bun run test:electron:packaged:e2e"
bun run test:electron:packaged:e2e

echo "=== Verification Complete ==="
