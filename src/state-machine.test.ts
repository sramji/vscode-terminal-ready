import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from './state-machine';
import { CLAUDE_CODE_PROFILE } from './profiles';
import { TerminalState } from './types';

const BANNER_RAW = '\x1b[38;2;255;153;51m╭───\x1b[1CClaude\x1b[1CCode\x1b[1C\x1b[38;2;153;153;153mv2.1.69\x1b[39m';
const TITLE_READY = '\x1b]0;✳ Claude Code\x07';
const TITLE_WORKING = '\x1b]0;⠂ Claude Code\x07';
const TITLE_EXITED = '\x1b]0;\x07';
const TITLE_SHELL = '\x1b]0;user@host: ~/projects\x07';
const TITLE_COMPLETION = '\x1b]0;✻ Sautéed for 7m 11s\x07';       // typical multi-unit duration
const TITLE_COMPLETION_SHORT = '\x1b]0;✻ Baked for 30s\x07';        // single-unit duration
const TITLE_COMPLETION_COST = '\x1b]0;✻ $0.42 for 3m 20s\x07';      // cost-prefixed variant

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine(CLAUDE_CODE_PROFILE);
  });

  describe('fingerprint detection', () => {
    it('starts as Untagged', () => {
      expect(sm.state).toBe(TerminalState.Untagged);
    });

    it('transitions to Ready when fingerprint is detected', () => {
      sm.processOutput(BANNER_RAW);
      expect(sm.isTagged).toBe(true);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('ignores output without fingerprint', () => {
      sm.processOutput('$ ls -la\ntotal 32\n');
      expect(sm.isTagged).toBe(false);
    });

    it('detects fingerprint split across chunks', () => {
      sm.processOutput('╭─── Claude');
      sm.processOutput(' Code v2.1.69 ───╮\n');
      expect(sm.isTagged).toBe(true);
    });
  });

  describe('window title detection', () => {
    beforeEach(() => {
      sm.processOutput(BANNER_RAW);
    });

    it('transitions to Working on spinner window title', () => {
      sm.processOutput(TITLE_WORKING);
      expect(sm.state).toBe(TerminalState.Working);
    });

    it('transitions to Ready on sparkle window title', () => {
      sm.processOutput(TITLE_WORKING);
      sm.processOutput(TITLE_READY);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('transitions to Exited on empty window title', () => {
      sm.processOutput(TITLE_EXITED);
      expect(sm.state).toBe(TerminalState.Exited);
    });

    it('transitions to Suspended on non-Claude window title', () => {
      sm.processOutput(TITLE_SHELL);
      expect(sm.state).toBe(TerminalState.Suspended);
    });

    it('resumes from Suspended to Ready on Claude banner', () => {
      sm.processOutput(TITLE_SHELL);
      expect(sm.state).toBe(TerminalState.Suspended);
      sm.processOutput(BANNER_RAW);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('handles multiple title changes in one chunk', () => {
      sm.processOutput(TITLE_WORKING + 'some output\n' + TITLE_READY);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('stays Working through silent periods', () => {
      sm.processOutput(TITLE_WORKING);
      // No further output — state persists
      expect(sm.state).toBe(TerminalState.Working);
    });
  });

  describe('blocked detection', () => {
    beforeEach(() => {
      sm.processOutput(BANNER_RAW);
    });

    it('transitions to Blocked on permission prompt', () => {
      sm.processOutput('☐ Allow Bash: git status?');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('transitions to Blocked on choice UI', () => {
      sm.processOutput('Enter to select · ↑/↓ to navigate');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('transitions from Blocked to Working on title change', () => {
      sm.processOutput('☐ Allow Bash?');
      sm.processOutput(TITLE_WORKING);
      expect(sm.state).toBe(TerminalState.Working);
    });

    it('transitions to Blocked on numbered choice footer', () => {
      sm.processOutput(' Esc to cancel · Tab to amend');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('does NOT transition to Blocked when ☐ appears mid-line in prose', () => {
      sm.processOutput(TITLE_READY);
      sm.processOutput('The ☐ character is used for checkboxes');
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('does NOT transition to Blocked when "Enter to select" appears without interpunct', () => {
      sm.processOutput(TITLE_READY);
      sm.processOutput('Press Enter to select an option');
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('transitions from Blocked to Ready on ⎿ result indicator', () => {
      sm.processOutput('☐ Allow Bash: git status?');
      expect(sm.state).toBe(TerminalState.Blocked);
      sm.processOutput('  ⎿  Permissions dialog dismissed');
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('stays Blocked when ⎿ and blocked pattern appear in same chunk', () => {
      sm.processOutput('☐ Allow Bash: git status?');
      expect(sm.state).toBe(TerminalState.Blocked);
      sm.processOutput('⎿ result\n☐ Allow Bash?');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('⎿ does not affect non-Blocked states', () => {
      sm.processOutput(TITLE_WORKING);
      sm.processOutput('⎿ tool result');
      expect(sm.state).toBe(TerminalState.Working);
    });
  });

  describe('exited state', () => {
    it('transitions to Exited via processExit()', () => {
      sm.processOutput(BANNER_RAW);
      sm.processExit();
      expect(sm.state).toBe(TerminalState.Exited);
    });
  });

  describe('completion title detection', () => {
    beforeEach(() => {
      sm.processOutput(BANNER_RAW);
    });

    it('Working → completion title → Ready (core bug case)', () => {
      sm.processOutput(TITLE_WORKING);
      sm.processOutput(TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('Ready → completion title → stays Ready', () => {
      sm.processOutput(TITLE_READY);
      sm.processOutput(TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('Blocked → completion title → Ready', () => {
      sm.processOutput('☐ Allow Bash?');
      sm.processOutput(TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('Exited → completion title → stays Exited', () => {
      sm.processExit();
      sm.processOutput(TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Exited);
    });

    it('matches typical multi-unit duration "✻ Sautéed for 7m 11s"', () => {
      sm.processOutput(TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('matches single-unit duration "✻ Baked for 30s"', () => {
      sm.processOutput(TITLE_COMPLETION_SHORT);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('matches "✻ $0.42 for 3m 20s"', () => {
      sm.processOutput(TITLE_COMPLETION_COST);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('does NOT match "✻" alone → Suspended', () => {
      sm.processOutput('\x1b]0;✻\x07');
      expect(sm.state).toBe(TerminalState.Suspended);
    });

    it('does NOT match "✻ something" without duration → Suspended', () => {
      sm.processOutput('\x1b]0;✻ something\x07');
      expect(sm.state).toBe(TerminalState.Suspended);
    });

    it('shell title still → Suspended', () => {
      sm.processOutput(TITLE_SHELL);
      expect(sm.state).toBe(TerminalState.Suspended);
    });

    it('completion title + blocked pattern in same chunk → Blocked wins', () => {
      sm.processOutput(TITLE_COMPLETION + '☐ Allow Bash?');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('shell title + completion title in same chunk → Ready', () => {
      sm.processOutput(TITLE_SHELL + 'some output\n' + TITLE_COMPLETION);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('profile without completionTitlePattern → completion title classified as Suspended', () => {
      const profileNoCompletion = { ...CLAUDE_CODE_PROFILE, completionTitlePattern: undefined };
      const smNoCompletion = new StateMachine(profileNoCompletion);
      smNoCompletion.processOutput(BANNER_RAW);
      smNoCompletion.processOutput(TITLE_COMPLETION);
      expect(smNoCompletion.state).toBe(TerminalState.Suspended);
    });
  });
});
