# Shell Integration Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the proposed `onDidWriteTerminalData` API with the stable shell integration API so the extension can be published to the VS Code Marketplace, keeping the proposed API as runtime fallback.

**Architecture:** Extract a `TerminalOutputSource` interface with two implementations: `ShellIntegrationSource` (stable, preferred) and `ProposedApiSource` (fallback). TerminalWatcher selects the best available source at activation. StateMachine, ProfileMatcher, UIAdapter are unchanged.

**Tech Stack:** TypeScript, VS Code Extension API (stable: `onDidStartTerminalShellExecution`, `TerminalShellExecution.read()`; proposed fallback: `onDidWriteTerminalData`), Vitest.

**Key risk:** We don't know if `execution.read()` includes OSC 0 (window title) sequences. Task 1 is the go/no-go gate. If OSC 0 is absent, we fall back to the proposed API as primary (Task 1-ALT).

**Known limitations of shell integration:**
- Only fires for new command executions — won't capture pre-existing Claude Code sessions running when the extension activates. Proposed API fallback covers this.
- Stream lifetime is tied to command execution — if VS Code considers `claude` as "ended" unexpectedly, detection stops. Tested in Task 7.
- `\x1b]633;*` shell integration markers will appear in the stream alongside our data. The StateMachine's OSC regex `/\x1b\]0;/` anchors on `0;` so these won't interfere (verified by test).

---

### Task 0: Create feature branch

**Step 1: Branch**

```bash
git checkout main
git checkout -b sramji/shell-integration
```

**Step 2: Verify clean state**

```bash
npx vitest run
npm run compile
```

Expected: 42 tests pass, clean compile.

---

### Task 1: Probe whether execution.read() includes OSC 0 titles

Go/no-go gate. If `read()` doesn't include window title sequences, we keep the proposed API as primary.

**Files:**
- Modify: `src/test/integration.ts`
- Modify: `src/test/run-integration.ts`

**Step 1: Update run-integration.ts to unset Claude Code env vars**

Ensure these lines exist at the top of `main()`:
```typescript
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_SSE_PORT;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
```

**Step 2: Write integration test**

Update `src/test/integration.ts` to:
1. Listen to `onDidStartTerminalShellExecution`
2. Create a terminal, send `claude`
3. When execution starts, `read()` the stream
4. For each chunk, check for `\x1b]0;` (OSC 0) and log findings
5. After 15s, send a question to trigger working→ready
6. Monitor for 30s total, then `/exit`
7. Log summary: "OSC 0 titles found: yes/no", count of chunks, total bytes

**Step 3: Run**

```bash
npx tsc -p src/test/tsconfig.json
node dist/test/run-integration.js
cat integration-test-results.log
```

**Decision point:**
- OSC 0 titles present in `read()` → proceed to Task 2 (happy path)
- OSC 0 titles NOT present → proceed to Task 1-ALT

**Step 4: Commit**

```bash
git add src/test/integration.ts src/test/run-integration.ts
git commit -m "test: probe shell integration read() for OSC title sequences"
```

---

### Task 1-ALT: If OSC 0 is absent from read()

If the shell integration stream does NOT include window title sequences:

1. The proposed API remains required for full state detection
2. Shell integration can still be used for: command lifecycle (start/end), command line identification (detecting `claude` command)
3. Strategy: use shell integration for terminal tagging (detect when `claude` command starts), use proposed API for output streaming (state detection)

**If this path is taken:**
- Keep `enabledApiProposals` in `package.json` (marketplace publication blocked)
- Skip Tasks 2-6 (the full migration)
- Optionally use shell integration for supplementary features (e.g., detect `claude` command line without waiting for fingerprint in output)
- Document the limitation in README
- Consider filing a VS Code issue requesting OSC sequence inclusion in `read()`

---

### Task 2: Extract TerminalOutputSource interface

**Files:**
- Create: `src/output-source.ts`

**Step 1: Create the interface**

`src/output-source.ts`:
```typescript
import * as vscode from 'vscode';

export interface TerminalOutputHandler {
  (terminal: vscode.Terminal, data: string): void;
}

export interface TerminalOutputSource extends vscode.Disposable {
  readonly name: string;
  readonly isAvailable: boolean;
  start(handler: TerminalOutputHandler): void;
}
```

**Step 2: Verify compilation**

```bash
npm run compile
```

**Step 3: Commit**

```bash
git add src/output-source.ts
git commit -m "refactor: add TerminalOutputSource interface"
```

---

### Task 3: Implement and test ProposedApiSource

**Files:**
- Create: `src/proposed-api-source.ts`
- Create: `src/proposed-api-source.test.ts`

**Step 1: Write failing tests**

`src/proposed-api-source.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { ProposedApiSource } from './proposed-api-source';

// We can't easily mock vscode in vitest, so test the logic that
// doesn't depend on the vscode module.
describe('ProposedApiSource', () => {
  it('has the correct name', () => {
    const source = new ProposedApiSource();
    expect(source.name).toBe('onDidWriteTerminalData (proposed)');
  });

  it('dispose is idempotent', () => {
    const source = new ProposedApiSource();
    source.dispose();
    source.dispose(); // should not throw
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/proposed-api-source.test.ts
```

**Step 3: Implement**

`src/proposed-api-source.ts`:
```typescript
import * as vscode from 'vscode';
import { TerminalOutputSource, TerminalOutputHandler } from './output-source';

export class ProposedApiSource implements TerminalOutputSource {
  readonly name = 'onDidWriteTerminalData (proposed)';
  private disposable: vscode.Disposable | null = null;

  get isAvailable(): boolean {
    return typeof vscode.window.onDidWriteTerminalData === 'function';
  }

  start(handler: TerminalOutputHandler): void {
    if (!this.isAvailable) {
      throw new Error('onDidWriteTerminalData is not available');
    }
    this.disposable = vscode.window.onDidWriteTerminalData(e => {
      handler(e.terminal, e.data);
    });
  }

  dispose(): void {
    this.disposable?.dispose();
    this.disposable = null;
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run src/proposed-api-source.test.ts
```

**Step 5: Commit**

```bash
git add src/proposed-api-source.ts src/proposed-api-source.test.ts
git commit -m "refactor: extract ProposedApiSource with tests"
```

---

### Task 4: Implement and test ShellIntegrationSource

**Files:**
- Create: `src/shell-integration-source.ts`
- Create: `src/shell-integration-source.test.ts`

**Step 1: Write failing tests**

`src/shell-integration-source.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ShellIntegrationSource } from './shell-integration-source';

describe('ShellIntegrationSource', () => {
  it('has the correct name', () => {
    const source = new ShellIntegrationSource();
    expect(source.name).toBe('Shell Integration (stable)');
  });

  it('dispose is idempotent', () => {
    const source = new ShellIntegrationSource();
    source.dispose();
    source.dispose(); // should not throw
  });
});
```

**Step 2: Implement with error handling in async loop**

`src/shell-integration-source.ts`:
```typescript
import * as vscode from 'vscode';
import { TerminalOutputSource, TerminalOutputHandler } from './output-source';

export class ShellIntegrationSource implements TerminalOutputSource {
  readonly name = 'Shell Integration (stable)';
  private disposables: vscode.Disposable[] = [];
  private log?: (msg: string) => void;

  constructor(log?: (msg: string) => void) {
    this.log = log;
  }

  get isAvailable(): boolean {
    return typeof vscode.window.onDidStartTerminalShellExecution === 'function';
  }

  start(handler: TerminalOutputHandler): void {
    if (!this.isAvailable) {
      throw new Error('Shell integration API is not available');
    }

    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution(async event => {
        try {
          const stream = event.execution.read();
          for await (const data of stream) {
            handler(event.terminal, data);
          }
        } catch (err) {
          // Stream may close unexpectedly if terminal is disposed
          // or execution ends abruptly. This is not an error.
          this.log?.(`read() stream ended: ${err}`);
        }
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
```

**Step 3: Run tests**

```bash
npx vitest run src/shell-integration-source.test.ts
npm run compile
```

**Step 4: Commit**

```bash
git add src/shell-integration-source.ts src/shell-integration-source.test.ts
git commit -m "feat: add ShellIntegrationSource with error handling and tests"
```

---

### Task 5: Add StateMachine tests for shell integration markers

Verify that `\x1b]633;*` shell integration markers don't interfere with our OSC 0 detection.

**Files:**
- Modify: `src/state-machine.test.ts`

**Step 1: Add tests**

Add to the existing `state-machine.test.ts`:

```typescript
describe('shell integration marker compatibility', () => {
  beforeEach(() => {
    sm.processOutput(BANNER_RAW);
  });

  it('ignores 633;C shell integration markers', () => {
    sm.processOutput('\x1b]633;C\x07some output\n');
    // Should stay Ready, not transition to Exited or any other state
    expect(sm.state).toBe(TerminalState.Ready);
  });

  it('detects OSC 0 title alongside 633 markers', () => {
    sm.processOutput('\x1b]633;C\x07output\n\x1b]0;⠂ Claude Code\x07');
    expect(sm.state).toBe(TerminalState.Working);
  });

  it('handles OSC 0 title split across chunks', () => {
    // First chunk ends mid-OSC sequence
    sm.processOutput('some output\x1b]0;✳ Cl');
    // State should not change yet (incomplete OSC)
    expect(sm.state).toBe(TerminalState.Ready);
    // Second chunk completes the OSC sequence
    sm.processOutput('aude Code\x07');
    // The regex won't match across chunks — this is a known limitation.
    // The next full OSC title will be caught.
    // This test documents the behavior, not asserts a fix.
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/state-machine.test.ts
```

**Step 3: Commit**

```bash
git add src/state-machine.test.ts
git commit -m "test: verify shell integration markers don't interfere with OSC 0 detection"
```

---

### Task 6: Refactor TerminalWatcher to use TerminalOutputSource

**Files:**
- Modify: `src/terminal-watcher.ts`

**Step 1: Update TerminalWatcher**

Replace the `onDidWriteTerminalData` block in the constructor with source selection:

```typescript
import { ShellIntegrationSource } from './shell-integration-source';
import { ProposedApiSource } from './proposed-api-source';

// In constructor, replace lines 37-43:
const shellSource = new ShellIntegrationSource(msg => log.appendLine(msg));
const proposedSource = new ProposedApiSource();

if (shellSource.isAvailable) {
  log.appendLine(`Using output source: ${shellSource.name}`);
  shellSource.start((terminal, data) => this.handleOutput(terminal, data));
  this.disposables.push(shellSource);
} else if (proposedSource.isAvailable) {
  log.appendLine(`Using output source: ${proposedSource.name}`);
  proposedSource.start((terminal, data) => this.handleOutput(terminal, data));
  this.disposables.push(proposedSource);
} else {
  log.appendLine('ERROR: No terminal output API available.');
}
```

Update `handleOutput` signature from `(event: vscode.TerminalDataWriteEvent)` to `(terminal: vscode.Terminal, data: string)` and update all references to `event.terminal` → `terminal`, `event.data` → `data`.

**Step 2: Run tests and compile**

```bash
npx vitest run
npm run compile
```

Expected: all tests pass, clean compile.

**Step 3: Commit**

```bash
git add src/terminal-watcher.ts
git commit -m "refactor: TerminalWatcher uses TerminalOutputSource with dual-mode fallback"
```

---

### Task 7: Update package.json for marketplace compatibility

**Files:**
- Modify: `package.json`
- Modify: `.vscode/launch.json`

**Only do this if Task 1 confirmed OSC 0 titles in read() stream.**

**Step 1: Remove enabledApiProposals from package.json**

Remove the `"enabledApiProposals": ["terminalDataWriteEvent"]` field. Keep the `vscode.proposed.terminalDataWriteEvent.d.ts` file — it's needed for the fallback code to compile.

**Step 2: Remove --enable-proposed-api from launch.json**

Remove the `--enable-proposed-api=terminal-ready.terminal-ready` arg.

**Step 3: Compile and test**

```bash
npm run compile
npx vitest run
```

**Step 4: Package**

```bash
npx vsce package
```

Verify: no warnings about proposed APIs.

**Step 5: Commit**

```bash
git add package.json .vscode/launch.json
git commit -m "feat: remove enabledApiProposals for marketplace compatibility"
```

---

### Task 8: Manual QA with real Claude Code

**Step 1: F5 launch without --enable-proposed-api**

Verify the extension activates and uses shell integration source (check Output > Terminal Ready log).

**Step 2: Run through all 5 states**

1. Open terminal, run `claude` → 🟢
2. Ask a question → 🦀 while working → 🟢 when done
3. Trigger permission prompt → 🟠
4. Ctrl+Z → 🔵, `fg` → 🟢
5. `/exit` → ⚪

**Step 3: Verify pre-existing terminal limitation**

If Claude Code is already running when extension activates, it should be detected by the fallback (proposed API) or on the next command execution. Document behavior.

**Step 4: Verify stream lifetime**

Ask Claude Code a complex question that takes 30+ seconds with tool calls. Verify the stream stays open and state transitions continue working.

---

### Task 9: Clean up, squash, PR

**Step 1: Run all tests**

```bash
npx vitest run
npm run compile
```

**Step 2: Squash commits**

```bash
git reset --soft main
git add -A
git commit -m "feat: migrate to stable shell integration API with proposed API fallback"
```

**Step 3: Push and PR**

```bash
git push -u origin sramji/shell-integration
gh pr create --title "feat: migrate to stable shell integration API" --body "..."
```
