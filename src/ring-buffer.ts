// Cursor-forward sequences (\x1b[1C, \x1b[2C, etc.) are used as word separators
// in Claude Code's terminal output. Replace them with spaces before stripping.
const CURSOR_FORWARD_RE = /\x1b\[\d+C/g;

// Matches all other ANSI escape sequences: CSI params, OSC strings, simple two-char escapes.
const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|[()][A-Z0-9]|.)/g;

export function stripAnsi(text: string): string {
  return text.replace(CURSOR_FORWARD_RE, ' ').replace(ANSI_RE, '');
}

export class RingBuffer {
  private buf = '';
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  append(text: string): void {
    this.buf += text;
    if (this.buf.length > this.capacity) {
      this.buf = this.buf.slice(this.buf.length - this.capacity);
    }
  }

  /** Returns the raw buffer contents (with ANSI escapes). */
  toString(): string {
    return this.buf;
  }

  /** Returns the buffer with ANSI escape sequences stripped. */
  toStripped(): string {
    return stripAnsi(this.buf);
  }

  last(n: number): string {
    return this.buf.slice(-n);
  }

  contains(substring: string): boolean {
    return this.buf.includes(substring);
  }

  /** Check if the stripped (plain text) buffer contains a substring. */
  containsStripped(substring: string): boolean {
    return this.toStripped().includes(substring);
  }

  clear(): void {
    this.buf = '';
  }
}
