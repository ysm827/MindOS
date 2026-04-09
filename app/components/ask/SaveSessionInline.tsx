'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderInput, Sparkles, ChevronRight, ChevronDown, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/stores/locale-store';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import DirPicker from '@/components/DirPicker';
import type { Message } from '@/lib/types';
import {
  generateSessionPath,
  formatSessionContent,
  sessionPreviewStats,
  type SessionSaveFormat,
} from './save-insight-utils';

/* ── Trigger Button (for AskHeader) ── */

export function SaveSessionButton({ messages, disabled }: {
  messages: Message[];
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const hasContent = messages.some((m) => m.role === 'assistant' && m.content.trim());

  if (!hasContent) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={disabled}
        className={`p-2 rounded-lg transition-colors ${
          open
            ? 'bg-[var(--amber)]/10 text-[var(--amber)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        } disabled:opacity-40`}
        title={t.ask?.saveSession ?? 'Save session'}
      >
        <FolderInput size={14} />
      </button>
      {open && (
        <SaveSessionPanel
          messages={messages}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ── Main Panel (absolute dropdown below header) ── */

type Intent = 'select' | 'archive' | 'digest';

function SaveSessionPanel({ messages, onClose }: {
  messages: Message[];
  onClose: () => void;
}) {
  const { t } = useLocale();
  const ask = t.ask;
  const [intent, setIntent] = useState<Intent>('select');

  // Fetch directory paths for DirPicker
  const [dirPaths, setDirPaths] = useState<string[]>([]);
  useEffect(() => {
    apiFetch<{ dirs: string[] }>('/api/file?op=dirs')
      .then((d) => setDirPaths(d.dirs ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="absolute top-full left-0 right-0 z-40 mx-3 mt-1 rounded-xl border border-border bg-card shadow-lg animate-in fade-in-0 slide-in-from-top-1 duration-150 overflow-visible">
      {/* Intent Selection */}
      {intent === 'select' && (
        <IntentCards
          messages={messages}
          onSelect={setIntent}
          onClose={onClose}
          ask={ask}
        />
      )}

      {/* Archive Mode — direct save with DirPicker */}
      {intent === 'archive' && (
        <ArchiveForm
          messages={messages}
          dirPaths={dirPaths}
          onBack={() => setIntent('select')}
          onClose={onClose}
          ask={ask}
        />
      )}

      {/* Digest Mode — AI organizes then saves */}
      {intent === 'digest' && (
        <DigestForm
          messages={messages}
          dirPaths={dirPaths}
          onBack={() => setIntent('select')}
          onClose={onClose}
          ask={ask}
        />
      )}
    </div>
  );
}

/* ── Step 1: Intent Cards (Archive vs Digest) ── */

function IntentCards({ messages, onSelect, onClose, ask }: {
  messages: Message[];
  onSelect: (intent: Intent) => void;
  onClose: () => void;
  ask: Record<string, any>;
}) {
  const stats = sessionPreviewStats(messages, 'full');

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <FolderInput size={12} className="text-[var(--amber)]" />
          <span className="text-xs font-semibold text-foreground">
            {ask?.saveSession ?? 'Save Session'}
          </span>
          <span className="text-2xs text-muted-foreground">
            ({stats.msgCount} messages)
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {ask?.cancelSave ?? 'Cancel'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelect('archive')}
          className="flex flex-col items-center gap-1.5 p-3 border border-[var(--amber)]/30 rounded-lg bg-card hover:border-[var(--amber)]/60 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
        >
          <FolderInput size={20} className="text-[var(--amber)]" />
          <span className="text-xs font-medium text-foreground">
            {ask?.saveDirectly ?? 'Save directly'}
          </span>
          <span className="text-2xs text-muted-foreground text-center leading-snug">
            {ask?.saveDirectlyDesc ?? 'Save conversation as-is to a folder'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelect('digest')}
          className="flex flex-col items-center gap-1.5 p-3 border border-border rounded-lg bg-card hover:border-[var(--amber)]/50 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
        >
          <Sparkles size={20} className="text-[var(--amber)]" />
          <span className="text-xs font-medium text-foreground">
            {ask?.organizeToNote ?? 'Organize to note'}
          </span>
          <span className="text-2xs text-muted-foreground text-center leading-snug">
            {ask?.organizeToNoteDesc ?? 'AI extracts key insights into a note'}
          </span>
        </button>
      </div>
    </div>
  );
}

/* ── Step 2a: Archive Form ── */

function ArchiveForm({ messages, dirPaths, onBack, onClose, ask }: {
  messages: Message[];
  dirPaths: string[];
  onBack: () => void;
  onClose: () => void;
  ask: Record<string, any>;
}) {
  const now = new Date();
  const defaultFilename = `session-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.md`;

  const [targetDir, setTargetDir] = useState('Inbox');
  const [filename, setFilename] = useState(defaultFilename);
  const [format, setFormat] = useState<SessionSaveFormat>('full');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const filenameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      filenameRef.current?.focus();
      filenameRef.current?.select();
    }, 100);
  }, []);

  const stats = sessionPreviewStats(messages, format);
  const charLabel = stats.charCount > 1000
    ? `~${(stats.charCount / 1000).toFixed(1)}k`
    : `${stats.charCount}`;

  const safePath = (() => {
    const fn = filename.trim() || defaultFilename;
    const withExt = fn.endsWith('.md') ? fn : `${fn}.md`;
    return targetDir ? `${targetDir}/${withExt}` : withExt;
  })();

  const handleSave = useCallback(async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const content = formatSessionContent(messages, format);
      await apiFetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: safePath, op: 'create_file', content, source: 'user' }),
      });
      setSaved(true);
      const displayName = safePath.split('/').pop() ?? safePath;
      toast.success(ask.savedToKB?.replace('{path}', displayName) ?? `Saved to ${displayName}`);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      const msg = err?.message ?? 'Save failed';
      if (msg.includes('exists') || msg.includes('EEXIST')) {
        setErrorMsg(ask?.fileExistsSwitch ?? 'File already exists. Change the filename or folder.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSaving(false);
    }
  }, [messages, format, safePath, ask, onClose]);

  const previewText = formatSessionContent(messages, format).slice(0, 400);

  return (
    <div className="p-3 space-y-2.5">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={12} className="rotate-180" />
        </button>
        <FolderInput size={12} className="text-[var(--amber)]" />
        <span className="text-xs font-semibold text-foreground">{ask?.saveDirectly ?? 'Save directly'}</span>
      </div>

      {/* Folder picker */}
      <div>
        <label className="text-2xs text-muted-foreground mb-1 block">{ask?.targetFolder ?? 'Folder'}</label>
        <DirPicker
          dirPaths={dirPaths}
          value={targetDir}
          onChange={setTargetDir}
          rootLabel="Root"
        />
      </div>

      {/* Filename input */}
      <div>
        <label className="text-2xs text-muted-foreground mb-1 block">{ask?.fileName ?? 'Filename'}</label>
        <input
          ref={filenameRef}
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--amber)]/50 transition-colors"
        />
      </div>

      {/* Format selector */}
      <div className="flex items-center gap-3">
        <span className="text-2xs text-muted-foreground">Format:</span>
        {(['full', 'ai-only'] as const).map((f) => (
          <label key={f} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="archive-format" checked={format === f} onChange={() => setFormat(f)} className="w-3 h-3 accent-[var(--amber)]" />
            <span className="text-2xs text-foreground">
              {f === 'full' ? (ask?.formatFull ?? 'Full conversation') : (ask?.formatAiOnly ?? 'AI only')}
            </span>
          </label>
        ))}
      </div>

      {/* Preview */}
      <button
        type="button"
        onClick={() => setShowPreview((v) => !v)}
        className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showPreview ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {ask?.previewContent ?? 'Preview'} ({stats.msgCount} msgs, {charLabel} chars)
      </button>
      {showPreview && (
        <pre className="px-2 py-1.5 text-2xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg max-h-28 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
          {previewText}{previewText.length >= 400 ? '\n...' : ''}
        </pre>
      )}

      {/* Path preview */}
      <div className="text-2xs text-muted-foreground/70 font-mono truncate">
        {safePath}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-1.5 text-2xs text-error">
          <AlertCircle size={11} />
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/30">
        <button type="button" onClick={onClose} className="px-2.5 py-1 text-2xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          {ask?.cancelSave ?? 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || saved || !filename.trim()}
          className={`flex items-center gap-1 px-3 py-1 text-2xs font-medium rounded-md transition-colors ${
            saved ? 'bg-success/10 text-success' : 'bg-[var(--amber)] text-[var(--amber-foreground)] hover:bg-[var(--amber)]/90'
          } disabled:opacity-50`}
        >
          {saving && <Loader2 size={10} className="animate-spin" />}
          {saved && <Check size={10} />}
          {saved ? (ask?.confirmSave ?? 'Saved') : (ask?.confirmSave ?? 'Save')}
        </button>
      </div>
    </div>
  );
}

/* ── Step 2b: Digest Form (AI organize) ── */

function DigestForm({ messages, dirPaths, onBack, onClose, ask }: {
  messages: Message[];
  dirPaths: string[];
  onBack: () => void;
  onClose: () => void;
  ask: Record<string, any>;
}) {
  const now = new Date();
  const defaultFilename = `note-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.md`;

  const [targetDir, setTargetDir] = useState('Inbox');
  const [filename, setFilename] = useState(defaultFilename);
  const [phase, setPhase] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [digestContent, setDigestContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const safePath = (() => {
    const fn = filename.trim() || defaultFilename;
    const withExt = fn.endsWith('.md') ? fn : `${fn}.md`;
    return targetDir ? `${targetDir}/${withExt}` : withExt;
  })();

  // Generate digest via AI
  const handleGenerate = useCallback(async () => {
    setPhase('generating');
    setErrorMsg('');
    try {
      const sessionText = formatSessionContent(messages, 'full');
      // Use the ask API to generate a summary
      const res = await apiFetch<{ text: string }>('/api/ask/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Summarize this conversation into a concise, well-structured note. Extract key insights, decisions, and action items. Write in the same language as the conversation. Output only the note content in Markdown.\n\n---\n\n${sessionText.slice(0, 15000)}`,
        }),
      });
      setDigestContent(res.text);
      setPhase('done');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to generate summary');
      setPhase('error');
    }
  }, [messages]);

  // Auto-generate on mount
  useEffect(() => { handleGenerate(); }, [handleGenerate]);

  const handleSave = useCallback(async () => {
    if (!digestContent) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const header = `> Organized from conversation · ${yyyy}-${mm}-${dd}`;
      const content = `${header}\n\n${digestContent}`;
      await apiFetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: safePath, op: 'create_file', content, source: 'user' }),
      });
      setSaved(true);
      const displayName = safePath.split('/').pop() ?? safePath;
      toast.success(ask?.savedToKB?.replace('{path}', displayName) ?? `Saved to ${displayName}`);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [digestContent, safePath, ask, onClose, now]);

  return (
    <div className="p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={12} className="rotate-180" />
        </button>
        <Sparkles size={12} className="text-[var(--amber)]" />
        <span className="text-xs font-semibold text-foreground">{ask?.organizeToNote ?? 'Organize to note'}</span>
      </div>

      {/* AI generation status */}
      {phase === 'generating' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
          <Loader2 size={12} className="animate-spin text-[var(--amber)]" />
          <span className="text-xs text-muted-foreground">{ask?.generating ?? 'Generating summary...'}</span>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-2xs text-error">
            <AlertCircle size={11} />
            {errorMsg}
          </div>
          <button type="button" onClick={handleGenerate} className="text-2xs text-[var(--amber)] hover:underline">
            {ask?.retry ?? 'Retry'}
          </button>
        </div>
      )}

      {/* Generated content preview */}
      {phase === 'done' && digestContent && (
        <>
          <pre className="px-2.5 py-2 text-2xs text-foreground bg-muted/20 border border-border/50 rounded-lg max-h-36 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
            {digestContent.slice(0, 600)}{digestContent.length > 600 ? '\n...' : ''}
          </pre>

          {/* Folder picker */}
          <div>
            <label className="text-2xs text-muted-foreground mb-1 block">{ask?.targetFolder ?? 'Folder'}</label>
            <DirPicker dirPaths={dirPaths} value={targetDir} onChange={setTargetDir} rootLabel="Root" />
          </div>

          {/* Filename */}
          <div>
            <label className="text-2xs text-muted-foreground mb-1 block">{ask?.fileName ?? 'Filename'}</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-border bg-background text-foreground outline-none focus:border-[var(--amber)]/50 transition-colors"
            />
          </div>

          <div className="text-2xs text-muted-foreground/70 font-mono truncate">{safePath}</div>

          {errorMsg && (
            <div className="flex items-center gap-1.5 text-2xs text-error">
              <AlertCircle size={11} />
              {errorMsg}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/30">
        <button type="button" onClick={onClose} className="px-2.5 py-1 text-2xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          {ask?.cancelSave ?? 'Cancel'}
        </button>
        {phase === 'done' && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved || !digestContent}
            className={`flex items-center gap-1 px-3 py-1 text-2xs font-medium rounded-md transition-colors ${
              saved ? 'bg-success/10 text-success' : 'bg-[var(--amber)] text-[var(--amber-foreground)] hover:bg-[var(--amber)]/90'
            } disabled:opacity-50`}
          >
            {saving && <Loader2 size={10} className="animate-spin" />}
            {saved && <Check size={10} />}
            {saved ? (ask?.confirmSave ?? 'Saved') : (ask?.confirmSave ?? 'Save')}
          </button>
        )}
      </div>
    </div>
  );
}
