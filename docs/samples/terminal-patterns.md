# Claude Code Terminal Output Patterns

Analysis of terminal data for building prompt detection in the `terminal-ready` VS Code extension.
Data captured from Claude Code v2.1.69 interactive session on 2026-03-05.

## Data Sources

- `interactive-startup-exit-raw.txt` — raw PTY output of: startup → /exit → shutdown
- `interactive-startup-exit-hex.txt` — hex dump of same
- `print-mode-raw.txt` — raw PTY output from `claude --print` (non-interactive)
- `print-mode-stream.json` — structured stream-json events

## Terminal States and Their Signatures

### State 1: READY (waiting for free-text input)

The idle prompt. This is the primary state we want to detect.

**Visual appearance:**
```
────────────────────────────────────────────────────────
❯ █
────────────────────────────────────────────────────────
  ? for shortcuts
```

**Raw terminal bytes:**
```
Horizontal rule:  \x1b[38;2;136;136;136m + repeated ─ (U+2500) + \x1b[39m
Prompt line:      \x1b[39m + ❯ (U+276F) + \xc2\xa0 (NBSP) + \x1b[7m \x1b[27m (reverse video cursor block)
Horizontal rule:  (same as above)
Hint line:        \x1b[2C\x1b[38;2;153;153;153m?\x1b[1Cfor\x1b[1Cshortcuts\x1b[39m
```

**Key detection signals:**
- `❯` (U+276F) character followed by NBSP and reverse-video cursor
- Hint text: `? for shortcuts` (with \x1b[1C between words)
- Window title: `\x1b]0;✳ Claude Code\x07` (✳ = sparkle, U+2733)
- Terminal mode setup: `\x1b[?2004h` (enable bracketed paste) + `\x1b[?1004h` (enable focus reporting)

**Regex for detecting ready state (on stripped text):**
```
/❯\s*$/m        — prompt character at end of line
/\?\s*for\s*shortcuts/  — hint text (confirms it's the input prompt)
```

### State 2: WORKING (processing a response)

Claude is generating a response, running tools, or thinking.

**Visual appearance:**
```
* Finagling…
```
(with colored asterisk, followed by activity text)

**Raw terminal bytes:**
```
\x1b[38;2;255;153;51m*\x1b[39m \x1b[38;2;255;153;51mFinagling… \x1b[39m
```

**Key detection signals:**
- Colored `*` (orange: rgb 255,153,51) followed by activity verb
- Activity verbs vary: "Finagling…", "Thinking…", "Reading…", etc.
- Hint text changes to: `esc to interrupt` (with \x1b[1C between words)
- Window title changes to spinner: `\x1b]0;⠂ Claude Code\x07` (⠂ = braille dot, rotates through spinner chars)

**Regex for detecting working state (on stripped text):**
```
/esc\s*to\s*interrupt/  — hint text (confirms working state)
/^[*✳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠂]\s/m  — spinner/activity indicator
```

### State 3: BLOCKED (permission prompt — waiting for tool approval)

Claude wants to use a tool and needs permission. This is a "waiting for input" state but through a structured UI, not the `>` prompt.

**Visual appearance** (from observed permission modes):
- Tool permission: checkbox-style selector with Allow/Deny options
- The exact rendering depends on the permission mode (`default`, `acceptEdits`, `plan`, etc.)

**Detection signals (to validate with live capture):**
- Likely shows `Enter to confirm` or `Enter to select` hint text
- No `❯` prompt visible
- No `esc to interrupt` hint

### State 4: BLOCKED (AskUserQuestion — choice prompt)

Claude is asking a structured question with numbered options.

**Visual appearance:**
```
? Which approach do you prefer?
  1. Option A
  2. Option B
  ❯ 3. Option C (selected)
Enter to select · ↑/↓ to navigate
```

**Detection signals (to validate):**
- `Enter to select` hint text
- Numbered list with `❯` marker on the selected option

### State 5: EXITED

The Claude Code session has ended.

**Raw terminal bytes (session exit sequence):**
```
\x1b]0;✳ Claude Code\x07     — title reset to sparkle
\x1b[<u                        — restore cursor
\x1b[?1004l                    — disable focus reporting
\x1b[?2004l                    — disable bracketed paste
\x1b[?25h                      — show cursor
\x1b]9;4;0;\x07                — OSC progress: done
\x1b]0;\x07                    — clear window title
Resume this session with:
claude --resume <session-id>
```

**Key detection signals:**
- `\x1b[?1004l` (disable focus reporting) — Claude Code is cleaning up
- `\x1b]9;4;0;\x07` — OSC 9;4 progress done
- Window title cleared: `\x1b]0;\x07`
- "Resume this session with:" text
- Regular shell prompt returns after

## Window Title Protocol

Claude Code sets the terminal window title (OSC 0) to indicate state:

| Title | State |
|-------|-------|
| `✳ Claude Code` | Ready/idle (sparkle = waiting) |
| `⠂ Claude Code` | Working (braille spinner rotates) |
| (empty/cleared) | Exited |

**This is potentially the most reliable detection signal** — it's a single OSC sequence that clearly indicates state.

## Progress Bar Protocol (OSC 9;4)

Claude Code uses Windows Terminal's progress bar:
- `\x1b]9;4;0;\x07` — state 0 = hidden/done (on exit)
- May also use states 1-3 during work (not observed yet)

## Keyboard Hint Text (bottom bar)

All hint strings found in the binary (rendered with `\x1b[1C` between words):

| Hint Text | State |
|-----------|-------|
| `? for shortcuts` | Ready (main prompt) |
| `esc to interrupt` | Working (processing) |
| `Enter to select` | Blocked (choice/permission) |
| `Enter to confirm` | Blocked (confirmation) |
| `Esc to cancel` | Blocked (cancellable prompt) |
| `Esc to close` | Blocked (closeable dialog) |
| `Esc to continue` | Blocked (info dialog) |
| `Esc to exit` | Blocked (exit confirmation?) |
| `Esc to skip` | Blocked (skippable prompt) |
| `Tab to amend` | Blocked (editable input) |
| `Tab to switch questions` | Blocked (multi-question) |
| `enter to collapse` | UI navigation |
| `enter to view` | UI navigation |

## Detection Strategy Summary

### Recommended approach (ordered by reliability):

1. **Window title (OSC 0)** — Most reliable state indicator
   - `✳ Claude Code` → READY
   - Spinner char + `Claude Code` → WORKING
   - Empty/cleared → EXITED

2. **Hint text matching** — Confirms specific sub-states
   - `? for shortcuts` → READY (main prompt)
   - `esc to interrupt` → WORKING
   - `Enter to select/confirm` → BLOCKED (needs input)

3. **Prompt character** — Visual confirmation
   - `❯` at start of line with reverse-video cursor → READY
   - `❯` with item number → BLOCKED (selection UI)

4. **Idle timeout** — Fallback
   - No output for N ms after last write → assume READY

### Anti-patterns (false positive risks):
- `❯` inside code output or markdown
- `>` in shell output, git diffs, etc.
- Temporary silence during API calls (not actually ready)
- Permission mode `bypassPermissions` skips all prompts → fewer BLOCKED states
