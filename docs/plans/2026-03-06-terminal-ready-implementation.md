# Terminal Ready Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VS Code extension that auto-detects Claude Code terminals and shows colored tab icons for Working/Ready/Blocked/Suspended/Exited states.

**Architecture:** Profile-driven regex detection on terminal output streams. TerminalWatcher buffers output, ProfileMatcher fingerprints terminals, StateMachine computes state transitions, UIAdapter applies tab colors. All detection is output-only — no input observation.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.window.onDidWriteTerminalData`, `Terminal.iconPath`, `ThemeIcon`, `ThemeColor`), Vitest for unit tests, `@vscode/test-electron` for integration tests.

**Design doc:** `docs/plans/2026-03-06-terminal-ready-design.md`

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/extension.ts`
- Create: `.vscodeignore`
- Create: `.gitignore`
- Create: `vitest.config.ts`

**Step 1: Scaffold the VS Code extension**

```bash
npm init -y
```

Edit `package.json` to be a VS Code extension:

```json
{
  "name": "terminal-ready",
  "displayName": "Terminal Ready",
  "description": "Per-terminal ready/idle status indicators for Claude Code",
  "version": "0.1.0",
  "publisher": "terminal-ready",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "configuration": {
      "title": "Terminal Ready",
      "properties": {
        "terminalReady.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable terminal ready indicators"
        },
        "terminalReady.mode": {
          "type": "string",
          "enum": ["matched-only", "all"],
          "default": "matched-only",
          "description": "Show indicators on all terminals or only matched profiles"
        },
        "terminalReady.icon": {
          "type": "string",
          "default": "terminal",
          "description": "ThemeIcon name for terminal tabs"
        }
      }
    },
    "commands": [
      {
        "command": "terminalReady.focusNextReady",
        "title": "Terminal Ready: Focus Next Ready Terminal"
      },
      {
        "command": "terminalReady.focusNextBlocked",
        "title": "Terminal Ready: Focus Next Blocked Terminal"
      },
      {
        "command": "terminalReady.showDebugInfo",
        "title": "Terminal Ready: Show Debug Info"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 4: Create minimal extension entry point**

`src/extension.ts`:
```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // TODO: wire up components
}

export function deactivate() {}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.vsix
.vscode-test/
```

**Step 6: Create .vscodeignore**

```
src/
**/*.test.ts
vitest.config.ts
tsconfig.json
.gitignore
```

**Step 7: Install dependencies and verify compilation**

```bash
npm install
npx tsc --noEmit
```

Expected: clean compilation, no errors.

**Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/extension.ts .gitignore .vscodeignore
git commit -m "feat: scaffold VS Code extension with TypeScript and Vitest"
```

---

## Task 1: RingBuffer

A simple ring buffer to accumulate recent terminal output. Pattern matching runs against this buffer rather than individual output chunks (which arrive in unpredictable sizes).

**Files:**
- Create: `src/ring-buffer.ts`
- Create: `src/ring-buffer.test.ts`

**Step 1: Write the failing tests**

`src/ring-buffer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('stores appended text', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello');
    expect(buf.toString()).toBe('hello');
  });

  it('concatenates multiple appends', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello ');
    buf.append('world');
    expect(buf.toString()).toBe('hello world');
  });

  it('drops oldest content when exceeding capacity', () => {
    const buf = new RingBuffer(10);
    buf.append('abcdefghij'); // fills exactly
    buf.append('XYZ');        // should drop 'abc'
    expect(buf.toString()).toBe('defghijXYZ');
  });

  it('handles appends larger than capacity', () => {
    const buf = new RingBuffer(5);
    buf.append('abcdefghij');
    expect(buf.toString()).toBe('fghij');
  });

  it('clears the buffer', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello');
    buf.clear();
    expect(buf.toString()).toBe('');
  });

  it('returns the last N characters', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello world');
    expect(buf.last(5)).toBe('world');
  });

  it('contains() checks for substring presence', () => {
    const buf = new RingBuffer(1024);
    buf.append('╭─── Claude Code v2.1.69');
    expect(buf.contains('Claude Code v')).toBe(true);
    expect(buf.contains('Aider')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/ring-buffer.test.ts
```

Expected: FAIL — module `./ring-buffer` not found.

**Step 3: Implement RingBuffer**

`src/ring-buffer.ts`:
```typescript
export class RingBuffer {
  private buf = '';
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  append(text: string): void {
    this.buf += text;
    if (this.buf.length > this.capacity) {
      this.buf = this.buf.slice(this.buf.length - this.capacity);
    }
  }

  toString(): string {
    return this.buf;
  }

  last(n: number): string {
    return this.buf.slice(-n);
  }

  contains(substring: string): boolean {
    return this.buf.includes(substring);
  }

  clear(): void {
    this.buf = '';
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ring-buffer.test.ts
```

Expected: all 7 tests PASS.

**Step 5: Commit**

```bash
git add src/ring-buffer.ts src/ring-buffer.test.ts
git commit -m "feat: add RingBuffer for terminal output accumulation"
```

---

## Task 2: Types and Profile Config

Define the shared types and the built-in Claude Code profile.

**Files:**
- Create: `src/types.ts`
- Create: `src/profiles.ts`
- Create: `src/profiles.test.ts`

**Step 1: Create types**

`src/types.ts`:
```typescript
export enum TerminalState {
  Untagged = 'untagged',
  Working = 'working',
  Ready = 'ready',
  Blocked = 'blocked',
  Suspended = 'suspended',
  Exited = 'exited',
}

export interface ProfileConfig {
  /** Display name for the profile */
  name: string;
  /** String to detect in terminal output to tag this terminal */
  fingerprint: string;
  /** Patterns that indicate the agent is actively working */
  workingPatterns: RegExp[];
  /** Patterns that indicate the agent is blocked waiting for user input */
  blockedPatterns: RegExp[];
  /**
   * Pattern that indicates the agent is ready (idle prompt).
   * Ready is detected when this pattern matches AND no workingPatterns
   * have matched recently (within readyDebounceMs).
   */
  readyPattern: RegExp;
  /** Debounce in ms before transitioning to Ready after spinner clears */
  readyDebounceMs: number;
  /** Pattern for detecting shell prompt (to identify Suspended state) */
  shellPromptPattern?: RegExp;
}

export interface TerminalInfo {
  state: TerminalState;
  profileName: string | null;
  lastOutputTime: number;
  lastSpinnerTime: number;
}
```

**Step 2: Write the failing test for the Claude Code profile**

`src/profiles.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { CLAUDE_CODE_PROFILE } from './profiles';

describe('CLAUDE_CODE_PROFILE', () => {
  it('has the correct fingerprint', () => {
    expect('╭─── Claude Code v2.1.69 ───').toContain(CLAUDE_CODE_PROFILE.fingerprint);
  });

  it('detects spinner working patterns', () => {
    const spinnerLines = [
      '✽ Osmosing… (40s · ↓ 915 tokens · thinking)',
      '· Considering… (1m 17s · ↓ 2.2k tokens · thinking)',
      '* Osmosing… (54s · ↓ 1.5k tokens)',
    ];
    for (const line of spinnerLines) {
      const matches = CLAUDE_CODE_PROFILE.workingPatterns.some(p => p.test(line));
      expect(matches, `should match working: "${line}"`).toBe(true);
    }
  });

  it('does not match regular output as working', () => {
    const nonSpinner = [
      'Hello, how can I help?',
      'explorer.exe /tmp',
      '❯  ',
    ];
    for (const line of nonSpinner) {
      const matches = CLAUDE_CODE_PROFILE.workingPatterns.some(p => p.test(line));
      expect(matches, `should NOT match working: "${line}"`).toBe(false);
    }
  });

  it('detects blocked patterns', () => {
    const blockedLines = [
      '☐ Allow Bash: git status?',
      'Enter to select · ↑/↓ to navigate · Esc to cancel',
      'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
    ];
    for (const line of blockedLines) {
      const matches = CLAUDE_CODE_PROFILE.blockedPatterns.some(p => p.test(line));
      expect(matches, `should match blocked: "${line}"`).toBe(true);
    }
  });

  it('detects ready pattern', () => {
    expect(CLAUDE_CODE_PROFILE.readyPattern.test('❯  ')).toBe(true);
    expect(CLAUDE_CODE_PROFILE.readyPattern.test('❯ ')).toBe(true);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run src/profiles.test.ts
```

Expected: FAIL — module not found.

**Step 4: Implement profiles**

`src/profiles.ts`:
```typescript
import { ProfileConfig } from './types';

export const CLAUDE_CODE_PROFILE: ProfileConfig = {
  name: 'Claude Code',
  fingerprint: '╭─── Claude Code v',
  workingPatterns: [
    // Spinner status lines: ✽ Osmosing… (40s · ↓ 915 tokens · thinking)
    /[✽·*✦⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] .+…/,
  ],
  blockedPatterns: [
    // Tool permission prompts
    /☐/,
    // Multiple choice / question UI
    /Enter to select/,
  ],
  readyPattern: /❯\s+$/,
  readyDebounceMs: 200,
};
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/profiles.test.ts
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/types.ts src/profiles.ts src/profiles.test.ts
git commit -m "feat: add types and built-in Claude Code profile"
```

---

## Task 3: StateMachine

The core logic — pure function that takes current state + output and returns new state.

**Files:**
- Create: `src/state-machine.ts`
- Create: `src/state-machine.test.ts`

**Step 1: Write the failing tests**

`src/state-machine.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from './state-machine';
import { CLAUDE_CODE_PROFILE } from './profiles';
import { TerminalState } from './types';

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
      sm.processOutput('╭─── Claude Code v2.1.69 ────────────────╮\n');
      expect(sm.isTagged).toBe(true);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('ignores output without fingerprint', () => {
      sm.processOutput('$ ls -la\ntotal 32\n');
      expect(sm.isTagged).toBe(false);
      expect(sm.state).toBe(TerminalState.Untagged);
    });

    it('detects fingerprint split across chunks', () => {
      sm.processOutput('╭─── Claude');
      sm.processOutput(' Code v2.1.69 ───╮\n');
      expect(sm.isTagged).toBe(true);
    });
  });

  describe('state transitions (after tagging)', () => {
    beforeEach(() => {
      sm.processOutput('╭─── Claude Code v2.1.69 ───╮\n');
      // Now in Ready state
    });

    it('transitions to Working on spinner output', () => {
      sm.processOutput('✽ Osmosing… (40s · ↓ 915 tokens · thinking)');
      expect(sm.state).toBe(TerminalState.Working);
    });

    it('transitions to Ready when spinner clears and prompt appears', () => {
      sm.processOutput('✽ Osmosing… (40s · ↓ 915 tokens · thinking)');
      expect(sm.state).toBe(TerminalState.Working);
      // Simulate spinner clearing and prompt appearing
      sm.processOutput('\x1b[2K\n❯  ');
      // Need to advance time past debounce
      sm.tick(250);
      expect(sm.state).toBe(TerminalState.Ready);
    });

    it('stays Working if new spinner output appears within debounce', () => {
      sm.processOutput('✽ Osmosing… (40s · ↓ 915 tokens)');
      sm.processOutput('\x1b[2K\n❯  ');
      // Before debounce expires, new spinner
      sm.processOutput('· Considering… (1m · ↓ 2k tokens)');
      sm.tick(250);
      expect(sm.state).toBe(TerminalState.Working);
    });

    it('transitions to Blocked on permission prompt', () => {
      sm.processOutput('☐ Allow Bash: git status?');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('transitions to Blocked on choice UI', () => {
      sm.processOutput('Enter to select · ↑/↓ to navigate · Esc to cancel');
      expect(sm.state).toBe(TerminalState.Blocked);
    });

    it('transitions from Blocked back to Working on new output', () => {
      sm.processOutput('☐ Allow Bash: git status?');
      expect(sm.state).toBe(TerminalState.Blocked);
      sm.processOutput('✽ Running… (2s · ↓ 100 tokens)');
      expect(sm.state).toBe(TerminalState.Working);
    });
  });

  describe('suspended state', () => {
    beforeEach(() => {
      sm.processOutput('╭─── Claude Code v2.1.69 ───╮\n');
    });

    it('transitions to Suspended when shell prompt appears', () => {
      sm.processShellDetected();
      expect(sm.state).toBe(TerminalState.Suspended);
    });

    it('transitions from Suspended back to Working when Claude resumes', () => {
      sm.processShellDetected();
      expect(sm.state).toBe(TerminalState.Suspended);
      sm.processOutput('✽ Resuming… (1s)');
      expect(sm.state).toBe(TerminalState.Working);
    });

    it('transitions from Suspended to Ready when Claude banner reappears', () => {
      sm.processShellDetected();
      sm.processOutput('╭─── Claude Code v2.1.69 ───╮\n');
      expect(sm.state).toBe(TerminalState.Ready);
    });
  });

  describe('exited state', () => {
    it('transitions to Exited', () => {
      sm.processOutput('╭─── Claude Code v2.1.69 ───╮\n');
      sm.processExit();
      expect(sm.state).toBe(TerminalState.Exited);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/state-machine.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement StateMachine**

`src/state-machine.ts`:
```typescript
import { ProfileConfig, TerminalState } from './types';
import { RingBuffer } from './ring-buffer';

export class StateMachine {
  private _state: TerminalState = TerminalState.Untagged;
  private _isTagged = false;
  private readonly buffer: RingBuffer;
  private readonly profile: ProfileConfig;
  private lastSpinnerTime = 0;
  private pendingReady = false;
  private pendingReadySince = 0;

  constructor(profile: ProfileConfig) {
    this.profile = profile;
    this.buffer = new RingBuffer(4096);
  }

  get state(): TerminalState {
    return this._state;
  }

  get isTagged(): boolean {
    return this._isTagged;
  }

  processOutput(chunk: string): void {
    this.buffer.append(chunk);

    // Check fingerprint if not yet tagged
    if (!this._isTagged) {
      if (this.buffer.contains(this.profile.fingerprint)) {
        this._isTagged = true;
        this._state = TerminalState.Ready;
      }
      return;
    }

    // Already tagged — check state transitions
    const lines = chunk.split('\n');
    for (const line of lines) {
      // Check blocked patterns first (highest priority)
      if (this.profile.blockedPatterns.some(p => p.test(line))) {
        this._state = TerminalState.Blocked;
        this.pendingReady = false;
        return;
      }

      // Check working patterns
      if (this.profile.workingPatterns.some(p => p.test(line))) {
        this._state = TerminalState.Working;
        this.lastSpinnerTime = Date.now();
        this.pendingReady = false;
        return;
      }

      // Check ready pattern
      if (this.profile.readyPattern.test(line)) {
        if (this._state === TerminalState.Working) {
          // Start debounce — don't go Ready immediately
          this.pendingReady = true;
          this.pendingReadySince = Date.now();
        } else if (this._state === TerminalState.Suspended) {
          // Returning from suspend — go to Ready
          this._state = TerminalState.Ready;
          this.pendingReady = false;
        }
      }
    }

    // If in Suspended and we see Claude output (fingerprint again), go Ready
    if (this._state === TerminalState.Suspended && this.buffer.contains(this.profile.fingerprint)) {
      // Re-check: did we just see the fingerprint in this chunk?
      if (chunk.includes(this.profile.fingerprint)) {
        this._state = TerminalState.Ready;
      }
    }
  }

  /**
   * Call periodically to resolve debounced transitions.
   * @param elapsedMs - milliseconds since last call (or since pending started)
   */
  tick(elapsedMs?: number): void {
    if (this.pendingReady) {
      const now = elapsedMs !== undefined
        ? this.pendingReadySince + elapsedMs
        : Date.now();
      if (now - this.pendingReadySince >= this.profile.readyDebounceMs) {
        this._state = TerminalState.Ready;
        this.pendingReady = false;
      }
    }
  }

  processShellDetected(): void {
    if (this._isTagged && this._state !== TerminalState.Exited) {
      this._state = TerminalState.Suspended;
      this.pendingReady = false;
    }
  }

  processExit(): void {
    this._state = TerminalState.Exited;
    this.pendingReady = false;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/state-machine.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/state-machine.ts src/state-machine.test.ts
git commit -m "feat: add StateMachine with state transitions and debounce"
```

---

## Task 4: ProfileMatcher

Watches untagged terminals and assigns profiles based on fingerprints.

**Files:**
- Create: `src/profile-matcher.ts`
- Create: `src/profile-matcher.test.ts`

**Step 1: Write the failing tests**

`src/profile-matcher.test.ts`:
```typescript
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
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/profile-matcher.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement ProfileMatcher**

`src/profile-matcher.ts`:
```typescript
import { ProfileConfig } from './types';

export class ProfileMatcher {
  private readonly profiles: ProfileConfig[];

  constructor(profiles: ProfileConfig[]) {
    this.profiles = profiles;
  }

  match(output: string): ProfileConfig | null {
    for (const profile of this.profiles) {
      if (output.includes(profile.fingerprint)) {
        return profile;
      }
    }
    return null;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/profile-matcher.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/profile-matcher.ts src/profile-matcher.test.ts
git commit -m "feat: add ProfileMatcher for fingerprint-based terminal tagging"
```

---

## Task 5: ConfigResolver

Merges built-in profiles with user settings.

**Files:**
- Create: `src/config-resolver.ts`
- Create: `src/config-resolver.test.ts`

**Step 1: Write the failing tests**

`src/config-resolver.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ConfigResolver } from './config-resolver';
import { CLAUDE_CODE_PROFILE } from './profiles';

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
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/config-resolver.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement ConfigResolver**

`src/config-resolver.ts`:
```typescript
import { ProfileConfig } from './types';
import { CLAUDE_CODE_PROFILE } from './profiles';

export interface ColorMap {
  working: string;
  ready: string;
  blocked: string;
  suspended: string;
  exited: string;
}

const DEFAULT_COLORS: ColorMap = {
  working: 'terminal.ansiMagenta',
  ready: 'terminal.ansiGreen',
  blocked: 'terminal.ansiYellow',
  suspended: 'terminal.ansiBlue',
  exited: 'disabledForeground',
};

export class ConfigResolver {
  private builtInProfiles: ProfileConfig[] = [CLAUDE_CODE_PROFILE];

  getProfiles(): ProfileConfig[] {
    // TODO: merge with user-configured profiles from VS Code settings
    return [...this.builtInProfiles];
  }

  isEnabled(): boolean {
    // TODO: read from vscode.workspace.getConfiguration('terminalReady')
    return true;
  }

  getMode(): 'matched-only' | 'all' {
    // TODO: read from vscode.workspace.getConfiguration('terminalReady')
    return 'matched-only';
  }

  getIcon(): string {
    // TODO: read from vscode.workspace.getConfiguration('terminalReady')
    return 'terminal';
  }

  getColors(): ColorMap {
    // TODO: merge with user overrides from vscode.workspace.getConfiguration('terminalReady')
    return { ...DEFAULT_COLORS };
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/config-resolver.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/config-resolver.ts src/config-resolver.test.ts
git commit -m "feat: add ConfigResolver with defaults and built-in Claude Code profile"
```

---

## Task 6: UIAdapter

Maps terminal states to VS Code tab icons and colors.

**Files:**
- Create: `src/ui-adapter.ts`

This component interacts directly with VS Code APIs (`Terminal.iconPath`, `ThemeIcon`, `ThemeColor`), so it's tested via integration tests rather than unit tests. The implementation is thin — it just maps state to icon/color.

**Step 1: Implement UIAdapter**

`src/ui-adapter.ts`:
```typescript
import * as vscode from 'vscode';
import { TerminalState } from './types';
import { ColorMap } from './config-resolver';

export class UIAdapter {
  private readonly icon: string;
  private readonly colors: ColorMap;

  constructor(icon: string, colors: ColorMap) {
    this.icon = icon;
    this.colors = colors;
  }

  applyState(terminal: vscode.Terminal, state: TerminalState): void {
    if (state === TerminalState.Untagged) {
      return; // Don't modify untagged terminals
    }

    const colorId = this.getColorId(state);
    terminal.iconPath = new vscode.ThemeIcon(
      this.icon,
      new vscode.ThemeColor(colorId),
    );
  }

  private getColorId(state: TerminalState): string {
    switch (state) {
      case TerminalState.Working:
        return this.colors.working;
      case TerminalState.Ready:
        return this.colors.ready;
      case TerminalState.Blocked:
        return this.colors.blocked;
      case TerminalState.Suspended:
        return this.colors.suspended;
      case TerminalState.Exited:
        return this.colors.exited;
      default:
        return this.colors.exited;
    }
  }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/ui-adapter.ts
git commit -m "feat: add UIAdapter to map terminal states to tab icon colors"
```

---

## Task 7: TerminalWatcher

The orchestrator — listens to terminal events, wires up ProfileMatcher + StateMachine + UIAdapter per terminal.

**Files:**
- Create: `src/terminal-watcher.ts`

**Step 1: Implement TerminalWatcher**

`src/terminal-watcher.ts`:
```typescript
import * as vscode from 'vscode';
import { TerminalState } from './types';
import { StateMachine } from './state-machine';
import { ProfileMatcher } from './profile-matcher';
import { UIAdapter } from './ui-adapter';
import { ConfigResolver } from './config-resolver';
import { RingBuffer } from './ring-buffer';

interface TrackedTerminal {
  terminal: vscode.Terminal;
  buffer: RingBuffer;
  stateMachine: StateMachine | null;
  tickInterval: ReturnType<typeof setInterval> | null;
}

export class TerminalWatcher implements vscode.Disposable {
  private readonly tracked = new Map<vscode.Terminal, TrackedTerminal>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly profileMatcher: ProfileMatcher;
  private readonly uiAdapter: UIAdapter;
  private readonly config: ConfigResolver;

  constructor(config: ConfigResolver) {
    this.config = config;
    this.profileMatcher = new ProfileMatcher(config.getProfiles());
    this.uiAdapter = new UIAdapter(config.getIcon(), config.getColors());

    // Watch existing terminals
    for (const terminal of vscode.window.terminals) {
      this.trackTerminal(terminal);
    }

    // Watch new terminals
    this.disposables.push(
      vscode.window.onDidOpenTerminal(t => this.trackTerminal(t)),
    );

    // Watch terminal close
    this.disposables.push(
      vscode.window.onDidCloseTerminal(t => this.handleClose(t)),
    );

    // Watch terminal output
    this.disposables.push(
      vscode.window.onDidWriteTerminalData(e => this.handleOutput(e)),
    );
  }

  getState(terminal: vscode.Terminal): TerminalState {
    const tracked = this.tracked.get(terminal);
    if (!tracked) return TerminalState.Untagged;
    return tracked.stateMachine?.state ?? TerminalState.Untagged;
  }

  getTrackedTerminals(): Map<vscode.Terminal, TerminalState> {
    const result = new Map<vscode.Terminal, TerminalState>();
    for (const [terminal, tracked] of this.tracked) {
      result.set(terminal, tracked.stateMachine?.state ?? TerminalState.Untagged);
    }
    return result;
  }

  private trackTerminal(terminal: vscode.Terminal): void {
    if (this.tracked.has(terminal)) return;
    this.tracked.set(terminal, {
      terminal,
      buffer: new RingBuffer(8192),
      stateMachine: null,
      tickInterval: null,
    });
  }

  private handleOutput(event: vscode.TerminalDataWriteEvent): void {
    const tracked = this.tracked.get(event.terminal);
    if (!tracked) return;

    tracked.buffer.append(event.data);

    // If not yet tagged, try to match a profile
    if (!tracked.stateMachine) {
      const profile = this.profileMatcher.match(tracked.buffer.toString());
      if (profile) {
        tracked.stateMachine = new StateMachine(profile);
        // Feed the entire buffer so the state machine sees the fingerprint
        tracked.stateMachine.processOutput(tracked.buffer.toString());
        // Start tick interval for debounce
        tracked.tickInterval = setInterval(() => {
          const prevState = tracked.stateMachine!.state;
          tracked.stateMachine!.tick();
          if (tracked.stateMachine!.state !== prevState) {
            this.uiAdapter.applyState(event.terminal, tracked.stateMachine!.state);
          }
        }, 100);
        this.uiAdapter.applyState(event.terminal, tracked.stateMachine.state);
      }
      return;
    }

    // Already tagged — process output through state machine
    const prevState = tracked.stateMachine.state;
    tracked.stateMachine.processOutput(event.data);
    if (tracked.stateMachine.state !== prevState) {
      this.uiAdapter.applyState(event.terminal, tracked.stateMachine.state);
    }
  }

  private handleClose(terminal: vscode.Terminal): void {
    const tracked = this.tracked.get(terminal);
    if (tracked) {
      if (tracked.stateMachine) {
        tracked.stateMachine.processExit();
      }
      if (tracked.tickInterval) {
        clearInterval(tracked.tickInterval);
      }
      this.tracked.delete(terminal);
    }
  }

  dispose(): void {
    for (const tracked of this.tracked.values()) {
      if (tracked.tickInterval) {
        clearInterval(tracked.tickInterval);
      }
    }
    this.tracked.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/terminal-watcher.ts
git commit -m "feat: add TerminalWatcher to orchestrate per-terminal state tracking"
```

---

## Task 8: Commands

Register the three command palette commands.

**Files:**
- Create: `src/commands.ts`

**Step 1: Implement commands**

`src/commands.ts`:
```typescript
import * as vscode from 'vscode';
import { TerminalState } from './types';
import { TerminalWatcher } from './terminal-watcher';

export function registerCommands(
  context: vscode.ExtensionContext,
  watcher: TerminalWatcher,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('terminalReady.focusNextReady', () => {
      focusNextWithState(watcher, TerminalState.Ready);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalReady.focusNextBlocked', () => {
      focusNextWithState(watcher, TerminalState.Blocked);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalReady.showDebugInfo', () => {
      showDebugInfo(watcher);
    }),
  );
}

function focusNextWithState(watcher: TerminalWatcher, targetState: TerminalState): void {
  const terminals = watcher.getTrackedTerminals();
  for (const [terminal, state] of terminals) {
    if (state === targetState) {
      terminal.show();
      return;
    }
  }
  vscode.window.showInformationMessage(
    `No terminal in "${targetState}" state.`,
  );
}

function showDebugInfo(watcher: TerminalWatcher): void {
  const terminals = watcher.getTrackedTerminals();
  const lines: string[] = [];
  for (const [terminal, state] of terminals) {
    lines.push(`${terminal.name}: ${state}`);
  }
  if (lines.length === 0) {
    lines.push('No tracked terminals.');
  }
  const channel = vscode.window.createOutputChannel('Terminal Ready');
  channel.clear();
  channel.appendLine('Terminal Ready — Debug Info');
  channel.appendLine('─'.repeat(40));
  for (const line of lines) {
    channel.appendLine(line);
  }
  channel.show();
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/commands.ts
git commit -m "feat: add command palette commands for focus and debug"
```

---

## Task 9: Wire Up Extension Entry Point

Connect all components in `extension.ts`.

**Files:**
- Modify: `src/extension.ts`

**Step 1: Update extension.ts**

`src/extension.ts`:
```typescript
import * as vscode from 'vscode';
import { ConfigResolver } from './config-resolver';
import { TerminalWatcher } from './terminal-watcher';
import { registerCommands } from './commands';

let watcher: TerminalWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = new ConfigResolver();

  if (!config.isEnabled()) {
    return;
  }

  watcher = new TerminalWatcher(config);
  context.subscriptions.push(watcher);

  registerCommands(context, watcher);
}

export function deactivate() {
  watcher?.dispose();
  watcher = undefined;
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire up extension entry point with all components"
```

---

## Task 10: Manual QA and Polish

**Step 1: Build the extension**

```bash
npm run compile
```

Expected: `dist/` directory with compiled JS.

**Step 2: Test in VS Code**

Press F5 in VS Code to launch the Extension Development Host. Open a terminal and run `claude` (or your alias). Verify:
- Terminal tab icon turns green when Claude Code banner appears
- Icon turns pink when Claude starts working (spinner visible)
- Icon turns green when Claude finishes (spinner clears)
- Icon turns orange when Claude asks a question or requests permission
- `Ctrl+Z` → icon turns blue
- `fg` → icon returns to appropriate state
- Command palette: "Focus Next Ready Terminal" works
- Command palette: "Show Debug Info" shows terminal states

**Step 3: Fix any issues found during QA**

Address issues as they come up, committing each fix separately.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: polish and QA fixes"
```
