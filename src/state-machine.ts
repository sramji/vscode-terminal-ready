import { ProfileConfig, TerminalState } from './types';
import { RingBuffer, stripAnsi } from './ring-buffer';

// OSC 0 (window title) pattern: \x1b]0;TITLE\x07
const OSC_TITLE_RE = /\x1b\]0;([^\x07]*)\x07/g;

export class StateMachine {
  private _state: TerminalState = TerminalState.Untagged;
  private _isTagged = false;
  private readonly buffer: RingBuffer;
  private readonly profile: ProfileConfig;

  constructor(profile: ProfileConfig) {
    this.profile = profile;
    this.buffer = new RingBuffer(4096);
  }

  get state(): TerminalState {
    return this._state;
  }

  get isTagged(): boolean {
    return this._isTagged;
  }

  processOutput(chunk: string): void {
    this.buffer.append(chunk);

    if (!this._isTagged) {
      if (this.buffer.containsStripped(this.profile.fingerprint)) {
        this._isTagged = true;
        this._state = TerminalState.Ready;
      }
      return;
    }

    // If suspended and we see the fingerprint again (fg), go Ready
    if (this._state === TerminalState.Suspended && stripAnsi(chunk).includes(this.profile.fingerprint)) {
      this._state = TerminalState.Ready;
      return;
    }

    // Primary detection: window title (OSC 0) in raw output.
    // ✳ Claude Code = Ready, spinner prefix = Working,
    // non-Claude title = Suspended, empty = Exited.
    let match: RegExpExecArray | null;
    OSC_TITLE_RE.lastIndex = 0;
    while ((match = OSC_TITLE_RE.exec(chunk)) !== null) {
      const title = match[1];

      if (title === '') {
        this._state = TerminalState.Exited;
        return;
      }

      if (title.includes('Claude Code')) {
        const idx = title.indexOf('Claude Code');
        const prefix = title.slice(0, idx).trim();

        if (prefix === '✳' || prefix === '') {
          this._state = TerminalState.Ready;
        } else {
          this._state = TerminalState.Working;
        }
      } else if (this._state !== TerminalState.Exited && this.profile.completionTitlePattern?.test(title)) {
        this._state = TerminalState.Ready;
      } else if (this._state !== TerminalState.Exited) {
        this._state = TerminalState.Suspended;
      }
    }

    // Secondary: blocked patterns on stripped text
    const stripped = stripAnsi(chunk);
    const lines = stripped.split('\n');
    for (const line of lines) {
      if (this.profile.blockedPatterns.some(p => p.test(line))) {
        this._state = TerminalState.Blocked;
        return;
      }
    }

    // Exit Blocked when empty ❯ prompt reappears (e.g. after slash command dialog dismissed)
    if (this._state === TerminalState.Blocked && this.profile.readyPattern) {
      for (const line of lines) {
        if (this.profile.readyPattern.test(line)) {
          this._state = TerminalState.Ready;
          return;
        }
      }
    }
  }

  processExit(): void {
    this._state = TerminalState.Exited;
  }
}
