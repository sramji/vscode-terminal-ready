# Terminal Ready — Design Document

## Overview

A VS Code extension that shows per-terminal ready/idle status indicators for Claude Code sessions. Auto-detects Claude Code terminals via output fingerprinting and displays colored tab icons reflecting the agent's current state.

## State Model

Five states for Claude Code terminals:

| State | Color | Meaning |
|-------|-------|---------|
| Working | Pink (Claude brand) | Agent is actively processing; spinner visible |
| Ready | Green | Agent finished last task, waiting for new input |
| Blocked | Orange | Agent is hard-stopped, needs user input to proceed |
| Suspended | Blue | Claude Code backgrounded (Ctrl+Z), valuable session parked |
| Exited | Grey | Terminal closed |

### State transitions

```
Untagged ──fingerprint──> Ready (green)
                            |
                       user sends task
                            |
                            v
                      Working (pink) <──┐
                       |       |        |
                spinner|       |blocking| user responds
                clears |       |UI      | / new output
                       v       v        |
                  Ready    Blocked ─────┘
                 (green)   (orange)

Any state ──Ctrl+Z──> Suspended (blue) ──fg──> Working
Any state ──terminal close──> Exited (grey)
```

Key: the first state after fingerprinting is always Ready, because Claude Code opens with a banner and immediately presents the prompt with no spinner.

## Detection Patterns

All detection uses `onDidWriteTerminalData` — observing terminal output only, never user input. This is alias-proof regardless of how the user launches Claude Code.

### Fingerprint (one-time, tags the terminal)

Pattern: `╭─── Claude Code v`

Once seen, the terminal is tagged as a Claude Code session for its lifetime.

### State transitions (continuous, after tagging)

| Transition | Pattern | Notes |
|-----------|---------|-------|
| to Working | Spinner status line with timing info | Updates frequently while active |
| to Ready | Spinner line clears, prompt present without spinner | ~200ms debounce to avoid flicker |
| to Blocked | `☐` at line start | Tool permission prompt (Allow/Deny) |
| to Blocked | "Enter to select ·" line | Multiple choice question UI (· required to avoid prose match) |
| to Blocked | "Enter to confirm" | Compact, budget confirmation, etc. |
| to Blocked | "Esc to cancel" | Numbered choice UI footer (`❯ 1. Yes / 2. No` format) |
| to Ready | Completion summary title (`✻ … for <duration>`) | Task finished; title lacks "Claude Code" but is not a shell takeover |
| to Suspended | Shell prompt after tagged terminal | Ctrl+Z backgrounded the session |
| to Working (from Suspended) | Claude Code output resumes | `fg` brought it back |

### Claude Code blocking UI patterns

1. **Main prompt (Ready, not Blocked)** — `❯` prompt between turns, agent is done
2. **Tool permission prompts** — `☐` with Allow once / Allow always / Deny
3. **Multiple choice questions** — Numbered list with `❯` marker, "Enter to select"
4. **Compact prompt** — y/n confirmation when context window is large
5. **Cost/budget confirmation** — Spending threshold confirmation
6. **Authentication/login** — First run or expired auth

The main `❯` prompt is Ready (green). All others are Blocked (orange).

### Working vs Ready disambiguation

The `❯` prompt is always present. The distinguishing factor is the spinner:
- Spinner active + prompt = Working (pink)
- No spinner + prompt = Ready (green)

## Architecture

### Components

1. **TerminalWatcher** — Subscribes to `onDidOpenTerminal`, `onDidCloseTerminal`, `onDidWriteTerminalData`. Maintains a per-terminal ring buffer of recent output. Passes output chunks to ProfileMatcher.

2. **ProfileMatcher** — Watches untagged terminals for fingerprint patterns. Once matched, assigns a profile (e.g. `claude-code`) and hands off to the StateMachine.

3. **StateMachine** — Pure function: `(currentState, outputChunk, profileConfig) -> newState`. No side effects. Each profile defines regex patterns and transition rules. Easy to unit test with synthetic output.

4. **UIAdapter** — Listens for state changes, applies `ThemeIcon` + `ThemeColor` to the terminal tab. Maps states to colors.

5. **ConfigResolver** — Merges built-in profiles with user settings.

### Data flow

```
Terminal output
  -> TerminalWatcher (buffer)
  -> ProfileMatcher (tag)
  -> StateMachine (state transition)
  -> UIAdapter (update tab icon/color)
```

### Built-in Claude Code profile

```jsonc
{
  "fingerprint": "╭─── Claude Code v",
  "states": {
    "working": { "patterns": ["spinner status lines with timing"] },
    "blocked": { "patterns": ["^\\s*☐", "Enter to select\\s*·", "Enter to confirm", "Esc to cancel"] },
    "ready": { "onSpinnerClear": true },
    "suspended": { "onShellPrompt": true },
    "completion": { "titlePattern": "^✻\\s.+\\sfor\\s\\d+" }
  },
  "colors": {
    "working": "claude-pink",
    "ready": "green",
    "blocked": "orange",
    "suspended": "blue"
  }
}
```

## Configuration

### Settings

```jsonc
{
  // Master toggle
  "terminalReady.enabled": true,

  // Only show indicators on terminals matching a profile
  "terminalReady.mode": "matched-only",  // or "all"

  // Override the tab icon (any VS Code ThemeIcon name)
  "terminalReady.icon": "terminal",

  // Custom profiles (merged with built-ins)
  "terminalReady.profiles": {
    "aider": {
      "fingerprint": "Aider v",
      "states": { }
    }
  },

  // Override built-in colors
  "terminalReady.colors": {
    "working": "#d97706",
    "ready": "#22c55e"
  }
}
```

### Defaults

- Mode: `matched-only` (only Claude Code terminals get indicators)
- Built-in profile: Claude Code (auto-detected, zero config)

### Commands

- `Terminal Ready: Focus Next Ready Terminal` — jump to the next green terminal
- `Terminal Ready: Focus Next Blocked Terminal` — jump to the next orange terminal
- `Terminal Ready: Show Debug Info` — show current state of all tracked terminals

## Testing Strategy

### Unit tests (StateMachine)

- Feed synthetic terminal output chunks, assert state transitions
- Claude Code banner -> tagged + Ready
- Spinner output -> Working
- Spinner clears -> Ready
- Permission prompt (`☐`) -> Blocked
- Choice list + "Enter to select" -> Blocked
- Shell prompt after tagged -> Suspended
- Output resumes after Suspended -> Working

### Unit tests (ProfileMatcher)

- Fingerprint detection from partial/chunked output (banner may arrive across multiple data events)
- No false positives on output containing "Claude" without the banner

### Integration tests

- Mock terminal with Claude Code output, verify tab icon/color changes
- Terminal close -> Exited state

### Manual QA

- Real Claude Code sessions (not automated in v1)

## Scope

### In scope (v1)

- VS Code extension, TypeScript, no external dependencies
- Auto-detect Claude Code terminals via output fingerprinting
- 5 states: Working, Ready, Blocked, Suspended, Exited
- Colored tab icons, calm visual treatment
- `matched-only` mode by default
- Command palette: focus next ready/blocked terminal, debug info
- User-configurable profiles for other agents
- Unit tests for StateMachine and ProfileMatcher

### Out of scope (v1)

- Status bar summary
- Notifications/alerts on Blocked
- Sound/audio cues
- Generic shell idle detection (bash/zsh prompt matching)
- Cross-window aggregation
- Agent orchestration or auto-input
- Deep integration with Claude Code extension APIs

## Risks

- **Pattern changes across Claude Code versions.** Mitigation: patterns are user-configurable, and built-in profile ships updates with the extension.
- **Unpredictable output chunking from `onDidWriteTerminalData`.** Mitigation: ring buffer accumulates recent output; pattern matching runs against the buffer, not individual chunks.
