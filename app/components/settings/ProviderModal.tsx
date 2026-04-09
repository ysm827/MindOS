'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, AlertCircle, Loader2, Check } from 'lucide-react';
import { useLocale } from '@/lib/stores/locale-store';
import { type Messages } from '@/lib/i18n';
import { type CustomProvider, generateCustomProviderId } from '@/lib/custom-endpoints';
import { PROVIDER_PRESETS, type ProviderId, groupedProviders } from '@/lib/agent/providers';
import { Field, Input, Select, PasswordInput } from './Primitives';
import ProviderSelect from '@/components/shared/ProviderSelect';
import ModelInput from '@/components/shared/ModelInput';

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: CustomProvider) => void;
  initialProvider?: CustomProvider;
  t: Messages;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

export default function ProviderModal({
  isOpen,
  onClose,
  onSave,
  initialProvider,
  t,
}: ProviderModalProps) {
  const { locale } = useLocale();
  const [name, setName] = useState('');
  const [baseProviderId, setBaseProviderId] = useState<ProviderId>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialProvider) {
      setName(initialProvider.name);
      setBaseProviderId(initialProvider.baseProviderId);
      setApiKey(initialProvider.apiKey === '***set***' ? '' : initialProvider.apiKey);
      setModel(initialProvider.model);
      setBaseUrl(initialProvider.baseUrl);
    } else {
      setName('');
      setBaseProviderId('openai');
      setApiKey('');
      setModel('');
      setBaseUrl('');
    }
    setTestState('idle');
    setTestError('');
  }, [initialProvider, isOpen]);

  const handleTest = useCallback(async () => {
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      setTestError('Name, base URL, and model are required');
      return;
    }

    setTestState('testing');
    setTestError('');

    try {
      const res = await fetch('/api/settings/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          initialProvider?.id
            ? { provider: initialProvider.id, apiKey, model, baseUrl }
            : { baseProviderId, apiKey, model, baseUrl },
        ),
      });

      const json = await res.json();

      if (json.ok) {
        setTestState('ok');
      } else {
        setTestState('error');
        setTestError(json.error || 'Test failed');
      }
    } catch (err) {
      setTestState('error');
      setTestError('Network error');
    }
  }, [name, baseUrl, model, apiKey, baseProviderId, initialProvider?.id]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      setTestError('Name, base URL, and model are required');
      return;
    }

    setIsSaving(true);

    try {
      const provider: CustomProvider = {
        id: initialProvider?.id || generateCustomProviderId(),
        name: name.trim(),
        baseProviderId,
        apiKey,
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      };

      onSave(provider);
    } finally {
      setIsSaving(false);
    }
  }, [name, baseUrl, model, apiKey, baseProviderId, initialProvider, onSave]);

  if (!isOpen) return null;

  const preset = PROVIDER_PRESETS[baseProviderId];
  const displayName = locale === 'zh' ? preset.nameZh : preset.name;
  const title = initialProvider
    ? t.settings?.customProviders?.modal?.titleEdit
    : t.settings?.customProviders?.modal?.titleAdd;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Name */}
          <Field
            label={t.settings?.customProviders?.modal?.fieldName ?? 'Name'}
            hint={t.settings?.customProviders?.modal?.fieldNameHint}
          >
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Company GPT-4"
            />
          </Field>

          {/* Protocol */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-2">
              {t.settings?.customProviders?.modal?.fieldProtocol ?? 'Protocol'}
            </label>
            <p className="text-2xs text-muted-foreground mb-2">
              {t.settings?.customProviders?.modal?.fieldProtocolHint}
            </p>
            <ProviderSelect
              value={baseProviderId}
              onChange={id => id !== 'skip' && setBaseProviderId(id as ProviderId)}
              compact
            />
          </div>

          {/* Base URL */}
          <Field
            label={t.settings?.customProviders?.modal?.fieldBaseUrl ?? 'Base URL'}
            hint={t.settings?.customProviders?.modal?.fieldBaseUrlHint}
          >
            <Input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </Field>

          {/* API Key */}
          <Field
            label={t.settings?.customProviders?.modal?.fieldApiKey ?? 'API Key'}
            hint={t.settings?.customProviders?.modal?.fieldApiKeyHint}
          >
            <PasswordInput
              value={apiKey}
              onChange={setApiKey}
              placeholder="sk-..."
            />
          </Field>

          {/* Model */}
          <Field
            label={t.settings?.customProviders?.modal?.fieldModel ?? 'Model'}
            hint={t.settings?.customProviders?.modal?.fieldModelHint}
          >
            <ModelInput
              value={model}
              onChange={setModel}
              placeholder="gpt-4-turbo"
              provider={baseProviderId}
              apiKey={apiKey}
              baseUrl={baseUrl}
              supportsListModels={PROVIDER_PRESETS[baseProviderId]?.supportsListModels ?? false}
              allowNoKey={!!PROVIDER_PRESETS[baseProviderId]?.apiKeyFallback}
            />
          </Field>

          {/* Error message */}
          {testError && testState !== 'ok' && (
            <div className="flex items-start gap-2 text-xs text-destructive/80 bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{testError}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-3 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-40"
          >
            {t.settings?.customProviders?.modal?.buttonCancel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={isSaving || testState === 'testing'}
            className={`flex-1 px-3 py-2 text-sm rounded inline-flex items-center justify-center gap-1 transition-all duration-200 ${
              testState === 'ok'
                ? 'bg-success/10 text-success border border-success/20'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 disabled:opacity-40'
            }`}
          >
            {testState === 'testing' ? <Loader2 size={12} className="animate-spin" />
              : null}
            {testState === 'testing'
              ? (t.settings?.customProviders?.modal?.validating ?? 'Testing...')
              : testState === 'ok'
                ? (t.settings?.customProviders?.modal?.success ?? 'Connected')
                : (t.settings?.customProviders?.modal?.buttonSave ?? 'Save & Test')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-3 py-2 text-sm rounded font-medium bg-[var(--amber)] text-[var(--amber-foreground)] hover:bg-[var(--amber)]/90 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-1"
          >
            {isSaving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
