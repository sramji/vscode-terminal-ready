import { describe, it, expect } from 'vitest';
import { CLAUDE_CODE_PROFILE } from './profiles';

describe('CLAUDE_CODE_PROFILE', () => {
  it('has the correct fingerprint', () => {
    expect('╭─── Claude Code v2.1.69 ───').toContain(CLAUDE_CODE_PROFILE.fingerprint);
  });

  it('detects working state via hint text', () => {
    const workingLines = [
      'esc to interrupt',
      '  esc to interrupt',
      'esc  to  interrupt',
    ];
    for (const line of workingLines) {
      const matches = CLAUDE_CODE_PROFILE.workingPatterns.some(p => p.test(line));
      expect(matches, `should match working: "${line}"`).toBe(true);
    }
  });

  it('does not match regular output as working', () => {
    const nonWorking = [
      'Hello, how can I help?',
      'explorer.exe /tmp',
      '? for shortcuts',
      'bypass permissions on',
    ];
    for (const line of nonWorking) {
      const matches = CLAUDE_CODE_PROFILE.workingPatterns.some(p => p.test(line));
      expect(matches, `should NOT match working: "${line}"`).toBe(false);
    }
  });

  it('detects blocked patterns', () => {
    const blockedLines = [
      '☐ Allow Bash: git status?',
      'Enter to select · ↑/↓ to navigate · Esc to cancel',
      'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
      'Enter to confirm',
    ];
    for (const line of blockedLines) {
      const matches = CLAUDE_CODE_PROFILE.blockedPatterns.some(p => p.test(line));
      expect(matches, `should match blocked: "${line}"`).toBe(true);
    }
  });

  it('ready is detected by absence of working (via tick), not a pattern', () => {
    // The readyPattern exists as an optional hint but the primary mechanism
    // is the idle timeout in StateMachine. This is tested in state-machine.test.ts.
    expect(CLAUDE_CODE_PROFILE.readyDebounceMs).toBeGreaterThan(0);
  });
});
