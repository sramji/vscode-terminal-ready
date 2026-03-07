/**
 * Integration test: launch Claude Code, observe state transitions.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const logPath = path.resolve(__dirname, '../../integration-test-results.log');

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function run(): Promise<void> {
  fs.writeFileSync(logPath, `Integration test started at ${new Date().toISOString()}\n`);

  try {
    log('=== Claude Code State Transition Test ===');

    // Create a terminal and launch claude
    const terminal = vscode.window.createTerminal({ name: 'test-claude' });
    terminal.show();
    await sleep(1000);

    // Launch Claude Code
    terminal.sendText('claude', true);
    log('Sent "claude" command');

    // Wait for Claude Code to start up (banner + ready prompt)
    await sleep(10000);
    log(`After startup — name: "${terminal.name}"`);

    // Now ask Claude something to trigger working -> ready cycle
    terminal.sendText('Where did we leave off?', true);
    log('Sent question to Claude');

    // Monitor state transitions for 60 seconds
    const startTime = Date.now();
    let lastState = '';
    while (Date.now() - startTime < 60000) {
      const name = terminal.name;
      if (name !== lastState) {
        log(`Terminal name changed: "${name}"`);
        lastState = name;
      }
      await sleep(500);
    }

    // Also read the debug log to see state machine transitions
    const debugLogPath = path.resolve(__dirname, '../../terminal-ready-debug.log');
    if (fs.existsSync(debugLogPath)) {
      const debugLog = fs.readFileSync(debugLogPath, 'utf-8');
      log('=== Debug Log Contents ===');
      // Only include state-related lines
      for (const line of debugLog.split('\n')) {
        if (line.includes('[state]') || line.includes('[tick]') || line.includes('[MATCH]') || line.includes('[sm:') || line.includes('[ui]')) {
          log(`  ${line}`);
        }
      }
    }

    terminal.sendText('/exit', true);
    await sleep(2000);
    terminal.dispose();

    log('=== Test Complete ===');
  } catch (err: any) {
    log(`TEST ERROR: ${err.message}\n${err.stack}`);
    throw err;
  }
}
