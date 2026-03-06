import { describe, it, expect } from 'vitest';
import { RingBuffer, stripAnsi } from './ring-buffer';

describe('RingBuffer', () => {
  it('stores appended text', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello');
    expect(buf.toString()).toBe('hello');
  });

  it('concatenates multiple appends', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello ');
    buf.append('world');
    expect(buf.toString()).toBe('hello world');
  });

  it('drops oldest content when exceeding capacity', () => {
    const buf = new RingBuffer(10);
    buf.append('abcdefghij'); // fills exactly
    buf.append('XYZ');        // should drop 'abc'
    expect(buf.toString()).toBe('defghijXYZ');
  });

  it('handles appends larger than capacity', () => {
    const buf = new RingBuffer(5);
    buf.append('abcdefghij');
    expect(buf.toString()).toBe('fghij');
  });

  it('clears the buffer', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello');
    buf.clear();
    expect(buf.toString()).toBe('');
  });

  it('returns the last N characters', () => {
    const buf = new RingBuffer(1024);
    buf.append('hello world');
    expect(buf.last(5)).toBe('world');
  });

  it('contains() checks for substring presence', () => {
    const buf = new RingBuffer(1024);
    buf.append('╭─── Claude Code v2.1.69');
    expect(buf.contains('Claude Code v')).toBe(true);
    expect(buf.contains('Aider')).toBe(false);
  });

  it('containsStripped() finds text through ANSI escape codes', () => {
    const buf = new RingBuffer(4096);
    // Real terminal output has \x1b[1C between words and color codes
    buf.append('\x1b[38;2;255;153;51m╭───\x1b[1CClaude\x1b[1CCode\x1b[1Cv2.1.69\x1b[39m');
    expect(buf.containsStripped('Claude Code')).toBe(true);
    expect(buf.contains('Claude Code')).toBe(false); // raw doesn't match
  });
});

describe('stripAnsi', () => {
  it('removes CSI sequences', () => {
    expect(stripAnsi('\x1b[38;2;255;153;51mhello\x1b[39m')).toBe('hello');
  });

  it('replaces cursor movement (1C = forward 1) with space', () => {
    expect(stripAnsi('Claude\x1b[1CCode')).toBe('Claude Code');
  });

  it('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]0;✳ Claude Code\x07')).toBe('');
  });

  it('handles mixed sequences', () => {
    const raw = '\x1b[38;2;255;153;51m*\x1b[39m \x1b[38;2;255;153;51mFinagling… \x1b[39m';
    expect(stripAnsi(raw)).toBe('* Finagling… ');
  });

  it('passes through clean text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});
