import { describe, it, expect } from 'vitest';
import { ProfileMatcher } from './profile-matcher';
import { CLAUDE_CODE_PROFILE } from './profiles';

describe('ProfileMatcher', () => {
  it('returns null for unrecognized output', () => {
    const matcher = new ProfileMatcher([CLAUDE_CODE_PROFILE]);
    expect(matcher.match('$ ls -la\ntotal 32\n')).toBeNull();
  });

  it('returns Claude Code profile when fingerprint is found', () => {
    const matcher = new ProfileMatcher([CLAUDE_CODE_PROFILE]);
    const result = matcher.match('╭─── Claude Code v2.1.69 ───╮\n');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Claude Code');
  });

  it('matches fingerprint in the middle of output', () => {
    const matcher = new ProfileMatcher([CLAUDE_CODE_PROFILE]);
    const result = matcher.match('some preamble\n╭─── Claude Code v2.1.69 ───╮\nmore stuff');
    expect(result).not.toBeNull();
  });

  it('returns the first matching profile', () => {
    const fakeProfile = {
      ...CLAUDE_CODE_PROFILE,
      name: 'Fake Agent',
      fingerprint: 'FAKE_AGENT_START',
    };
    const matcher = new ProfileMatcher([fakeProfile, CLAUDE_CODE_PROFILE]);
    const result = matcher.match('╭─── Claude Code v2.1.69 ───╮\n');
    expect(result!.name).toBe('Claude Code');
  });
});
