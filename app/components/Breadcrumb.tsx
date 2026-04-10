'use client';

import Link from 'next/link';
import { ChevronRight, Home, FileText, Table, Folder, History } from 'lucide-react';
import { useLocale } from '@/lib/stores/locale-store';

const FRIENDLY_PATHS: Record<string, { icon: React.ReactNode; getLabel: (t: ReturnType<typeof useLocale>['t']) => string }> = {
  '.mindos/change-log.json': { icon: <History size={13} className="text-[var(--amber)] shrink-0" />, getLabel: (t) => t.changes.title },
};

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (ext === '.csv') return <Table size={13} className="text-success shrink-0" />;
  if (ext) return <FileText size={13} className="text-muted-foreground shrink-0" />;
  return <Folder size={13} className="text-yellow-400 shrink-0" />;
}

export default function Breadcrumb({ filePath }: { filePath: string }) {
  const { t } = useLocale();
  const friendly = FRIENDLY_PATHS[filePath];

  if (friendly) {
    return (
      <nav className="flex items-center gap-0.5 text-xs text-muted-foreground flex-wrap">
        <Link
          href="/"
          className="p-1.5 rounded-md hover:bg-muted/50 hover:text-foreground transition-colors"
          title="Home"
        >
          <Home size={14} />
        </Link>
        <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="flex items-center gap-1.5 px-2 py-1 text-foreground font-medium">
          {friendly.icon}
          <span>{friendly.getLabel(t)}</span>
        </span>
      </nav>
    );
  }

  const parts = filePath.split('/');
  return (
    <nav className="flex items-center gap-0.5 text-xs text-muted-foreground flex-wrap">
      <Link
        href="/"
        className="p-1.5 rounded-md hover:bg-muted/50 hover:text-foreground transition-colors"
        title="Home"
      >
        <Home size={14} />
      </Link>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const href = '/view/' + parts.slice(0, i + 1).map(encodeURIComponent).join('/');
        return (
          <span key={i} className="flex items-center gap-0.5">
            <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" />
            {isLast ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-foreground font-medium">
                <FileTypeIcon name={part} />
                <span suppressHydrationWarning>{part}</span>
              </span>
            ) : (
              <Link href={href} className="px-2 py-1 rounded-md hover:bg-muted/50 hover:text-foreground transition-colors truncate max-w-[200px]" title={part}>
                <span suppressHydrationWarning>{part}</span>
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
