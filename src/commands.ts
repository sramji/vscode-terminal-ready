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
