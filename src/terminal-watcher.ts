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
}

export class TerminalWatcher implements vscode.Disposable {
  private readonly tracked = new Map<vscode.Terminal, TrackedTerminal>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly profileMatcher: ProfileMatcher;
  private readonly uiAdapter: UIAdapter;
  private readonly log: vscode.OutputChannel;

  constructor(config: ConfigResolver, log: vscode.OutputChannel) {
    this.log = log;
    const profiles = config.getProfiles();
    this.profileMatcher = new ProfileMatcher(profiles);
    this.uiAdapter = new UIAdapter(profiles[0]?.indicators);

    for (const terminal of vscode.window.terminals) {
      this.trackTerminal(terminal);
    }

    this.disposables.push(
      vscode.window.onDidOpenTerminal(t => this.trackTerminal(t)),
      vscode.window.onDidCloseTerminal(t => this.handleClose(t)),
    );

    if (typeof vscode.window.onDidWriteTerminalData === 'function') {
      this.disposables.push(
        vscode.window.onDidWriteTerminalData(e => this.handleOutput(e)),
      );
    } else {
      log.appendLine('ERROR: onDidWriteTerminalData API is not available.');
    }
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
    });
  }

  private handleOutput(event: vscode.TerminalDataWriteEvent): void {
    const tracked = this.tracked.get(event.terminal);
    if (!tracked) {
      this.trackTerminal(event.terminal);
      const t = this.tracked.get(event.terminal)!;
      t.buffer.append(event.data);
      return;
    }

    tracked.buffer.append(event.data);

    // If not yet tagged, try to match a profile
    if (!tracked.stateMachine) {
      const profile = this.profileMatcher.match(tracked.buffer.toString());
      if (profile) {
        this.log.appendLine(`Matched profile "${profile.name}" for terminal "${event.terminal.name}"`);
        tracked.stateMachine = new StateMachine(profile);
        tracked.stateMachine.processOutput(tracked.buffer.toString());
        this.uiAdapter.applyState(event.terminal, tracked.stateMachine.state);
      }
      return;
    }

    // Already tagged — process output through state machine
    const prevState = tracked.stateMachine.state;
    tracked.stateMachine.processOutput(event.data);
    if (tracked.stateMachine.state !== prevState) {
      this.log.appendLine(`[${event.terminal.name}] ${prevState} -> ${tracked.stateMachine.state}`);
    }
    // Always apply UI — user may have renamed the terminal, removing our prefix
    this.uiAdapter.applyState(event.terminal, tracked.stateMachine.state);
  }

  private handleClose(terminal: vscode.Terminal): void {
    const tracked = this.tracked.get(terminal);
    if (tracked) {
      if (tracked.stateMachine) {
        tracked.stateMachine.processExit();
      }
      this.tracked.delete(terminal);
    }
  }

  dispose(): void {
    this.tracked.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
