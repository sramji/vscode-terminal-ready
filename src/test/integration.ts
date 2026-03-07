/**
 * Task 1: Probe whether shell integration execution.read() includes OSC 0
 * window title sequences. This is the go/no-go gate for marketplace publication.
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
    log('=== Task 1: OSC 0 Probe via Shell Integration read() ===');
    log('');

    const disposables: vscode.Disposable[] = [];

    // Counters for the final summary
    let totalChunks = 0;
    let totalBytes = 0;
    let osc0Count = 0;      // \x1b]0; (window title — what we need)
    let osc633Count = 0;     // \x1b]633; (shell integration markers)
    let claudeTitleCount = 0; // OSC 0 titles containing "Claude Code"
    let sparkleTitleCount = 0; // ✳ Claude Code (Ready)
    let spinnerTitleCount = 0; // spinner + Claude Code (Working)
    let emptyTitleCount = 0;  // empty title (Exited)

    // Also listen via proposed API for comparison
    let proposedChunks = 0;
    let proposedOsc0 = 0;

    if (typeof vscode.window.onDidWriteTerminalData === 'function') {
      disposables.push(
        vscode.window.onDidWriteTerminalData(e => {
          if (e.terminal.name === 'osc-probe' || e.terminal.name === 'claude') {
            proposedChunks++;
            if (e.data.includes('\x1b]0;')) {
              proposedOsc0++;
              // Extract titles for comparison
              const matches = e.data.matchAll(/\x1b\]0;([^\x07]*)\x07/g);
              for (const m of matches) {
                log(`  [proposed] OSC 0 title: "${m[1]}"`);
              }
            }
          }
        }),
      );
      log('Proposed API (onDidWriteTerminalData): AVAILABLE — will compare');
    } else {
      log('Proposed API: NOT available — can only test shell integration');
    }

    // Listen for shell execution events
    disposables.push(
      vscode.window.onDidStartTerminalShellExecution(async event => {
        const cmd = event.execution.commandLine.value;
        log(`[exec-start] "${event.terminal.name}": ${cmd}`);

        try {
          const stream = event.execution.read();
          for await (const data of stream) {
            totalChunks++;
            totalBytes += data.length;

            // Check for OSC sequences
            const osc0Matches = [...data.matchAll(/\x1b\]0;([^\x07]*)\x07/g)];
            const osc633Matches = [...data.matchAll(/\x1b\]633;/g)];

            if (osc0Matches.length > 0) {
              osc0Count += osc0Matches.length;
              for (const m of osc0Matches) {
                const title = m[1];
                if (title.includes('Claude Code')) {
                  claudeTitleCount++;
                  const idx = title.indexOf('Claude Code');
                  const prefix = title.slice(0, idx).trim();
                  if (prefix === '✳' || prefix === '') {
                    sparkleTitleCount++;
                    log(`  [read] OSC 0 READY title: "${title}"`);
                  } else {
                    spinnerTitleCount++;
                    log(`  [read] OSC 0 WORKING title: "${title}" (prefix: "${prefix}")`);
                  }
                } else if (title === '') {
                  emptyTitleCount++;
                  log(`  [read] OSC 0 EXITED title: (empty)`);
                } else {
                  log(`  [read] OSC 0 OTHER title: "${title}"`);
                }
              }
            }

            if (osc633Matches.length > 0) {
              osc633Count += osc633Matches.length;
            }

            // Log first few chunks and any with OSC 0
            if (totalChunks <= 5 || osc0Matches.length > 0) {
              const preview = data.slice(0, 120).replace(/\n/g, '\\n').replace(/\x1b/g, '<ESC>');
              log(`  [read] chunk #${totalChunks} (${data.length}b): ${preview}`);
            }
          }
          log(`[exec-end] stream closed: ${totalChunks} chunks, ${totalBytes} bytes`);
        } catch (err: any) {
          log(`[exec-error] stream error: ${err.message}`);
        }
      }),
    );

    disposables.push(
      vscode.window.onDidEndTerminalShellExecution(event => {
        log(`[exec-end] "${event.terminal.name}": exit code ${event.exitCode}`);
      }),
    );

    // Create terminal and launch Claude Code
    const terminal = vscode.window.createTerminal({ name: 'osc-probe' });
    terminal.show();
    await sleep(2000);

    log('Sending: claude');
    terminal.sendText('claude', true);

    // Wait for Claude Code to start (banner + ready prompt)
    log('Waiting 15s for Claude Code startup...');
    await sleep(15000);

    // Ask a question to trigger working→ready cycle
    log('Sending question to trigger working→ready...');
    terminal.sendText('What is 2+2?', true);

    // Wait for response
    log('Waiting 30s for working→ready cycle...');
    await sleep(30000);

    // Exit Claude Code
    log('Sending /exit...');
    terminal.sendText('/exit', true);
    await sleep(5000);

    // Print summary
    log('');
    log('========================================');
    log('        RESULTS SUMMARY');
    log('========================================');
    log(`Shell Integration read() stream:`);
    log(`  Total chunks: ${totalChunks}`);
    log(`  Total bytes: ${totalBytes}`);
    log(`  OSC 0 (\\x1b]0;) sequences: ${osc0Count}`);
    log(`  OSC 633 (shell integration) markers: ${osc633Count}`);
    log(`  Claude Code titles: ${claudeTitleCount}`);
    log(`    Ready (✳): ${sparkleTitleCount}`);
    log(`    Working (spinner): ${spinnerTitleCount}`);
    log(`    Exited (empty): ${emptyTitleCount}`);
    log('');
    log(`Proposed API comparison:`);
    log(`  Chunks received: ${proposedChunks}`);
    log(`  OSC 0 sequences: ${proposedOsc0}`);
    log('');

    if (osc0Count > 0 && claudeTitleCount > 0) {
      log('>>> VERDICT: GO — read() includes OSC 0 window titles <<<');
      log('>>> Shell integration can fully replace proposed API <<<');
    } else if (osc0Count > 0) {
      log('>>> VERDICT: PARTIAL — OSC 0 found but no Claude Code titles <<<');
      log('>>> Claude Code may not have started, retry needed <<<');
    } else {
      log('>>> VERDICT: NO-GO — read() does NOT include OSC 0 titles <<<');
      log('>>> Proposed API remains required for state detection <<<');
    }

    log('========================================');

    // Cleanup
    for (const d of disposables) d.dispose();
    terminal.dispose();

    log('=== Test Complete ===');
  } catch (err: any) {
    log(`TEST ERROR: ${err.message}\n${err.stack}`);
    throw err;
  }
}
