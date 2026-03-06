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
