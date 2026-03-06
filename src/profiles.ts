import { ProfileConfig, TerminalState } from './types';

export const CLAUDE_CODE_PROFILE: ProfileConfig = {
  name: 'Claude Code',
  fingerprint: 'Claude Code',
  workingPatterns: [
    /esc\s*to\s*interrupt/,
  ],
  blockedPatterns: [
    /☐/,
    /Enter to select/,
    /Enter to confirm/,
  ],
  readyPattern: /❯\s*$/,
  readyDebounceMs: 3000,
  indicators: {
    [TerminalState.Working]: '🦀',
    [TerminalState.Ready]: '🟢',
    [TerminalState.Blocked]: '🟠',
    [TerminalState.Suspended]: '🔵',
    [TerminalState.Exited]: '⚪',
  },
};
