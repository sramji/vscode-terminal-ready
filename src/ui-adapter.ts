import * as vscode from 'vscode';
import { TerminalState } from './types';

const DEFAULT_INDICATORS: Record<string, string> = {
  [TerminalState.Working]: '🦀',
  [TerminalState.Ready]: '🟢',
  [TerminalState.Blocked]: '🟠',
  [TerminalState.Suspended]: '🔵',
  [TerminalState.Exited]: '⚪',
};

function buildPrefixRegex(indicators: Record<string, string>): RegExp {
  const allSymbols = Object.values(indicators);
  const escaped = allSymbols.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^(${escaped.join('|')})\\s*`);
}

export class UIAdapter {
  private indicators: Record<string, string>;
  private prefixRe: RegExp;

  constructor(indicators?: Partial<Record<string, string>>) {
    // Merge profile indicators over defaults, filtering out undefined
    const merged = { ...DEFAULT_INDICATORS };
    if (indicators) {
      for (const [k, v] of Object.entries(indicators)) {
        if (v !== undefined) merged[k] = v;
      }
    }
    this.indicators = merged;
    this.prefixRe = buildPrefixRegex(this.indicators);
  }

  applyState(terminal: vscode.Terminal, state: TerminalState): void {
    if (state === TerminalState.Untagged) return;

    const prefix = this.indicators[state];
    if (!prefix) return;

    const currentName = terminal.name;
    const baseName = currentName.replace(this.prefixRe, '');
    const newName = `${prefix} ${baseName}`;

    if (currentName === newName) return;

    this.log(`"${currentName}" -> "${newName}"`);

    if (vscode.window.activeTerminal === terminal) {
      vscode.commands.executeCommand(
        'workbench.action.terminal.renameWithArg',
        { name: newName },
      );
    } else {
      this.forceRename(terminal, newName);
    }
  }

  private async forceRename(terminal: vscode.Terminal, newName: string): Promise<void> {
    const wasActive = vscode.window.activeTerminal;
    terminal.show(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    await vscode.commands.executeCommand(
      'workbench.action.terminal.renameWithArg',
      { name: newName },
    );
    if (wasActive && wasActive !== terminal) {
      wasActive.show(true);
    }
  }

  dispose(): void {}

  private _log?: (msg: string) => void;
  setLogger(fn: (msg: string) => void): void { this._log = fn; }
  private log(msg: string): void { if (this._log) this._log(msg); }
}
