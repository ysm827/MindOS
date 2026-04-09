'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, SkipForward, Plus, Edit2, Trash2 } from 'lucide-react';
import { type ProviderId, PROVIDER_PRESETS, groupedProviders } from '@/lib/agent/providers';
import { type CustomProvider } from '@/lib/custom-endpoints';
import { useLocale } from '@/lib/stores/locale-store';

interface ProviderSelectProps {
  value: ProviderId | 'skip';
  onChange: (id: ProviderId | 'skip') => void;
  showSkip?: boolean;
  compact?: boolean;
  configuredProviders?: Set<ProviderId>;
  customProviders?: CustomProvider[];
  onAddCustom?: () => void;
  onEditCustom?: (id: string) => void;
  onDeleteCustom?: (id: string) => void;
}

export default function ProviderSelect({
  value, onChange, showSkip = false, compact = false, configuredProviders,
  customProviders, onAddCustom, onEditCustom, onDeleteCustom,
}: ProviderSelectProps) {
  const { locale } = useLocale();
  const [showMore, setShowMore] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const groups = groupedProviders();

  const renderItem = (id: ProviderId) => {
    const preset = PROVIDER_PRESETS[id];
    const displayName = locale === 'zh' ? preset.nameZh : preset.name;
    const description = locale === 'zh' ? preset.descriptionZh : preset.description;
    const isSelected = value === id;
    const isConfigured = configuredProviders?.has(id);

    if (compact) {
      return (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all text-sm ${
            isSelected
              ? 'border-[var(--amber)] bg-[var(--amber-subtle)] shadow-sm'
              : 'border-border/50 hover:border-border hover:bg-muted/30'
          }`}
        >
          <span className={`font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
            {displayName}
          </span>
          {isConfigured && !isSelected && (
            <CheckCircle2 size={12} className="text-success ml-auto shrink-0" />
          )}
          {isSelected && (
            <CheckCircle2 size={14} className="ml-auto shrink-0" style={{ color: 'var(--amber)' }} />
          )}
        </button>
      );
    }

    return (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className="flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150"
        style={{
          background: isSelected ? 'var(--amber-dim)' : 'var(--card)',
          borderColor: isSelected ? 'var(--amber)' : 'var(--border)',
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{displayName}</p>
          {description && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {description}
            </p>
          )}
          <p className={`text-xs ${description ? 'mt-1' : 'mt-0.5'}`} style={{ color: 'var(--muted-foreground)' }}>
            {preset.defaultModel}
          </p>
        </div>
        {isConfigured && !isSelected && (
          <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
        )}
        {isSelected && (
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
        )}
      </button>
    );
  };

  const hasCustom = customProviders && customProviders.length > 0;
  const hasCustomSection = onAddCustom != null;
  const { primary: primaryItems, more: moreItems } = groups;

  return (
    <div className="space-y-2">
      {/* Primary providers — always visible */}
      <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 gap-2'}>
        {primaryItems.map(renderItem)}
      </div>

      {/* Show more toggle */}
      {(moreItems.length > 0 || hasCustomSection) && (
        <>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <ChevronDown size={12} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
            {showMore
              ? (locale === 'zh' ? '收起' : 'Show less')
              : (locale === 'zh'
                  ? `更多${hasCustom ? ` (${moreItems.length + customProviders!.length})` : moreItems.length > 0 ? ` (${moreItems.length})` : ''}`
                  : `More${hasCustom ? ` (${moreItems.length + customProviders!.length})` : moreItems.length > 0 ? ` (${moreItems.length})` : ''}`)}
          </button>

          {showMore && (
            <div className="space-y-2">
              {/* Built-in "more" providers */}
              {moreItems.length > 0 && (
                <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 gap-2'}>
                  {moreItems.map(renderItem)}
                </div>
              )}

              {/* Custom providers */}
              {hasCustomSection && (
                <div className="space-y-2">
                  {hasCustom && (
                    <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 gap-2'}>
                      {customProviders!.map(cp => (
                        <div
                          key={cp.id}
                          className={`flex items-center gap-2 rounded-lg border text-left transition-all group ${
                            compact
                              ? 'px-3 py-2 text-sm border-border/50 hover:border-border hover:bg-muted/30'
                              : 'p-3 border-border/50 hover:border-border'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className={`font-medium text-muted-foreground ${compact ? 'text-sm' : 'text-sm'}`}>{cp.name}</span>
                            {!compact && (
                              <span className="text-xs text-muted-foreground/50 ml-2">{cp.model}</span>
                            )}
                          </div>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {onEditCustom && (
                              <button
                                type="button"
                                onClick={() => onEditCustom(cp.id)}
                                className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                            {onDeleteCustom && (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(cp.id)}
                                className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add custom provider button */}
                  <button
                    type="button"
                    onClick={onAddCustom}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <Plus size={12} />
                    {locale === 'zh' ? '自定义 Provider' : 'Custom Provider'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Skip option — only in onboarding */}
      {showSkip && (
        <button
          type="button"
          onClick={() => onChange('skip')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all text-sm w-full mt-1"
          style={{
            background: value === 'skip' ? 'var(--amber-dim)' : 'var(--card)',
            borderColor: value === 'skip' ? 'var(--amber)' : 'var(--border)',
          }}
        >
          <SkipForward size={14} className="shrink-0" style={{ color: value === 'skip' ? 'var(--amber)' : 'var(--muted-foreground)' }} />
          <span className={`font-medium ${value === 'skip' ? 'text-foreground' : 'text-muted-foreground'}`}>
            {locale === 'zh' ? '暂时跳过' : 'Skip for now'}
          </span>
          {value === 'skip' && (
            <CheckCircle2 size={14} className="ml-auto shrink-0" style={{ color: 'var(--amber)' }} />
          )}
        </button>
      )}

      {/* Inline delete confirmation */}
      {deleteConfirmId && onDeleteCustom && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/20 bg-destructive/5">
          <span className="text-xs text-destructive flex-1">
            {locale === 'zh'
              ? `删除 "${customProviders?.find(p => p.id === deleteConfirmId)?.name}"？`
              : `Delete "${customProviders?.find(p => p.id === deleteConfirmId)?.name}"?`}
          </span>
          <button
            type="button"
            onClick={() => setDeleteConfirmId(null)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded transition-colors"
          >
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => { onDeleteCustom(deleteConfirmId); setDeleteConfirmId(null); }}
            className="text-xs text-destructive font-medium hover:bg-destructive/10 px-2 py-0.5 rounded transition-colors"
          >
            {locale === 'zh' ? '删除' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}
