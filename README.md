# terminal-ready

A VS Code extension that shows per-terminal ready/idle status indicators, so you can see at a glance which terminals need your attention.

## Problem

When running 3-6+ long-lived terminals in a single VS Code window (Claude Code agents, test runners, dev servers, REPLs), there's no way to tell which ones are waiting for input without clicking each tab. This creates polling overhead and cognitive load, especially in multi-agent coding workflows.

VS Code's built-in terminal tab icons only cover tasks (spinner, success/failure) — there is no generic "shell is idle / ready for input" signal.

## What exists today

- **VS Code built-in**: Terminal tab status icons are tied to tasks and exit codes, not shell idle state. Settings like auto-replies and confirm-on-exit don't provide visual indicators.
- **Existing extensions**: Sidebar terminals, tool-specific progress indicators, and Claude Code's status bar progress — none provide a per-terminal ready/idle badge across all terminals.
- **Cursor / agent-native IDEs**: Cursor has agent/session status in chat panels but not per-terminal indicators. VS Code's experimental agent status indicator shows in-progress/unread badges at the session level, not per-terminal.
- **Third-party agent IDEs**: Projects like PATAPIM use color-coded terminal grids (red = AI working, green = needs input) — the closest prior art to what we're building, but not VS Code extensions.

## Approach

### Terminal states (v1)

| State | Meaning |
|-------|---------|
| **Running** | Process is actively producing output or a command is in progress |
| **Ready** | Process is idle and prompt is visible; waiting for user input |
| **Exited** | Shell or process has exited |

### Readiness detection

Detection is based on terminal output stream analysis (`onDidWriteTerminalData`), not OS-level signals:

1. **Prompt regex** (primary) — match the last line against a configurable pattern, with a short debounce (`idleDelayMs`). Per-profile patterns let you target Claude Code, zsh, bash, Python REPL, etc.
2. **Idle timeout** (fallback) — if no prompt pattern is configured, transition to "ready" after N seconds of silence.
3. **Explicit markers** (optional) — user-defined regex for tools that can print `[AGENT READY]` or similar.

### UI indicators

- Colored dot or icon on terminal tabs (green = ready, yellow = running, grey = exited)
- Fallback: prefix terminal name with indicator if API doesn't support tab icons
- Optional status bar summary ("Terminals: 2 ready, 3 running")
- Command palette: "Focus next ready terminal", toggle indicators, debug info

### Configuration

```jsonc
// Settings (illustrative)
"terminalReady.indicators.enabled": true,
"terminalReady.idleDelayMs": 300,
"terminalReady.defaultIdleTimeoutMs": 3000,
"terminalReady.profiles": {
  "Claude Code": {
    "promptPattern": "\\$\\s*$",
    "idleDelayMs": 200
  },
  "zsh": {
    "promptPattern": ".*%\\s*$"
  }
}
```

### Architecture

- **TerminalManager** — listens to terminal lifecycle and output events, maintains per-terminal state
- **StateMachine** — pure logic: config + buffer + timestamps -> state transitions (easily testable)
- **UIAdapter** — applies state to terminal tab icons/names
- **ConfigResolver** — resolves per-terminal config from profile name/env

## Scope

**In scope (v1):**
- VS Code extension, no server component
- Integrated terminals only (panel and editor)
- Visual readiness indicator; no auto-input or automation
- Configurable heuristics

**Out of scope (v1):**
- Agent orchestration or job scheduling
- Deep integration with specific tool APIs (detection is output-based only)
- Cross-window or cross-machine aggregation
- Error/attention states (e.g. nonzero exit, ERROR pattern) — candidate for v2

## Success criteria

With 3-6 Claude Code terminals open, you can:
- See at a glance which are ready for input
- Navigate to the next ready terminal via command or click
- Trust the indicator most of the time (low false positives/negatives with custom promptPattern)
- Notice no perceptible lag or UI jank

## Development

This project is developed using [superpowers](https://github.com/obra/superpowers), an agentic development framework that enforces structured brainstorming, planning, TDD, and code review phases.

## License

MIT
