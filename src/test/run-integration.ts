/**
 * Integration test runner — launches VS Code with our extension and runs tests inside it.
 */
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './integration.js');

  try {
    // Unset Claude Code env vars so we can launch claude inside the test
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_SSE_PORT;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--enable-proposed-api=terminal-ready.terminal-ready',
        '--disable-extensions',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
