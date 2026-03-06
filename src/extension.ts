import * as vscode from 'vscode';
import { ConfigResolver } from './config-resolver';
import { TerminalWatcher } from './terminal-watcher';
import { registerCommands } from './commands';

let watcher: TerminalWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel('Terminal Ready');
  context.subscriptions.push(log);

  try {
    const config = new ConfigResolver();

    if (!config.isEnabled()) {
      return;
    }

    watcher = new TerminalWatcher(config, log);
    context.subscriptions.push(watcher);

    registerCommands(context, watcher);
    log.appendLine('Terminal Ready: activated.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.appendLine(`Terminal Ready: activation failed — ${msg}`);
    vscode.window.showErrorMessage(`Terminal Ready failed to activate: ${msg}`);
  }
}

export function deactivate() {
  watcher?.dispose();
  watcher = undefined;
}
