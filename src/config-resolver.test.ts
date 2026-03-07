import { describe, it, expect } from 'vitest';
import { ConfigResolver } from './config-resolver';

describe('ConfigResolver', () => {
  it('returns built-in profiles when no user config', () => {
    const resolver = new ConfigResolver();
    const profiles = resolver.getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Claude Code');
  });

  it('returns enabled=true by default', () => {
    const resolver = new ConfigResolver();
    expect(resolver.isEnabled()).toBe(true);
  });

  it('returns matched-only mode by default', () => {
    const resolver = new ConfigResolver();
    expect(resolver.getMode()).toBe('matched-only');
  });

  it('returns default icon', () => {
    const resolver = new ConfigResolver();
    expect(resolver.getIcon()).toBe('terminal');
  });

  it('returns color map with defaults', () => {
    const resolver = new ConfigResolver();
    const colors = resolver.getColors();
    expect(colors.working).toBeDefined();
    expect(colors.ready).toBeDefined();
    expect(colors.blocked).toBeDefined();
    expect(colors.suspended).toBeDefined();
    expect(colors.exited).toBeDefined();
  });
});
