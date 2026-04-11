#!/bin/bash
# Build a minimal MindOS runtime archive for Desktop Core Hot Update.
# Output: /tmp/mindos-runtime-{VERSION}.tar.gz (pre-built, ~30-40MB)
#
# Directory structure matches what ProcessManager + analyzeMindOsLayout expect:
#   app/.next/standalone/server.js
#   app/.next/standalone/node_modules/
#   app/.next/standalone/.next/server/
#   app/.next/standalone/.next/static/
#   app/.next/standalone/public/
#   app/.next/static/            (isBundledRuntimeIntact checks this)
#   app/public/
#   mcp/dist/index.cjs
#   package.json
#   bin/ templates/ skills/
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
WORK="/tmp/mindos-runtime-build-$$"
ARCHIVE="/tmp/mindos-runtime-${VERSION}.tar.gz"
rm -rf "$WORK"

echo "📦 Building MindOS runtime v${VERSION}..."

# ── Web server (standalone Next.js) ──
echo "  Copying standalone..."
mkdir -p "$WORK/app/.next"
# Copy the entire standalone tree (server.js + node_modules + .next/server + .next/static + public)
# IMPORTANT: --no-dereference preserves symlinks as-is instead of following them.
# Next.js standalone creates node_modules/node_modules -> ../../node_modules symlinks
# that cause infinite recursion with plain cp -r (blowing up from ~30MB to 2GB+).
cp -r --no-dereference app/.next/standalone "$WORK/app/.next/standalone"
# Remove symlinks inside node_modules — they point to paths outside standalone
# and are not needed at runtime (standalone has all traced deps already).
find "$WORK/app/.next/standalone/node_modules" -type l -delete 2>/dev/null || true
# Remove dev artifacts that sneak into standalone
rm -rf "$WORK/app/.next/standalone/.next/cache" \
       "$WORK/app/.next/standalone/.next/dev" \
       "$WORK/app/.next/standalone/.next/diagnostics" \
       "$WORK/app/.next/standalone/.next/types" \
       "$WORK/app/.next/standalone/__tests__" \
       "$WORK/app/.next/standalone/.next/lock"

# Strip dev-only files from node_modules to reduce archive size
echo "  Stripping dev-only files from node_modules..."
STANDALONE_NM="$WORK/app/.next/standalone/node_modules"
if [ -d "$STANDALONE_NM" ]; then
  # TypeScript declaration files (only needed for IDE, not runtime)
  find "$STANDALONE_NM" -name '*.d.ts' -delete
  find "$STANDALONE_NM" -name '*.d.cts' -delete
  find "$STANDALONE_NM" -name '*.d.mts' -delete
  find "$STANDALONE_NM" -name '*.d.ts.map' -delete
  # Source maps (debugging only)
  find "$STANDALONE_NM" -name '*.js.map' -delete
  find "$STANDALONE_NM" -name '*.mjs.map' -delete
  find "$STANDALONE_NM" -name '*.cjs.map' -delete
  # TypeScript source files (compiled JS is what runs)
  find "$STANDALONE_NM" -name '*.ts' ! -name '*.d.ts' -path '*/src/*' -delete
  # Markdown docs inside packages
  find "$STANDALONE_NM" -name 'README.md' -delete
  find "$STANDALONE_NM" -name 'CHANGELOG.md' -delete
  find "$STANDALONE_NM" -name 'LICENSE' -delete
  find "$STANDALONE_NM" -name 'LICENSE.md' -delete
  # Empty directories left after deletion
  find "$STANDALONE_NM" -type d -empty -delete 2>/dev/null || true
  # Remove packages not needed at runtime
  rm -rf "$STANDALONE_NM/typescript"       # Only needed for type-checking, not runtime
  rm -rf "$STANDALONE_NM/@types"           # TypeScript type definitions
  rm -rf "$STANDALONE_NM/caniuse-lite"     # Browser compat data, not needed server-side
fi
# Copy static assets at top level (isBundledRuntimeIntact checks app/.next/static/)
cp -r app/.next/static "$WORK/app/.next/static"
# Copy public assets
mkdir -p "$WORK/app"
cp -r app/public "$WORK/app/public"
# Copy skill definitions (not included in standalone output, needed at runtime)
if [ -d app/data/skills ]; then
  mkdir -p "$WORK/app/data"
  cp -r app/data/skills "$WORK/app/data/skills"
fi

# ── MCP server ──
echo "  Copying MCP..."
mkdir -p "$WORK/mcp/dist"
cp mcp/dist/index.cjs "$WORK/mcp/dist/"
[ -f mcp/package.json ] && cp mcp/package.json "$WORK/mcp/"

# ── Metadata + auxiliary files ──
echo "  Copying metadata..."
cp package.json "$WORK/"
[ -d bin ] && cp -r bin "$WORK/"
[ -d templates ] && cp -r templates "$WORK/"
[ -d skills ] && cp -r skills "$WORK/"

# ── Package (flat, no outer directory) ──
echo "  Creating archive..."
# Use POSIX format to avoid GNU @LongLink extensions that our Windows JS
# tar parser must handle. --posix uses pax headers for paths > 100 chars,
# which the parser also supports, but keeping paths representable in ustar
# prefix+name (up to 255 chars) is preferred for maximum compatibility.
tar czf "$ARCHIVE" --posix -C "$WORK" .

# ── Self-validation ──
echo "  Validating..."
VERIFY="/tmp/mindos-runtime-verify-$$"
rm -rf "$VERIFY" && mkdir -p "$VERIFY"
tar xzf "$ARCHIVE" -C "$VERIFY"

ERRORS=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [ ! -e "$VERIFY/$f" ]; then
    echo "  ❌ MISSING: $f"
    ERRORS=$((ERRORS + 1))
  fi
done < <(node desktop/scripts/print-runtime-health-paths.mjs)

# Verify version in package.json matches
PKG_VER=$(node -p "require('$VERIFY/package.json').version" 2>/dev/null || echo "")
if [ "$PKG_VER" != "$VERSION" ]; then
  echo "  ❌ Version mismatch: package.json=$PKG_VER, expected=$VERSION"
  ERRORS=$((ERRORS + 1))
fi

rm -rf "$VERIFY" "$WORK"

if [ "$ERRORS" -gt 0 ]; then
  echo "❌ Validation failed with $ERRORS error(s)"
  exit 1
fi

# ── Output info ──
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$ARCHIVE" | cut -d' ' -f1)
else
  SHA256=$(shasum -a 256 "$ARCHIVE" | cut -d' ' -f1)
fi

if command -v numfmt >/dev/null 2>&1; then
  SIZE_HUMAN=$(stat -c%s "$ARCHIVE" | numfmt --to=iec)
  SIZE_BYTES=$(stat -c%s "$ARCHIVE")
elif command -v stat >/dev/null 2>&1; then
  SIZE_BYTES=$(stat -f%z "$ARCHIVE" 2>/dev/null || stat -c%s "$ARCHIVE" 2>/dev/null)
  SIZE_HUMAN="${SIZE_BYTES} bytes"
fi

echo ""
echo "✅ mindos-runtime-${VERSION}.tar.gz"
echo "   Size:   ${SIZE_HUMAN} (${SIZE_BYTES} bytes)"
echo "   SHA256: ${SHA256}"
echo "   Path:   ${ARCHIVE}"
