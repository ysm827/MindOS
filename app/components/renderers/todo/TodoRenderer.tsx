'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  CheckSquare, Square, ChevronDown, ChevronRight, Plus, Trash2,
  Circle, Clock, Calendar, Filter, X,
} from 'lucide-react';
import type { RendererContext } from '@/lib/renderers/registry';

// ─── Types ───────────────────────────────────────────────────────────────────

type TodoStatus = 'todo' | 'in-progress' | 'done';
type Priority = 'P0' | 'P1' | 'P2' | null;

interface TodoMeta {
  priority: Priority;
  dueDate: string | null;
  tags: string[];
}

interface TodoItem {
  id: string;
  text: string;
  rawText: string;
  status: TodoStatus;
  indent: number;
  lineIndex: number;
  section: string;
  children: TodoItem[];
  meta: TodoMeta;
}

interface SectionMeta {
  items: TodoItem[];
  lastLineIndex: number;
  headingLineIndex: number;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const H2_SECTION_RE = /^##\s+(.+)/;
const H1_RE = /^#\s+/;
const H3_PLUS_RE = /^#{3,6}\s+(.+)/;
const TODO_RE = /^(\s*)- \[([ xX~])\]\s+(.*)$/;
const PRIORITY_RE = /`(P[012])`/;
const DATE_RE = /`(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})`/;
const TAG_RE = /#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)/g;

function extractMeta(rawText: string): { cleanText: string; meta: TodoMeta } {
  let text = rawText;
  let priority: Priority = null;
  let dueDate: string | null = null;
  const tags: string[] = [];

  const pMatch = text.match(PRIORITY_RE);
  if (pMatch) {
    priority = pMatch[1] as Priority;
    text = text.replace(PRIORITY_RE, '').trim();
  }

  const dMatch = text.match(DATE_RE);
  if (dMatch) {
    dueDate = dMatch[1];
    text = text.replace(DATE_RE, '').trim();
  }

  let tMatch: RegExpExecArray | null;
  const tagRe = new RegExp(TAG_RE.source, 'g');
  while ((tMatch = tagRe.exec(text)) !== null) {
    tags.push(tMatch[1]);
  }
  if (tags.length > 0) {
    text = text.replace(/#[a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff-]*/g, '').trim();
  }

  text = text.replace(/\*\*(.*?)\*\*/g, '$1').trim();

  return { cleanText: text, meta: { priority, dueDate, tags } };
}

function parseStatus(checkChar: string): TodoStatus {
  if (checkChar === '~') return 'in-progress';
  if (checkChar.toLowerCase() === 'x') return 'done';
  return 'todo';
}

function parseMarkdownTodos(raw: string): {
  sections: Record<string, SectionMeta>;
  lines: string[];
  sectionOrder: string[];
} {
  const lines = raw.split('\n');
  let currentSection = 'General';
  const sections: Record<string, SectionMeta> = {};
  const sectionOrder: string[] = [];
  const stack: TodoItem[] = [];

  let inFrontmatter = false;
  let frontmatterDone = false;

  lines.forEach((line, lineIndex) => {
    if (!frontmatterDone) {
      if (lineIndex === 0 && line.trim() === '---') { inFrontmatter = true; return; }
      if (inFrontmatter) {
        if (line.trim() === '---') { inFrontmatter = false; frontmatterDone = true; }
        return;
      }
      frontmatterDone = true;
    }

    if (H1_RE.test(line)) return;

    const h2Match = line.match(H2_SECTION_RE);
    if (h2Match) {
      currentSection = h2Match[1].replace(/^[^\w\s\u4e00-\u9fff]+\s*/, '').trim();
      if (!sections[currentSection]) {
        sections[currentSection] = { items: [], lastLineIndex: -1, headingLineIndex: lineIndex };
        sectionOrder.push(currentSection);
      }
      return;
    }

    if (H3_PLUS_RE.test(line)) return;

    const todoMatch = line.match(TODO_RE);
    if (!todoMatch) return;

    const [, indentStr, checkChar, rawText] = todoMatch;
    const indent = Math.floor(indentStr.length / 2);
    const status = parseStatus(checkChar);
    const { cleanText, meta } = extractMeta(rawText);

    const item: TodoItem = {
      id: `${lineIndex}`,
      text: cleanText,
      rawText,
      status,
      indent,
      lineIndex,
      section: currentSection,
      children: [],
      meta,
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (!sections[currentSection]) {
      sections[currentSection] = { items: [], lastLineIndex: -1, headingLineIndex: -1 };
      sectionOrder.push(currentSection);
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(item);
    } else {
      sections[currentSection].items.push(item);
    }

    sections[currentSection].lastLineIndex = Math.max(
      sections[currentSection].lastLineIndex,
      lineIndex,
    );

    stack.push(item);
  });

  return { sections, lines, sectionOrder };
}

// ─── Line operations ─────────────────────────────────────────────────────────

function applyLines(lines: string[], ops: (l: string[]) => void): string {
  const next = [...lines];
  ops(next);
  return next.join('\n');
}

function statusChar(s: TodoStatus): string {
  if (s === 'done') return 'x';
  if (s === 'in-progress') return '~';
  return ' ';
}

function setStatusInLines(lines: string[], lineIndex: number, status: TodoStatus): string {
  return applyLines(lines, (l) => {
    l[lineIndex] = l[lineIndex].replace(/- \[[ xX~]\]/, `- [${statusChar(status)}]`);
  });
}

function renameInLines(lines: string[], lineIndex: number, newText: string): string {
  return applyLines(lines, (l) => {
    l[lineIndex] = l[lineIndex].replace(/(- \[[ xX~]\]\s*)(.*)$/, `$1${newText}`);
  });
}

function deleteInLines(lines: string[], lineIndex: number): string {
  return applyLines(lines, (l) => {
    l.splice(lineIndex, 1);
  });
}

function addInLines(lines: string[], afterLineIndex: number, text: string): string {
  return applyLines(lines, (l) => {
    const insertAt = afterLineIndex < 0 ? l.length : afterLineIndex + 1;
    l.splice(insertAt, 0, `- [ ] ${text}`);
  });
}

function cycleStatus(current: TodoStatus): TodoStatus {
  if (current === 'todo') return 'in-progress';
  if (current === 'in-progress') return 'done';
  return 'todo';
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function resolveDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const now = new Date();
  if (/^\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${now.getFullYear()}-${dateStr}`);
  }
  return new Date(dateStr);
}

type DateUrgency = 'overdue' | 'today' | 'soon' | 'future' | null;

function dateUrgency(dateStr: string | null): DateUrgency {
  const d = resolveDate(dateStr);
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  return 'future';
}

// ─── Style constants ─────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  P0: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' },
  P1: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' },
  P2: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
};

const DATE_STYLES: Record<string, { text: string; bg: string }> = {
  overdue: { text: 'text-red-500', bg: 'bg-red-500/10' },
  today:   { text: 'text-amber-500', bg: 'bg-amber-500/10' },
  soon:    { text: 'text-amber-400', bg: 'bg-amber-400/5' },
  future:  { text: 'text-muted-foreground', bg: '' },
};

const SECTION_STYLES: Record<string, { dot: string; label: string }> = {
  'TODAY':       { dot: 'bg-red-400',    label: 'text-red-400' },
  'This Week':   { dot: 'bg-orange-400', label: 'text-orange-400' },
  'Workflows':   { dot: 'bg-amber-400',  label: 'text-amber-400' },
  'Backlog':     { dot: 'bg-blue-400',   label: 'text-blue-400' },
  'Done':        { dot: 'bg-emerald-400', label: 'text-emerald-400' },
  'Maintenance': { dot: 'bg-zinc-400',   label: 'text-zinc-400' },
};

function sectionStyle(name: string) {
  const key = Object.keys(SECTION_STYLES).find(k => name.includes(k));
  return key ? SECTION_STYLES[key] : { dot: 'bg-zinc-500', label: 'text-zinc-400' };
}

// ─── Counting ────────────────────────────────────────────────────────────────

function countByStatus(items: TodoItem[], status: TodoStatus): number {
  return items.reduce((n, item) => n + (item.status === status ? 1 : 0) + countByStatus(item.children, status), 0);
}

function countTotal(items: TodoItem[]): number {
  return items.reduce((n, item) => n + 1 + countTotal(item.children), 0);
}

function collectAllTags(sections: Record<string, SectionMeta>): string[] {
  const tagSet = new Set<string>();
  function walk(items: TodoItem[]) {
    for (const item of items) {
      for (const tag of item.meta.tags) tagSet.add(tag);
      walk(item.children);
    }
  }
  for (const meta of Object.values(sections)) walk(meta.items);
  return [...tagSet].sort();
}

function collectAllPriorities(sections: Record<string, SectionMeta>): Priority[] {
  const pSet = new Set<Priority>();
  function walk(items: TodoItem[]) {
    for (const item of items) {
      if (item.meta.priority) pSet.add(item.meta.priority);
      walk(item.children);
    }
  }
  for (const meta of Object.values(sections)) walk(meta.items);
  const order: Priority[] = ['P0', 'P1', 'P2'];
  return order.filter(p => pSet.has(p));
}

// ─── Filter bar ──────────────────────────────────────────────────────────────

interface FilterState {
  priority: Priority | 'all';
  tag: string | 'all';
  status: TodoStatus | 'all';
}

function FilterBar({ filters, onFilterChange, allTags, allPriorities, counts }: {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  allTags: string[];
  allPriorities: Priority[];
  counts: { todo: number; inProgress: number; done: number; total: number };
}) {
  const hasFilters = filters.priority !== 'all' || filters.tag !== 'all' || filters.status !== 'all';

  if (allTags.length === 0 && allPriorities.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <Filter size={12} className="text-muted-foreground shrink-0" />

      {/* Status filter */}
      <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
        <button
          onClick={() => onFilterChange({ ...filters, status: 'all' })}
          className={`px-2.5 py-1 transition-colors ${filters.status === 'all' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          All {counts.total}
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, status: 'todo' })}
          className={`px-2.5 py-1 transition-colors border-l border-border ${filters.status === 'todo' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          Todo {counts.todo}
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, status: 'in-progress' })}
          className={`px-2.5 py-1 transition-colors border-l border-border ${filters.status === 'in-progress' ? 'bg-amber-500/10 text-amber-500 font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          In Progress {counts.inProgress}
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, status: 'done' })}
          className={`px-2.5 py-1 transition-colors border-l border-border ${filters.status === 'done' ? 'bg-emerald-500/10 text-emerald-500 font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
        >
          Done {counts.done}
        </button>
      </div>

      {/* Priority filter */}
      {allPriorities.length > 0 && (
        <div className="flex items-center gap-1">
          {allPriorities.map(p => {
            if (!p) return null;
            const s = PRIORITY_STYLES[p];
            const active = filters.priority === p;
            return (
              <button
                key={p}
                onClick={() => onFilterChange({ ...filters, priority: active ? 'all' : p })}
                className={`px-2 py-0.5 rounded text-xs font-mono font-medium border transition-colors ${
                  active
                    ? `${s.bg} ${s.text} ${s.border}`
                    : 'border-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1">
          {allTags.map(tag => {
            const active = filters.tag === tag;
            return (
              <button
                key={tag}
                onClick={() => onFilterChange({ ...filters, tag: active ? 'all' : tag })}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                  active
                    ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {hasFilters && (
        <button
          onClick={() => onFilterChange({ priority: 'all', tag: 'all', status: 'all' })}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={10} /> Clear
        </button>
      )}
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  if (!priority) return null;
  const s = PRIORITY_STYLES[priority];
  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-mono font-semibold leading-4 border shrink-0 ${s.bg} ${s.text} ${s.border}`}>
      {priority}
    </span>
  );
}

function DueDateBadge({ dateStr, status }: { dateStr: string | null; status: TodoStatus }) {
  if (!dateStr || status === 'done') return null;
  const urgency = dateUrgency(dateStr);
  if (!urgency) return null;
  const s = DATE_STYLES[urgency];
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] leading-4 shrink-0 ${s.text} ${s.bg}`}>
      <Calendar size={9} />
      {dateStr}
    </span>
  );
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] leading-4 text-muted-foreground bg-muted/60 shrink-0">
      #{tag}
    </span>
  );
}

function StatusIcon({ status, onClick }: { status: TodoStatus; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 transition-colors" title="Click to cycle status">
      {status === 'done' && (
        <CheckSquare size={15} style={{ color: 'var(--amber)' }} />
      )}
      {status === 'in-progress' && (
        <Circle size={15} className="text-amber-500 fill-amber-500/20" />
      )}
      {status === 'todo' && (
        <Square size={15} style={{ color: 'var(--muted-foreground)' }} />
      )}
    </button>
  );
}

// ─── Inline editable text ────────────────────────────────────────────────────

function InlineText({
  text,
  status,
  onRename,
}: {
  text: string;
  status: TodoStatus;
  onRename: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(text); }, [text]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== text) onRename(trimmed);
    else setValue(text);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(text); setEditing(false); }
        }}
        className="flex-1 bg-transparent border-b text-sm leading-relaxed outline-none min-w-0"
        style={{ borderColor: 'var(--amber)', color: 'var(--foreground)' }}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`flex-1 text-sm leading-relaxed cursor-text min-w-0 ${
        status === 'done'
          ? 'line-through text-muted-foreground'
          : status === 'in-progress'
            ? 'text-foreground'
            : 'text-foreground'
      }`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {text}
    </span>
  );
}

// ─── Add item input ──────────────────────────────────────────────────────────

function AddItemRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setActive(false);
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-muted/60 mt-1"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <Plus size={12} />
        <span>Add item</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mt-1">
      <span className="w-[13px] shrink-0" />
      <span className="shrink-0" style={{ color: 'var(--muted-foreground)' }}>
        <Square size={15} />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(''); setActive(false); }
        }}
        placeholder="New item… (supports `P0` `03-28` #tag)"
        className="flex-1 bg-transparent border-b text-sm outline-none"
        style={{ borderColor: 'var(--amber)', color: 'var(--foreground)' }}
      />
    </div>
  );
}

// ─── Todo item row ───────────────────────────────────────────────────────────

function matchesFilter(item: TodoItem, filters: FilterState): boolean {
  if (filters.status !== 'all' && item.status !== filters.status) return false;
  if (filters.priority !== 'all' && item.meta.priority !== filters.priority) return false;
  if (filters.tag !== 'all' && !item.meta.tags.includes(filters.tag)) return false;
  return true;
}

function hasMatchingDescendant(item: TodoItem, filters: FilterState): boolean {
  if (matchesFilter(item, filters)) return true;
  return item.children.some(c => hasMatchingDescendant(c, filters));
}

function TodoItemRow({
  item,
  depth,
  filters,
  onCycleStatus,
  onRename,
  onDelete,
}: {
  item: TodoItem;
  depth: number;
  filters: FilterState;
  onCycleStatus: (lineIndex: number, newStatus: TodoStatus) => void;
  onRename: (lineIndex: number, newText: string) => void;
  onDelete: (lineIndex: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = item.children.length > 0;
  const selfMatch = matchesFilter(item, filters);
  const childMatch = item.children.some(c => hasMatchingDescendant(c, filters));
  const noFilter = filters.status === 'all' && filters.priority === 'all' && filters.tag === 'all';

  if (!noFilter && !selfMatch && !childMatch) return null;

  const urgency = dateUrgency(item.meta.dueDate);

  return (
    <div>
      <div
        className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors hover:bg-muted/60 ${
          item.status === 'done' ? 'opacity-45' : ''
        } ${urgency === 'overdue' && item.status !== 'done' ? 'bg-red-500/[0.03]' : ''}`}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen(v => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}

        <StatusIcon
          status={item.status}
          onClick={() => onCycleStatus(item.lineIndex, cycleStatus(item.status))}
        />

        <InlineText
          text={item.text}
          status={item.status}
          onRename={(newText) => onRename(item.lineIndex, newText)}
        />

        <div className="flex items-center gap-1 shrink-0">
          <PriorityBadge priority={item.meta.priority} />
          <DueDateBadge dateStr={item.meta.dueDate} status={item.status} />
          {item.meta.tags.map(tag => <TagBadge key={tag} tag={tag} />)}
        </div>

        <button
          onClick={() => onDelete(item.lineIndex)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
          style={{ color: 'var(--muted-foreground)' }}
          title="Delete item"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {hasChildren && open && (
        <div>
          {item.children.map(child => (
            <TodoItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              filters={filters}
              onCycleStatus={onCycleStatus}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section card ────────────────────────────────────────────────────────────

function SectionCard({
  name,
  meta,
  filters,
  defaultCollapsed,
  onCycleStatus,
  onRename,
  onDelete,
  onAdd,
}: {
  name: string;
  meta: SectionMeta;
  filters: FilterState;
  defaultCollapsed?: boolean;
  onCycleStatus: (lineIndex: number, newStatus: TodoStatus) => void;
  onRename: (lineIndex: number, newText: string) => void;
  onDelete: (lineIndex: number) => void;
  onAdd: (afterLineIndex: number, text: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const style = sectionStyle(name);
  const { items, lastLineIndex } = meta;
  const done = countByStatus(items, 'done');
  const inProgress = countByStatus(items, 'in-progress');
  const total = countTotal(items);
  const isDoneSection = name.includes('Done');

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${style.label} font-display`}>
            {name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {done}/{total}
          </span>
          {inProgress > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <Clock size={9} /> {inProgress}
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronRight size={14} className="text-muted-foreground" />
          : <ChevronDown size={14} className="text-muted-foreground" />
        }
      </button>

      <div className="h-0.5 bg-muted mx-4">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: total ? `${(done / total) * 100}%` : '0%',
            background: isDoneSection ? 'var(--success, #22c55e)' : 'var(--amber)',
          }}
        />
      </div>

      {!collapsed && (
        <div className="px-2 py-2">
          {items.map(item => (
            <TodoItemRow
              key={item.id}
              item={item}
              depth={0}
              filters={filters}
              onCycleStatus={onCycleStatus}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-2">No items</p>
          )}
          {!isDoneSection && (
            <AddItemRow onAdd={(text) => onAdd(lastLineIndex, text)} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Renderer ───────────────────────────────────────────────────────────

export function TodoRenderer({ content, saveAction }: RendererContext) {
  const [localContent, setLocalContent] = useState(content);
  const [filters, setFilters] = useState<FilterState>({ priority: 'all', tag: 'all', status: 'all' });

  const { sections, lines, sectionOrder } = useMemo(
    () => parseMarkdownTodos(localContent),
    [localContent],
  );

  const totalDone = useMemo(
    () => Object.values(sections).reduce((n, m) => n + countByStatus(m.items, 'done'), 0),
    [sections],
  );
  const totalInProgress = useMemo(
    () => Object.values(sections).reduce((n, m) => n + countByStatus(m.items, 'in-progress'), 0),
    [sections],
  );
  const totalItems = useMemo(
    () => Object.values(sections).reduce((n, m) => n + countTotal(m.items), 0),
    [sections],
  );
  const totalTodo = totalItems - totalDone - totalInProgress;

  const allTags = useMemo(() => collectAllTags(sections), [sections]);
  const allPriorities = useMemo(() => collectAllPriorities(sections), [sections]);

  const persist = useCallback(async (next: string) => {
    setLocalContent(next);
    await saveAction(next);
  }, [saveAction]);

  const handleCycleStatus = useCallback(async (lineIndex: number, newStatus: TodoStatus) => {
    await persist(setStatusInLines(lines, lineIndex, newStatus));
  }, [lines, persist]);

  const handleRename = useCallback(async (lineIndex: number, newText: string) => {
    await persist(renameInLines(lines, lineIndex, newText));
  }, [lines, persist]);

  const handleDelete = useCallback(async (lineIndex: number) => {
    await persist(deleteInLines(lines, lineIndex));
  }, [lines, persist]);

  const handleAdd = useCallback(async (afterLineIndex: number, text: string) => {
    await persist(addInLines(lines, afterLineIndex, text));
  }, [lines, persist]);

  const sectionEntries = sectionOrder
    .filter(name => sections[name])
    .map(name => [name, sections[name]] as [string, SectionMeta]);

  const pct = totalItems ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <div className="max-w-[900px] mx-auto xl:mr-[220px] px-0 py-2">
      {/* Summary header */}
      <div className="mb-5 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold font-display text-foreground tabular-nums">
              {pct}%
            </span>
            <span className="text-xs text-muted-foreground font-display">
              {totalDone}/{totalItems} completed
            </span>
            {totalInProgress > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <Circle size={8} className="fill-amber-500/30" />
                {totalInProgress} in progress
              </span>
            )}
          </div>
          <div className="mt-2 w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--amber)' }}
            />
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        allTags={allTags}
        allPriorities={allPriorities}
        counts={{
          todo: totalTodo,
          inProgress: totalInProgress,
          done: totalDone,
          total: totalItems,
        }}
      />

      {/* Sections */}
      <div className="flex flex-col gap-4">
        {sectionEntries.map(([name, meta]) => (
          <SectionCard
            key={name}
            name={name}
            meta={meta}
            filters={filters}
            defaultCollapsed={name.includes('Done')}
            onCycleStatus={handleCycleStatus}
            onRename={handleRename}
            onDelete={handleDelete}
            onAdd={handleAdd}
          />
        ))}
        {sectionEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">No TODO items found in this file.</p>
        )}
      </div>
    </div>
  );
}
