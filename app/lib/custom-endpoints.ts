import { type ProviderId, isProviderId, PROVIDER_PRESETS } from './agent/providers';

/**
 * A user-defined provider configuration.
 * Allows multiple instances of the same provider type with different
 * API keys, base URLs, and custom display names.
 */
export interface CustomProvider {
  id: string;              // "cp_" + 8 random alphanumeric chars
  name: string;            // User-visible display name
  baseProviderId: ProviderId;  // Protocol to use (openai, anthropic, etc.)
  apiKey: string;
  model: string;
  baseUrl: string;         // Required for custom providers
}

const CP_PREFIX = 'cp_';

/** Generate a unique custom provider ID */
export function generateCustomProviderId(): string {
  return CP_PREFIX + Math.random().toString(36).slice(2, 10);
}

/** Check if an ID refers to a custom provider (vs built-in) */
export function isCustomProviderId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(CP_PREFIX);
}

/** Validate that an unknown value is a valid CustomProvider */
export function isValidCustomProvider(e: unknown): e is CustomProvider {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.id === 'string' && obj.id.startsWith(CP_PREFIX) &&
    typeof obj.name === 'string' && obj.name.trim().length > 0 &&
    typeof obj.baseProviderId === 'string' && isProviderId(obj.baseProviderId) &&
    typeof obj.apiKey === 'string' &&
    typeof obj.model === 'string' &&
    typeof obj.baseUrl === 'string'
  );
}

/** Parse an array of custom providers from unknown config data, filtering invalid entries */
export function parseCustomProviders(raw: unknown): CustomProvider[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidCustomProvider);
}

/** Find a custom provider by ID from a list */
export function findCustomProvider(providers: CustomProvider[], id: string): CustomProvider | undefined {
  return providers.find(p => p.id === id);
}

/** Mask API key for display (same pattern as built-in providers) */
