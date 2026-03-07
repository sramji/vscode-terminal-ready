#!/usr/bin/env bash
# Capture raw terminal output from a Claude Code session.
# Run this in a terminal that is NOT already inside Claude Code.
#
# Usage:
#   bash scripts/capture-terminal.sh [output-prefix]
#
# It launches Claude Code under `script`, which records every byte
# written to the PTY (including ANSI escape sequences).
# When the session ends, it saves:
#   docs/samples/<prefix>-raw.txt   — raw terminal recording
#   docs/samples/<prefix>-hex.txt   — hex dump for analysis

set -euo pipefail

PREFIX="${1:-claude-session-$(date +%Y%m%d-%H%M%S)}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/samples"
mkdir -p "$DIR"

RAW="$DIR/${PREFIX}-raw.txt"
HEX="$DIR/${PREFIX}-hex.txt"

echo "Recording Claude Code session to: $RAW"
echo "Press Ctrl+C or type /exit in Claude to end."
echo "---"

script -q "$RAW" -c "claude"

echo "---"
echo "Session recorded to: $RAW"

xxd "$RAW" > "$HEX"
echo "Hex dump saved to: $HEX"

echo ""
echo "To analyze key patterns:"
echo "  grep -n '>' $RAW           # Find prompt lines"
echo "  grep -c $'\\x1b' $RAW      # Count lines with ANSI escapes"
