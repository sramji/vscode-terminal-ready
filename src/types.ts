export enum TerminalState {
  Untagged = 'untagged',
  Working = 'working',
  Ready = 'ready',
  Blocked = 'blocked',
  Suspended = 'suspended',
  Exited = 'exited',
}

export interface ProfileConfig {
  name: string;
  fingerprint: string;
  workingPatterns: RegExp[];
  blockedPatterns: RegExp[];
  readyPattern: RegExp;
  readyDebounceMs: number;
  shellPromptPattern?: RegExp;
  completionTitlePattern?: RegExp;
  indicators?: Partial<Record<TerminalState, string>>;
}
