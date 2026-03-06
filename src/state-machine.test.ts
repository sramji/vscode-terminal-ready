import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from './state-machine';
import { CLAUDE_CODE_PROFILE } from './profiles';
import { TerminalState } from './types';

const BANNER_RAW = '\x1b[38;2;255;153;51m╭───\x1b[1CClaude\x1b[1CCode\x1b[1C\x1b[38;2;153;153;153mv2.1.69\x1b[39m';
const TITLE_READY = '\x1b]0;✳ Claude Code\x07';
const TITLE_WORKING = '\x1b]0;⠂ Claude Code\x07';
const TITLE_EXITED = '\x1b]0;\x07';
const TITLE_SHELL = '\x1b]0;user@host: ~/projects\x07';

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
  });

  describe('exited state', () => {
    it('transitions to Exited via processExit()', () => {
      sm.processOutput(BANNER_RAW);
      sm.processExit();
      expect(sm.state).toBe(TerminalState.Exited);
    });
  });
});
