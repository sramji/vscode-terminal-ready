# terminal-ready

A VS Code extension that shows per-terminal status indicators for Claude Code, so you can see at a glance which terminals need your attention.

## Problem

When running 3-6+ Claude Code terminals in a single VS Code window, there's no way to tell which ones are waiting for input without clicking each tab. Claude Code has long silent thinking periods, multiple blocking states, and variable permission modes — all invisible at the tab level. This creates polling overhead and cognitive load, especially in multi-agent coding workflows.

## How it works

The extension auto-detects Claude Code terminals and prefixes their names with status indicators:

| Indicator | State | Meaning |
|-----------|-------|---------|
| 🟢 | **Ready** | Claude finished, waiting for new input |
| 🦀 | **Working** | Claude is actively processing your request |
| 🟠 | **Blocked** | Claude needs your input to proceed (permission, question, confirmation) |
| 🔵 | **Suspended** | Claude Code backgrounded (Ctrl+Z), valuable session parked |
| ⚪ | **Exited** | Session ended |

**Zero configuration.** Claude Code is auto-detected by its startup banner. Indicators are configurable per profile.

### Detection

State detection uses **window title (OSC 0) escape sequences** — the most reliable signal available. Claude Code sets its window title to reflect state:

- `✳ Claude Code` → Ready
- `⠂ Claude Code` (braille spinner prefix) → Working
- Empty → Exited

This persists through silent thinking periods (10-30+ seconds) and works regardless of permission mode (default, bypass, accept edits, plan mode).

**Blocked** detection uses ANSI-stripped text pattern matching against each output line:

| Pattern | UI element |
|---------|-----------|
| `^\s*☐` | Permission prompt (`☐ Allow Bash: git status?`) |
| `Enter to select\s*·` | Choice UI footer (interpunct required to avoid prose false positives) |
| `Enter to confirm` | Confirmation prompt |
| `Esc to cancel\s*·` | Numbered choice UI footer (`❯ 1. Yes / 2. No`) |

**Unblocked** detection exits Blocked → Ready when a pattern matches the full stripped output chunk. The `⎿` character (U+23BF) is used by Claude Code as a result indicator after every slash command dialog completion (`⎿  Permissions dialog dismissed`, `⎿  Kept model as ...`). This is the reliable signal for slash command dismissal, since Claude Code does not re-send the window title after dialog close.

**Suspended** detection triggers when the window title stops containing "Claude Code" (shell has taken over after Ctrl+Z). Exception: completion summary titles (e.g. `✻ Sautéed for 7m 11s`) are treated as Ready, not Suspended.

## Install

### One-line install (recommended)

The install script downloads the extension, installs it, and configures the required proposed API automatically:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sramji/vscode-terminal-ready/main/scripts/install.sh)
```

Or if you've cloned the repo:

```bash
bash scripts/install.sh
```

Then reload VS Code (Ctrl+Shift+P → "Developer: Reload Window").

### Manual install

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/sramji/vscode-terminal-ready/releases)
2. Install it:
   ```bash
   code --install-extension terminal-ready-0.1.0.vsix
   ```
3. Enable the proposed API — add `"enable-proposed-api": ["terminal-ready.terminal-ready"]` to your `argv.json`:
   - Open command palette → "Preferences: Configure Runtime Arguments"
   - Or edit the file directly (see [argv.json location](#argvjson-location) below)
4. Reload VS Code

### Local `.vsix` install

If you built the extension locally:

```bash
bash scripts/install.sh local terminal-ready-0.1.0.vsix
```

### argv.json location

The proposed API must be enabled in the correct `argv.json` for your setup:

| Setup | Path |
|-------|------|
| Local VS Code | `~/.vscode/argv.json` |
| Remote-WSL / Remote-SSH | `~/.vscode-server/data/Machine/argv.json` (on the remote host) |

The install script detects your environment and writes to the correct file automatically.

> **Important for Remote-WSL/SSH users:** The `argv.json` on your *remote* host is what matters, not the one on your local machine. If the extension loads but doesn't show indicators, check that `~/.vscode-server/data/Machine/argv.json` exists and contains the `enable-proposed-api` entry.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Extension loads but no indicators appear | Proposed API not enabled | Run `bash scripts/install.sh` or manually add to `argv.json` (see above) |
| "Please restart VS Code before reinstalling" | VS Code Server just updated | Reload VS Code first, then retry — or use `bash scripts/install.sh` which handles this automatically |
| Extension not visible in Extensions panel | Install went to wrong location | For Remote-WSL, ensure you installed on the WSL side, not Windows |

> **Why a proposed API?** The stable shell integration API (`execution.read()`) filters out the OSC window title sequences we need for state detection, and stops streaming when Claude Code takes over the terminal. We've [verified this experimentally](docs/plans/2026-03-06-shell-integration-migration.md). The proposed API (`onDidWriteTerminalData`) is the only way to get continuous raw terminal output. This prevents marketplace publication — we distribute via GitHub Releases instead.

## Commands

| Command | Description |
|---------|-------------|
| `Terminal Ready: Focus Next Ready Terminal` | Jump to the next 🟢 terminal |
| `Terminal Ready: Focus Next Blocked Terminal` | Jump to the next 🟠 terminal |
| `Terminal Ready: Show Debug Info` | Show current state of all tracked terminals |

## Configuration

```jsonc
// Settings
"terminalReady.enabled": true,       // Master toggle
"terminalReady.mode": "matched-only" // "matched-only" or "all"
```

Indicators are configurable per profile in the source code (`src/profiles.ts`). User-facing profile configuration via settings is planned for a future release.

## Architecture

```
Terminal output → TerminalWatcher → ProfileMatcher → StateMachine → UIAdapter
                    (buffer)          (fingerprint)    (OSC title)    (rename)
```

- **StateMachine** — processes raw terminal output, extracts OSC 0 title sequences for state detection
- **ProfileMatcher** — tags terminals by matching ANSI-stripped output against profile fingerprints
- **UIAdapter** — prefixes terminal names with state indicators via `renameWithArg` command
- **RingBuffer** — accumulates output across chunk boundaries with ANSI stripping
- **TerminalWatcher** — orchestrates per-terminal tracking and UI updates
- **ConfigResolver** — provides built-in Claude Code profile and settings

### ProfileConfig — porting to other tools

The detection logic is fully driven by `ProfileConfig` (`src/types.ts`). To support a different AI coding tool, define a new profile:

```typescript
interface ProfileConfig {
  name: string;                        // Display name
  fingerprint: string;                 // Substring in startup banner (ANSI-stripped)
  workingPatterns: RegExp[];           // Lines that indicate active work (e.g. "esc to interrupt")
  blockedPatterns: RegExp[];           // Lines that indicate blocked/waiting for input
  unblockedPatterns?: RegExp[];        // Whole-chunk patterns that exit Blocked → Ready
  readyPattern: RegExp;                // (legacy) per-line ready hint; prefer OSC title + unblockedPatterns
  readyDebounceMs: number;             // Idle timeout before emitting Ready (ms)
  completionTitlePattern?: RegExp;     // OSC title pattern treated as Ready (e.g. completion summary)
  indicators?: Partial<Record<TerminalState, string>>; // Emoji/text prefix per state
}
```

**Key implementation notes for porters:**

1. **ANSI stripping** — `\x1b[1C` (cursor forward 1) must become a space, not be deleted, or character patterns split across cursor movements will fail to match.
2. **OSC title is primary** — use it for Working/Ready/Suspended/Exited. Text patterns are secondary and should be structurally precise (anchored, require surrounding punctuation) to avoid false positives on prose output.
3. **`unblockedPatterns` tests the whole stripped chunk** — not per-line. This avoids the cursor-down (`\x1b[1B`) vs newline issue: after stripping, visual lines separated by cursor-down collapse into one string. Per-line splitting only works for `\n`-delimited output.
4. **`blockedPatterns` run before `unblockedPatterns`** — if both match in the same chunk, Blocked wins.
5. **Rename-based indicators** — VS Code's `terminal.iconPath` and `color` are read-only after creation. Indicators are name prefixes applied via `workbench.action.terminal.renameWithArg` on every output chunk (so user renames are overwritten on next output, which is intentional).

## Known limitations

- **Proposed API required** — cannot be published to VS Code Marketplace; distributed via `.vsix`
- **Name-based indicators** — VS Code doesn't support changing terminal tab color/icon after creation, so indicators are name prefixes rather than colored dots
- **Rename interaction** — if you rename a terminal, the indicator prefix reappears on the next output chunk
- **Pre-existing terminals** — terminals running Claude Code before the extension activates are detected on next output


## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch the Extension Development Host with the extension loaded.

This project was developed using [superpowers](https://github.com/obra/superpowers).

## License

MIT
