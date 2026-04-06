'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Brain, ChevronDown, Upload, Sparkles, Inbox, Loader2, FolderOpen } from 'lucide-react';
import { useLocale } from '@/lib/stores/locale-store';
import { encodePath, extractEmoji, stripEmoji } from '@/lib/utils';
import PanelHeader from './PanelHeader';
import { InboxSection } from '@/components/home/InboxSection';
import type { FileNode } from '@/lib/types';

interface SpaceInfo {
  name: string;
  path: string;
  fileCount: number;
  description: string;
}

interface RecentFile {
  path: string;
  mtime: number;
}

interface WikiHomePanelProps {
  fileTree: FileNode[];
  active: boolean;
  maximized: boolean;
  onMaximize: () => void;
}

/**
 * Summarize top-level spaces from file tree
 * Mimics logic from HomeContent.tsx
 */
function summarizeTopLevelSpaces(tree: FileNode[]): SpaceInfo[] {
  const spaces: SpaceInfo[] = [];
  
  for (const node of tree) {
    if (node.type === 'directory' && !node.name.startsWith('.')) {
      // Count files recursively
      const countFiles = (nodes: FileNode[] | undefined): number => {
        if (!nodes) return 0;
        let count = 0;
        for (const n of nodes) {
          if (n.type === 'file' && (n.name.endsWith('.md') || n.name.endsWith('.csv'))) {
            count++;
          } else if (n.type === 'directory' && !n.name.startsWith('.')) {
            count += countFiles(n.children);
          }
        }
        return count;
      };

      spaces.push({
        name: node.name,
        path: `${node.name}/`,
        fileCount: countFiles(node.children),
        description: node.spacePreview?.readmeLines?.[0] ?? '',
      });
    }
  }

  return spaces;
}

/**
 * Calculate the max mtime for a space (most recent update)
 */
function getSpaceLatestMtime(spaceName: string, recentFiles: RecentFile[]): number {
  let maxMtime = 0;
  for (const file of recentFiles) {
    if (file.path.startsWith(`${spaceName}/`)) {
      maxMtime = Math.max(maxMtime, file.mtime);
    }
  }
  return maxMtime;
}

/**
 * Format relative time
 */
function formatRelativeTime(mtime: number, now = Date.now()): string {
  const diff = now - mtime;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function WikiHomePanel({ fileTree, active, maximized, onMaximize }: WikiHomePanelProps) {
  const { t } = useLocale();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'fileCount'>('recent');
  const [showAllSpaces, setShowAllSpaces] = useState(false);

  // Summarize spaces from fileTree (no API needed, pure front-end)
  const spaces = useMemo(() => summarizeTopLevelSpaces(fileTree), [fileTree]);

  // Fetch recent files on mount and when active
  useEffect(() => {
    if (!active) return;

    const abortController = new AbortController();
    let isMounted = true;

    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/recent-files?limit=20', { signal: abortController.signal });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setRecentFiles(Array.isArray(data) ? data : []);
            setError(null);
            setLoading(false);
          }
        } else if (isMounted) {
          setError('Failed to load recent files');
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn('[WikiHomePanel] Failed to fetch recent files:', err);
          if (isMounted) {
            setError('Failed to load recent files');
            setLoading(false);
          }
        }
      }
    };

    fetchRecent();

    const handleFileChange = () => {
      fetchRecent();
    };

    window.addEventListener('mindos:files-changed', handleFileChange);

    return () => {
      isMounted = false;
      abortController.abort();
      window.removeEventListener('mindos:files-changed', handleFileChange);
    };
  }, [active]);

  // Sort spaces based on sortBy state
  const sortedSpaces = useMemo(() => {
    const sorted = [...spaces];
    
    if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const aMtime = getSpaceLatestMtime(a.name, recentFiles);
        const bMtime = getSpaceLatestMtime(b.name, recentFiles);
        return bMtime - aMtime;
      });
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'fileCount') {
      sorted.sort((a, b) => b.fileCount - a.fileCount);
    }

    return sorted;
  }, [spaces, recentFiles, sortBy]);

  const visibleSpaces = showAllSpaces ? sortedSpaces : sortedSpaces.slice(0, 8);

  return (
    <div className="flex flex-col h-full">
      <PanelHeader 
        title={t.sidebar.wiki ?? 'Wiki'}
        onMaximize={onMaximize}
        maximized={maximized}
      >
        <div className="flex items-center gap-0.5">
          {/* Spacer */}
        </div>
      </PanelHeader>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-3">
        
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-[var(--amber)]" />
            <h1 className="text-sm font-semibold text-foreground">Wiki</h1>
          </div>
          <p className="text-xs text-muted-foreground pl-6 mb-4">
            Your knowledge spaces, organized.
          </p>
        </div>

        {/* Spaces Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[var(--amber)]">
              <FolderOpen size={13} />
            </span>
            <h2 className="text-xs font-semibold text-foreground">
              Your Spaces
            </h2>
            {spaces.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-2xs font-semibold rounded-full bg-[var(--amber)]/15 text-[var(--amber)] tabular-nums">
                {spaces.length}
              </span>
            )}
            {spaces.length > 0 && (
              <div className="ml-auto">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-2xs font-medium text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1.5 py-0.5 transition-colors"
                >
                  <option value="recent">Recent</option>
                  <option value="name">A-Z</option>
                  <option value="fileCount">Count</option>
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-error/50 bg-error/5 px-3 py-2 mb-3">
              <p className="text-2xs text-error">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-2xs text-error hover:underline mt-1"
              >
                Retry
              </button>
            </div>
          )}

          {spaces.length === 0 ? (
            /* Empty state */
            <div className="rounded-xl border-2 border-dashed border-border px-4 py-8 text-center">
              <FolderOpen size={20} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs font-medium text-muted-foreground/70">No spaces yet</p>
              <p className="text-2xs text-muted-foreground/50 mt-1">
                Create your first space to organize your knowledge
              </p>
              <button
                onClick={() => window.dispatchEvent(new Event('mindos:create-space'))}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-[var(--amber)] text-[var(--amber-foreground)] hover:opacity-80"
              >
                Create Space
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {visibleSpaces.map((space) => {
                  const emoji = extractEmoji(space.name);
                  const label = stripEmoji(space.name);
                  const latestMtime = getSpaceLatestMtime(space.name, recentFiles);
                  const updatedTime = formatRelativeTime(latestMtime);

                  return (
                    <Link
                      key={space.name}
                      href={`/view/${encodePath(space.path)}`}
                      className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-border transition-all duration-150 hover:border-[var(--amber)]/30 hover:shadow-sm hover:translate-x-0.5 group"
                    >
                      {emoji ? (
                        <span className="text-base leading-none shrink-0 mt-0.5">
                          {emoji}
                        </span>
                      ) : (
                        <FolderOpen size={14} className="shrink-0 text-[var(--amber)] mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold truncate block text-foreground">
                          {label}
                        </span>
                        {space.description && (
                          <span className="text-2xs text-muted-foreground line-clamp-1 mt-0.5">
                            {space.description}
                          </span>
                        )}
                        <span className="text-2xs text-muted-foreground/50 mt-1 block tabular-nums">
                          {space.fileCount} files • {updatedTime}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {sortedSpaces.length > 8 && (
                <button
                  onClick={() => setShowAllSpaces(!showAllSpaces)}
                  className="flex items-center gap-1.5 mt-3 text-2xs font-medium text-[var(--amber)] transition-colors hover:opacity-80 cursor-pointer"
                >
                  <ChevronDown size={10} className={`transition-transform ${showAllSpaces ? 'rotate-180' : ''}`} />
                  <span>
                    {showAllSpaces
                      ? 'Show less'
                      : `Show ${sortedSpaces.length - 8} more`}
                  </span>
                </button>
              )}
            </>
          )}
        </section>

        {/* Inbox Section - reuse the existing component */}
        <InboxSection />
      </div>
    </div>
  );
}
