#!/usr/bin/env bash
# Builds picnic-mcp.mcpb, the bundle that Claude Desktop and other MCPB clients install: the built
# server (run `npm run build` first), its production dependencies, and mcpb/manifest.json with the
# version from package.json.
set -euo pipefail
cd "$(dirname "$0")/.."

MCPB="@anthropic-ai/mcpb@2.1.2"
version=$(node -p "require('./package.json').version")
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

cp -r dist package.json package-lock.json README.md LICENSE "$stage"
node -e "
  const manifest = require('./mcpb/manifest.json');
  manifest.version = process.argv[1];
  require('fs').writeFileSync(process.argv[2], JSON.stringify(manifest, null, 2));
" "$version" "$stage/manifest.json"
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

npx --yes "$MCPB" validate "$stage/manifest.json"
npx --yes "$MCPB" pack "$stage" picnic-mcp.mcpb
