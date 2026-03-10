import { ProfileConfig, TerminalState } from './types';

export const CLAUDE_CODE_PROFILE: ProfileConfig = {
  name: 'Claude Code',
  fingerprint: 'Claude Code',
  workingPatterns: [
    /esc\s*to\s*interrupt/,
  ],
  blockedPatterns: [
    /^\s*☐/,                    // Permission prompt (☐ at line start)
    /Enter to select\s*·/,      // Choice UI (always followed by · keybinding hints)
    /Enter to confirm/,         // Confirmation prompt
    /Esc to cancel\s*·/,        // Choice/approval UI footer (numbered choice UI)
  ],
  readyPattern: /❯\s*$/,
  readyDebounceMs: 3000,
  unblockedPatterns: [
    /⎿/,  // Slash command result indicator — dialog completed
  ],
  // Matches Claude Code completion summary titles, e.g. "✻ Sautéed for 7m 11s", "✻ $0.42 for 3m 20s".
  // ✻ (U+273B) is distinct from ✳ (U+2733) used in the Ready title "✳ Claude Code".
  completionTitlePattern: /^✻\s.+\sfor\s\d+/,
  indicators: {
    [TerminalState.Working]: '🦀',
    [TerminalState.Ready]: '🟢',
    [TerminalState.Blocked]: '🟠',
    [TerminalState.Suspended]: '🔵',
    [TerminalState.Exited]: '⚪',
  },
};
