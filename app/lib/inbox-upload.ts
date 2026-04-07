import { toast } from '@/lib/toast';
import type { useLocale } from '@/lib/stores/locale-store';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

function showQuickDropToast(
  saved: number,
  formatSkipped: number,
  oversized: number,
  t: ReturnType<typeof useLocale>['t'],
) {
  if (saved > 0 && oversized > 0 && formatSkipped === 0) {
    toast.success(t.inbox.savedWithOversized(saved, oversized), 4000);
  } else if (saved > 0 && (formatSkipped + oversized) > 0) {
    toast.success(t.inbox.savedWithSkipped(saved, formatSkipped + oversized), 4000);
  } else if (saved > 0) {
    toast.success(t.inbox.savedToast(saved), 3000);
  } else {
    if (oversized > 0) toast.error(t.inbox.tooLarge(oversized), 4000);
    if (formatSkipped > 0) toast.error(t.inbox.savedWithSkipped(0, formatSkipped), 4000);
    if (oversized === 0 && formatSkipped === 0) toast.error(t.inbox.saveFailed, 4000);
  }
}

export async function quickDropToInbox(
  files: File[],
  t: ReturnType<typeof useLocale>['t'],
) {
  const payload: Array<{ name: string; content: string; encoding?: string }> = [];
  let oversizedCount = 0;

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      oversizedCount++;
      continue;
    }
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        payload.push({ name: file.name, content: arrayBufferToBase64(buf), encoding: 'base64' });
      } else {
        const text = await file.text();
        payload.push({ name: file.name, content: text });
      }
    } catch {
      /* skip unreadable files */
    }
  }

  if (payload.length === 0) {
    if (oversizedCount > 0) {
      toast.error(t.inbox.tooLarge(oversizedCount), 4000);
    } else if (files.length > 0) {
      toast.error(t.inbox.saveFailed, 4000);
    }
    return;
  }

  try {
    const res = await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: payload }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[QuickDrop] Save failed:', data.error);
      toast.error(t.inbox.saveFailed, 4000);
      return;
    }

    const result = await res.json();
    const saved = result.saved?.length ?? 0;
    const formatSkipped = result.skipped?.length ?? 0;

    showQuickDropToast(saved, formatSkipped, oversizedCount, t);
    window.dispatchEvent(new Event('mindos:files-changed'));
    window.dispatchEvent(new Event('mindos:inbox-updated'));
  } catch (err) {
    console.error('[QuickDrop] Network error:', err);
    toast.error(t.inbox.saveFailed, 4000);
  }
}

/**
 * Drop files into a specific directory via /api/file/import.
 * Used when user drags external files onto a directory in the file tree.
 */
export async function quickDropToDirectory(
  files: File[],
  targetDir: string,
  t: ReturnType<typeof useLocale>['t'],
) {
  const payload: Array<{ name: string; content: string; encoding?: string }> = [];
  let oversizedCount = 0;

  const BINARY_EXTS = new Set([
    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
    'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'mp4', 'webm', 'mov', 'mkv',
  ]);

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      oversizedCount++;
      continue;
    }
    try {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (BINARY_EXTS.has(ext)) {
        const buf = await file.arrayBuffer();
        payload.push({ name: file.name, content: arrayBufferToBase64(buf), encoding: 'base64' });
      } else {
        const text = await file.text();
        payload.push({ name: file.name, content: text });
      }
    } catch {
      /* skip unreadable files */
    }
  }

  if (payload.length === 0) {
    if (oversizedCount > 0) {
      toast.error(t.inbox.tooLarge(oversizedCount), 4000);
    } else if (files.length > 0) {
      toast.error(t.inbox.saveFailed, 4000);
    }
    return;
  }

  const dirName = targetDir.split('/').pop() || targetDir;

  try {
    const res = await fetch('/api/file/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: payload,
        targetSpace: targetDir,
        organize: false,
        conflict: 'rename',
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[TreeDrop] Save failed:', data.error);
      toast.error(t.inbox.saveFailed, 4000);
      return;
    }

    const result = await res.json();
    const saved = result.created?.length ?? 0;
    const skipped = result.skipped?.length ?? 0;

    if (saved > 0 && (skipped + oversizedCount) > 0) {
      toast.success(t.inbox.savedWithSkipped(saved, skipped + oversizedCount), 4000);
    } else if (saved > 0) {
      toast.success(t.inbox.savedToDir(saved, dirName), 3000);
    } else {
      if (oversizedCount > 0) toast.error(t.inbox.tooLarge(oversizedCount), 4000);
      if (skipped > 0) toast.error(t.inbox.savedWithSkipped(0, skipped), 4000);
    }

    window.dispatchEvent(new Event('mindos:files-changed'));
  } catch (err) {
    console.error('[TreeDrop] Network error:', err);
    toast.error(t.inbox.saveFailed, 4000);
  }
}
