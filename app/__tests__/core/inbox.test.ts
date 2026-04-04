import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mkTempMindRoot, cleanupMindRoot, seedFile, readSeeded } from './helpers';
import {
  INBOX_DIR,
  ensureInboxSpace,
  listInboxFiles,
  saveToInbox,
} from '@/lib/core/inbox';

describe('ensureInboxSpace', () => {
  let mindRoot: string;

  beforeEach(() => { mindRoot = mkTempMindRoot(); });
  afterEach(() => { cleanupMindRoot(mindRoot); });

  it('creates Inbox directory with INSTRUCTION.md and README.md', () => {
    const result = ensureInboxSpace(mindRoot);
    expect(result).toBe(path.resolve(mindRoot, INBOX_DIR));
    expect(fs.existsSync(path.join(mindRoot, INBOX_DIR, 'INSTRUCTION.md'))).toBe(true);
    expect(fs.existsSync(path.join(mindRoot, INBOX_DIR, 'README.md'))).toBe(true);
  });

  it('is idempotent — calling twice does not overwrite existing files', () => {
    ensureInboxSpace(mindRoot);
    const original = readSeeded(mindRoot, `${INBOX_DIR}/INSTRUCTION.md`);
    seedFile(mindRoot, `${INBOX_DIR}/custom.md`, 'user content');
    ensureInboxSpace(mindRoot);
    expect(readSeeded(mindRoot, `${INBOX_DIR}/INSTRUCTION.md`)).toBe(original);
    expect(readSeeded(mindRoot, `${INBOX_DIR}/custom.md`)).toBe('user content');
  });

  it('recreates Inbox after user deletes it', () => {
    ensureInboxSpace(mindRoot);
    fs.rmSync(path.join(mindRoot, INBOX_DIR), { recursive: true, force: true });
    ensureInboxSpace(mindRoot);
    expect(fs.existsSync(path.join(mindRoot, INBOX_DIR, 'INSTRUCTION.md'))).toBe(true);
  });
});

describe('listInboxFiles', () => {
  let mindRoot: string;

  beforeEach(() => { mindRoot = mkTempMindRoot(); });
  afterEach(() => { cleanupMindRoot(mindRoot); });

  it('returns empty array when Inbox does not exist', () => {
    expect(listInboxFiles(mindRoot)).toEqual([]);
  });

  it('returns empty array when Inbox exists but is empty (only system files)', () => {
    ensureInboxSpace(mindRoot);
    expect(listInboxFiles(mindRoot)).toEqual([]);
  });

  it('lists non-system files with metadata', () => {
    ensureInboxSpace(mindRoot);
    seedFile(mindRoot, `${INBOX_DIR}/notes.md`, '# Notes');
    seedFile(mindRoot, `${INBOX_DIR}/data.csv`, 'a,b,c');

    const files = listInboxFiles(mindRoot);
    expect(files).toHaveLength(2);
    expect(files.map(f => f.name).sort()).toEqual(['data.csv', 'notes.md']);
    expect(files[0].size).toBeGreaterThan(0);
    expect(files[0].modifiedAt).toBeTruthy();
    expect(typeof files[0].isAging).toBe('boolean');
  });

  it('excludes system files (INSTRUCTION.md, README.md, dotfiles)', () => {
    ensureInboxSpace(mindRoot);
    seedFile(mindRoot, `${INBOX_DIR}/.hidden`, 'hidden');
    seedFile(mindRoot, `${INBOX_DIR}/visible.md`, 'ok');

    const files = listInboxFiles(mindRoot);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('visible.md');
  });

  it('sorts by modification time (newest first)', () => {
    ensureInboxSpace(mindRoot);
    seedFile(mindRoot, `${INBOX_DIR}/old.md`, 'old');
    const oldPath = path.join(mindRoot, INBOX_DIR, 'old.md');
    const pastTime = new Date(Date.now() - 86400000);
    fs.utimesSync(oldPath, pastTime, pastTime);

    seedFile(mindRoot, `${INBOX_DIR}/new.md`, 'new');

    const files = listInboxFiles(mindRoot);
    expect(files[0].name).toBe('new.md');
    expect(files[1].name).toBe('old.md');
  });

  it('marks files older than 7 days as aging', () => {
    ensureInboxSpace(mindRoot);
    seedFile(mindRoot, `${INBOX_DIR}/aged.md`, 'old content');
    const filePath = path.join(mindRoot, INBOX_DIR, 'aged.md');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(filePath, eightDaysAgo, eightDaysAgo);

    seedFile(mindRoot, `${INBOX_DIR}/fresh.md`, 'new content');

    const files = listInboxFiles(mindRoot);
    const aged = files.find(f => f.name === 'aged.md');
    const fresh = files.find(f => f.name === 'fresh.md');
    expect(aged?.isAging).toBe(true);
    expect(fresh?.isAging).toBe(false);
  });

  it('skips subdirectories', () => {
    ensureInboxSpace(mindRoot);
    fs.mkdirSync(path.join(mindRoot, INBOX_DIR, 'subdir'), { recursive: true });
    seedFile(mindRoot, `${INBOX_DIR}/subdir/nested.md`, 'nested');
    seedFile(mindRoot, `${INBOX_DIR}/top.md`, 'top');

    const files = listInboxFiles(mindRoot);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('top.md');
  });
});

describe('saveToInbox', () => {
  let mindRoot: string;

  beforeEach(() => { mindRoot = mkTempMindRoot(); });
  afterEach(() => { cleanupMindRoot(mindRoot); });

  it('saves a markdown file to Inbox', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'notes.md', content: '# My Notes\n\nSome content' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(result.saved[0].original).toBe('notes.md');
    expect(result.saved[0].path).toBe('Inbox/notes.md');
    expect(result.skipped).toHaveLength(0);

    const content = readSeeded(mindRoot, 'Inbox/notes.md');
    expect(content).toContain('My Notes');
  });

  it('converts .txt to .md with title heading', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'todo.txt', content: 'Buy milk\nFix bug' },
    ]);

    expect(result.saved[0].path).toBe('Inbox/todo.md');
    const content = readSeeded(mindRoot, 'Inbox/todo.md');
    expect(content).toContain('# Todo');
    expect(content).toContain('Buy milk');
  });

  it('handles multiple files at once', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'a.md', content: 'aaa' },
      { name: 'b.md', content: 'bbb' },
      { name: 'c.md', content: 'ccc' },
    ]);

    expect(result.saved).toHaveLength(3);
    expect(fs.readdirSync(path.join(mindRoot, INBOX_DIR))).toContain('a.md');
    expect(fs.readdirSync(path.join(mindRoot, INBOX_DIR))).toContain('b.md');
    expect(fs.readdirSync(path.join(mindRoot, INBOX_DIR))).toContain('c.md');
  });

  it('deduplicates with -1 suffix on name collision', () => {
    saveToInbox(mindRoot, [{ name: 'notes.md', content: 'first' }]);
    const result = saveToInbox(mindRoot, [{ name: 'notes.md', content: 'second' }]);

    expect(result.saved[0].path).toBe('Inbox/notes-1.md');
    expect(readSeeded(mindRoot, 'Inbox/notes.md')).toContain('first');
    expect(readSeeded(mindRoot, 'Inbox/notes-1.md')).toContain('second');
  });

  it('skips unsupported file formats', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'script.exe', content: 'binary' },
      { name: 'notes.md', content: 'ok' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe('script.exe');
    expect(result.skipped[0].reason).toContain('Unsupported');
  });

  it('skips files with empty or invalid names', () => {
    const result = saveToInbox(mindRoot, [
      { name: '', content: 'no name' },
      { name: 'valid.md', content: 'ok' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('skips files with missing or null content', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'no-content.md', content: undefined as unknown as string },
      { name: 'null-content.md', content: null as unknown as string },
      { name: 'valid.md', content: 'ok' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].reason).toContain('Missing');
    expect(result.skipped[1].reason).toContain('Missing');
  });

  it('auto-creates Inbox directory if it was deleted', () => {
    const result = saveToInbox(mindRoot, [
      { name: 'rescued.md', content: 'saved!' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(fs.existsSync(path.join(mindRoot, INBOX_DIR, 'INSTRUCTION.md'))).toBe(true);
    expect(readSeeded(mindRoot, 'Inbox/rescued.md')).toContain('saved!');
  });

  it('preserves CSV and JSON files as-is (no markdown conversion)', () => {
    saveToInbox(mindRoot, [
      { name: 'data.csv', content: 'a,b,c\n1,2,3' },
      { name: 'config.json', content: '{"key":"value"}' },
    ]);

    expect(readSeeded(mindRoot, 'Inbox/data.csv')).toBe('a,b,c\n1,2,3');
    expect(readSeeded(mindRoot, 'Inbox/config.json')).toBe('{"key":"value"}');
  });

  it('sanitizes dangerous file names', () => {
    const result = saveToInbox(mindRoot, [
      { name: '../../../etc/passwd.md', content: 'hack attempt' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(result.saved[0].path).toContain('Inbox/');
    expect(result.saved[0].path).not.toContain('..');
  });

  it('handles base64 encoded content', () => {
    const originalContent = 'Hello from base64!';
    const base64 = Buffer.from(originalContent).toString('base64');
    const result = saveToInbox(mindRoot, [
      { name: 'encoded.md', content: base64, encoding: 'base64' },
    ]);

    expect(result.saved).toHaveLength(1);
    expect(readSeeded(mindRoot, 'Inbox/encoded.md')).toContain('Hello from base64!');
  });
});
