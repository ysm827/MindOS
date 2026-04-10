/**
 * Embedding API provider — calls OpenAI-compatible /v1/embeddings endpoint.
 *
 * Supports: OpenAI, DeepSeek, Ollama, any OpenAI-compatible embedding API.
 * Config is stored in ~/.mindos/config.json under the `embedding` key.
 */

import { readSettings } from '@/lib/settings';

export interface EmbeddingConfig {
  enabled: boolean;
  baseUrl: string;   // e.g. "https://api.openai.com/v1"
  apiKey: string;
  model: string;     // e.g. "text-embedding-3-small"
}

/** Read embedding config from settings. Returns null if not configured or disabled. */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const s = readSettings();
    const e = s.embedding;
    if (!e || !e.enabled) return null;
    if (!e.baseUrl || !e.model) return null;
    // apiKey can be empty for local providers like Ollama
    return {
      enabled: true,
      baseUrl: e.baseUrl.replace(/\/+$/, ''), // strip trailing slash
      apiKey: e.apiKey || '',
      model: e.model,
    };
  } catch {
    return null;
  }
}

/** Maximum texts per batch (OpenAI limit is 2048, we use a conservative default). */
const BATCH_SIZE = 100;

/** Request timeout in ms. */
const TIMEOUT_MS = 30_000;

/** Max retries on transient errors (429, 5xx). */
const MAX_RETRIES = 2;

/**
 * Get embeddings for an array of texts.
 * Returns Float32Array[] with one vector per input text.
 * Returns empty array on failure (graceful fallback — never throws).
 */
export async function getEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const config = getEmbeddingConfig();
  if (!config || texts.length === 0) return [];

  try {
    const results: Float32Array[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await callEmbeddingApi(config, batch);
      if (batchResults.length === 0) return []; // Abort on any batch failure
      results.push(...batchResults);
    }

    return results;
  } catch (err) {
    console.error('[embedding] Failed to get embeddings:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Get embedding for a single text. Convenience wrapper.
 * Returns null on failure.
 */
export async function getEmbedding(text: string): Promise<Float32Array | null> {
  const results = await getEmbeddings([text]);
  return results.length > 0 ? results[0] : null;
}

/** Call the OpenAI-compatible /v1/embeddings endpoint with retry logic. */
async function callEmbeddingApi(
  config: EmbeddingConfig,
  texts: string[],
): Promise<Float32Array[]> {
  const url = `${config.baseUrl}/embeddings`;
  const body = JSON.stringify({
    model: config.model,
    input: texts,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const status = res.status;
        // Retry on rate limit or server errors
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(res.headers.get('retry-after') || '1', 10);
          await sleep(Math.min(retryAfter * 1000, 5000));
          continue;
        }
        const errText = await res.text().catch(() => '');
        console.error(`[embedding] API error ${status}: ${errText.slice(0, 200)}`);
        return [];
      }

      const json = await res.json() as EmbeddingResponse;
      if (!json.data || !Array.isArray(json.data)) {
        console.error('[embedding] Unexpected response shape');
        return [];
      }

      // Sort by index (API may return out of order)
      json.data.sort((a, b) => a.index - b.index);

      return json.data.map(d => new Float32Array(d.embedding));
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1)); // Exponential-ish backoff
        continue;
      }
      console.error('[embedding] Request failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  return [];
}

/** OpenAI /v1/embeddings response shape. */
interface EmbeddingResponse {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
