#!/usr/bin/env bash
# Install terminal-ready extension from GitHub Releases.
#
# Usage:
#   bash scripts/install.sh [version]
#
# Examples:
#   bash scripts/install.sh          # latest release
#   bash scripts/install.sh v0.1.0   # specific version

set -euo pipefail

REPO="sramji/vscode-terminal-ready"
VERSION="${1:-latest}"

if [ "$VERSION" = "latest" ]; then
  echo "Fetching latest release..."
  URL=$(gh release view --repo "$REPO" --json assets -q '.assets[] | select(.name | endswith(".vsix")) | .url')
else
  echo "Fetching release $VERSION..."
  URL=$(gh release view "$VERSION" --repo "$REPO" --json assets -q '.assets[] | select(.name | endswith(".vsix")) | .url')
fi

if [ -z "$URL" ]; then
  echo "ERROR: No .vsix asset found. Is gh authenticated?"
  exit 1
fi

TMPFILE="/tmp/terminal-ready.vsix"
echo "Downloading $URL..."
gh release download "${VERSION}" --repo "$REPO" --pattern "*.vsix" --output "$TMPFILE" --clobber

echo "Installing extension..."
code --install-extension "$TMPFILE"
rm -f "$TMPFILE"

# Configure proposed API
ARGV_FILE="${HOME}/.vscode-server/data/Machine/argv.json"
if [ ! -f "$ARGV_FILE" ]; then
  ARGV_FILE="${HOME}/.vscode/argv.json"
fi

echo ""
echo "Extension installed!"
echo ""
echo "IMPORTANT: You must enable the proposed API. Add this to your argv.json:"
echo "  Open VS Code → Ctrl+Shift+P → 'Preferences: Configure Runtime Arguments'"
echo ""
echo '  "enable-proposed-api": ["terminal-ready.terminal-ready"]'
echo ""
echo "Then restart VS Code."
