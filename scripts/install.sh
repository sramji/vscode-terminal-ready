#!/usr/bin/env bash
# Install terminal-ready extension and configure the proposed API automatically.
#
# Usage:
#   bash scripts/install.sh [version]
#   bash scripts/install.sh local path/to/file.vsix
#
# Examples:
#   bash scripts/install.sh          # latest release from GitHub
#   bash scripts/install.sh v0.1.0   # specific version from GitHub
#   bash scripts/install.sh local terminal-ready-0.1.0.vsix  # local .vsix file

set -euo pipefail

EXTENSION_ID="terminal-ready.terminal-ready"

# --- Determine the .vsix source ---

VSIX_FILE=""

if [ "${1:-}" = "local" ]; then
  VSIX_FILE="${2:?Usage: install.sh local <path-to-vsix>}"
  if [ ! -f "$VSIX_FILE" ]; then
    echo "ERROR: File not found: $VSIX_FILE"
    exit 1
  fi
  echo "Installing from local file: $VSIX_FILE"
else
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

  VSIX_FILE="/tmp/terminal-ready.vsix"
  echo "Downloading $URL..."
  gh release download "${VERSION}" --repo "$REPO" --pattern "*.vsix" --output "$VSIX_FILE" --clobber
fi

# --- Install the extension ---

echo "Installing extension..."
if ! code --install-extension "$VSIX_FILE" --force 2>/dev/null; then
  echo ""
  echo "code --install-extension failed (this can happen after a VS Code Server update)."
  echo "Falling back to manual extraction..."

  # Determine extensions directory
  if [ -d "${HOME}/.vscode-server/extensions" ]; then
    EXT_DIR="${HOME}/.vscode-server/extensions/${EXTENSION_ID}-0.1.0"
  else
    EXT_DIR="${HOME}/.vscode/extensions/${EXTENSION_ID}-0.1.0"
  fi

  mkdir -p "$EXT_DIR"
  TMPDIR_EXTRACT="/tmp/terminal-ready-vsix-extract"
  rm -rf "$TMPDIR_EXTRACT"
  unzip -o "$VSIX_FILE" -d "$TMPDIR_EXTRACT" > /dev/null
  cp -r "$TMPDIR_EXTRACT/extension/"* "$EXT_DIR/"
  cp "$TMPDIR_EXTRACT/extension.vsixmanifest" "$EXT_DIR/.vsixmanifest"
  rm -rf "$TMPDIR_EXTRACT"
  echo "Extension extracted to $EXT_DIR"
fi

# Clean up downloaded file (but not user-provided local files)
if [ "${1:-}" != "local" ] && [ -f "/tmp/terminal-ready.vsix" ]; then
  rm -f "/tmp/terminal-ready.vsix"
fi

# --- Configure the proposed API ---

echo ""
echo "Configuring proposed API..."

# Determine argv.json location (Remote-WSL/SSH uses .vscode-server, local uses .vscode)
if [ -d "${HOME}/.vscode-server" ]; then
  ARGV_DIR="${HOME}/.vscode-server/data/Machine"
else
  ARGV_DIR="${HOME}/.vscode"
fi
ARGV_FILE="${ARGV_DIR}/argv.json"

configure_proposed_api() {
  if [ ! -f "$ARGV_FILE" ]; then
    # No argv.json exists — create one
    mkdir -p "$ARGV_DIR"
    cat > "$ARGV_FILE" << 'ARGVEOF'
{
	"enable-proposed-api": ["terminal-ready.terminal-ready"]
}
ARGVEOF
    echo "Created $ARGV_FILE with proposed API enabled."
    return
  fi

  # argv.json exists — check if already configured
  if grep -q "$EXTENSION_ID" "$ARGV_FILE" 2>/dev/null; then
    echo "Proposed API already enabled in $ARGV_FILE"
    return
  fi

  # argv.json exists but doesn't have our entry — try to add it
  if grep -q '"enable-proposed-api"' "$ARGV_FILE" 2>/dev/null; then
    # Key exists, append our extension to the array
    # Use a simple sed to add before the closing bracket of the array
    sed -i 's|\("enable-proposed-api".*\)\]|\1, "'"$EXTENSION_ID"'"]|' "$ARGV_FILE"
    echo "Added $EXTENSION_ID to existing enable-proposed-api in $ARGV_FILE"
  else
    # Key doesn't exist, add it before the final closing brace
    sed -i 's|}|,\n\t"enable-proposed-api": ["'"$EXTENSION_ID"'"]\n}|' "$ARGV_FILE"
    echo "Added enable-proposed-api to $ARGV_FILE"
  fi
}

configure_proposed_api

echo ""
echo "Done! Reload VS Code to activate (Ctrl+Shift+P → 'Developer: Reload Window')."
