import fs from 'fs';
import path from 'path';
import { resolveSafe } from './security';
import { sanitizeFileName, convertToMarkdown, ALLOWED_IMPORT_EXTENSIONS } from './file-convert';

export const INBOX_DIR = 'Inbox';
const AGING_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const INBOX_INSTRUCTION = `# Inbox Instruction Set

## Goal
This is the **Inbox** — a staging area for unprocessed files.
Files here are waiting to be organized into the right location in the knowledge base.

## Rules
- New files dropped here should be preserved as-is until the user triggers organization.
- When organizing, analyze file content and move each file to the most appropriate Space/directory.
- If a file belongs to an existing topic, merge or append rather than creating duplicates.
- After organizing, the Inbox should be empty or contain only files that don't fit anywhere.
- Never delete files from Inbox — always move them to a better location.

## Boundary
- Root INSTRUCTION.md rules take precedence.
- This INSTRUCTION.md only applies to the Inbox directory.
`;

const INBOX_README = `# Inbox

Quick capture staging area. Drop files here and organize them later with AI.

## Usage
- Drag files onto the MindOS window to save them here instantly.
- Click "AI Organize" on the homepage to sort everything into the right place.
`;

export interface InboxFileInfo {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isAging: boolean;
}

export interface InboxSaveResult {
  saved: Array<{ original: string; path: string }>;
  skipped: Array<{ name: string; reason: string }>;
}

export interface InboxSaveInput {
  name: string;
  content: string;
  encoding?: 'text' | 'base64';
}

/**
 * Creates the Inbox space if it doesn't exist.
 * Idempotent — safe to call multiple times concurrently.
 */
export function ensureInboxSpace(mindRoot: string): string {
  const inboxDir = path.resolve(mindRoot, INBOX_DIR);
  fs.mkdirSync(inboxDir, { recursive: true });

  const instructionPath = path.join(inboxDir, 'INSTRUCTION.md');
  if (!fs.existsSync(instructionPath)) {
    fs.writeFileSync(instructionPath, INBOX_INSTRUCTION, 'utf-8');
  }

  const readmePath = path.join(inboxDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, INBOX_README, 'utf-8');
  }

  return inboxDir;
}

/**
 * Lists non-system files in the Inbox directory with metadata.
 * Returns files sorted by modification time (newest first).
 */
export function listInboxFiles(mindRoot: string): InboxFileInfo[] {
  const inboxDir = path.resolve(mindRoot, INBOX_DIR);
  if (!fs.existsSync(inboxDir)) return [];

  const entries = fs.readdirSync(inboxDir, { withFileTypes: true });
  const now = Date.now();
  const results: InboxFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lowerName = entry.name.toLowerCase();
    if (lowerName === 'instruction.md' || lowerName === 'readme.md') continue;
    if (entry.name.startsWith('.')) continue;

    const filePath = path.join(inboxDir, entry.name);
    try {
      const stat = fs.statSync(filePath);
      results.push({
        name: entry.name,
        path: `${INBOX_DIR}/${entry.name}`,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isAging: now - stat.mtime.getTime() > AGING_THRESHOLD_MS,
      });
    } catch {
      // file may have been deleted between readdir and stat
    }
  }

  results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return results;
}

function decodeContent(encoding: string | undefined, content: string): string {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf-8');
  }
  return content;
}

function resolveUniqueName(inboxDir: string, targetName: string): string {
  let resolved = path.join(inboxDir, targetName);
  if (!fs.existsSync(resolved)) return targetName;

  const ext = path.extname(targetName);
  const stem = ext ? targetName.slice(0, -ext.length) : targetName;
  let n = 1;
  while (fs.existsSync(resolved)) {
    const candidate = `${stem}-${n}${ext}`;
    resolved = path.join(inboxDir, candidate);
    if (!fs.existsSync(resolved)) return candidate;
    n++;
  }
  return targetName;
}

/**
 * Saves files to the Inbox directory.
 * Handles format conversion (txt→md, html→md, etc.) and deduplication.
 */
export function saveToInbox(mindRoot: string, files: InboxSaveInput[]): InboxSaveResult {
  const inboxDir = ensureInboxSpace(mindRoot);
  const saved: InboxSaveResult['saved'] = [];
  const skipped: InboxSaveResult['skipped'] = [];

  for (const file of files) {
    if (!file.name || typeof file.name !== 'string') {
      skipped.push({ name: file.name || '(empty)', reason: 'Invalid file name' });
      continue;
    }

    if (file.content == null || typeof file.content !== 'string') {
      skipped.push({ name: file.name, reason: 'Missing or invalid content' });
      continue;
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_IMPORT_EXTENSIONS.has(ext)) {
      skipped.push({ name: file.name, reason: `Unsupported format: ${ext}` });
      continue;
    }

    try {
      const sanitized = sanitizeFileName(file.name);
      const raw = decodeContent(file.encoding, file.content);
      const { content, targetName } = convertToMarkdown(sanitized, raw);
      const uniqueName = resolveUniqueName(inboxDir, targetName);

      // Security: resolve within mindRoot
      const targetPath = `${INBOX_DIR}/${uniqueName}`;
      resolveSafe(mindRoot, targetPath);

      const absPath = path.join(inboxDir, uniqueName);
      fs.writeFileSync(absPath, content, 'utf-8');
      saved.push({ original: file.name, path: targetPath });
    } catch (err) {
      skipped.push({ name: file.name, reason: (err as Error).message });
    }
  }

  return { saved, skipped };
}
