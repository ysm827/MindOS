# Spec: IM 统一执行器

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/executor.ts`

## 职责

1. **Adapter 生命周期管理**：懒加载、单例缓存、销毁
2. **请求分发**：根据 platform 参数路由到对应 Adapter
3. **通用容错**：重试、超时、格式降级
4. **日志**：记录每次 send 操作（成功/失败）

## API 设计

```typescript
import type { IMMessage, IMSendResult, IMPlatform } from './types';

/** 发送消息到指定 IM 平台 */
export async function sendIMMessage(
  message: IMMessage,
  signal?: AbortSignal,
): Promise<IMSendResult>;

/** 获取所有已配置且可用的平台列表 */
export async function listConfiguredPlatforms(): Promise<Array<{
  platform: IMPlatform;
  connected: boolean;
  botName?: string;
}>>;

/** 清理所有 Adapter 实例（用于测试或热重载） */
export async function disposeAllAdapters(): Promise<void>;
```

## 内部架构

```typescript
// Adapter 单例缓存 + 配置版本追踪
const adapterCache = new Map<IMPlatform, IMAdapter>();
let configMtime = 0; // 上次读取 im.json 的 mtime

// Adapter 工厂（懒加载 + 动态 import + 配置热更新）
async function getAdapter(platform: IMPlatform): Promise<IMAdapter> {
  // 0. 检查配置是否已变更（热更新支持）
  const currentMtime = getIMConfigMtime(); // fs.statSync(...).mtimeMs
  if (currentMtime > configMtime) {
    // 配置文件被修改：标记所有旧 Adapter 为 stale，但不立即 dispose
    // （正在发送的消息可能还在使用旧 Adapter）
    const staleAdapters = [...adapterCache.values()];
    adapterCache.clear();
    configMtime = currentMtime;
    // 异步 dispose 旧 Adapter（不阻塞当前请求）
    Promise.allSettled(staleAdapters.map(a => a.dispose())).catch(() => {});
  }

  // 1. 检查缓存
  if (adapterCache.has(platform)) return adapterCache.get(platform)!;

  // 2. 读取配置
  const config = getPlatformConfig(platform);
  if (!config) throw new Error(`Platform "${platform}" not configured in ~/.mindos/im.json`);

  // 3. 动态创建 Adapter
  let adapter: IMAdapter;
  switch (platform) {
    case 'telegram': {
      const { TelegramAdapter } = await import('./adapters/telegram');
      adapter = new TelegramAdapter(config);
      break;
    }
    case 'feishu': {
      const { FeishuAdapter } = await import('./adapters/feishu');
      adapter = new FeishuAdapter(config);
      break;
    }
    case 'discord': {
      const { DiscordAdapter } = await import('./adapters/discord');
      adapter = new DiscordAdapter(config);
      break;
    }
    // ... 其他平台同理
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  // 4. 缓存
  adapterCache.set(platform, adapter);
  return adapter;
}
```

## sendIMMessage 实现

```
1. 参数校验
   - message.text 不能为空
   - message.recipientId 不能为空
   - message.platform 必须是已知平台
   - **recipientId 格式校验**（防 prompt injection）：
     - telegram: 匹配 /^-?\d+$/ （数字或负数开头的数字）
     - discord: 匹配 /^\d{17,20}$/ （Snowflake ID）
     - feishu: 匹配 /^(oc_|ou_|on_)/ 或 email 格式
     - slack: 匹配 /^[A-Z0-9]+$/ （Slack channel/user ID）
     - wecom/dingtalk: 非空字符串即可
   - 校验失败 → 返回 "Invalid recipient_id format for {platform}"

2. 获取 Adapter
   - getAdapter(message.platform)
   - 如果 SDK 未安装（动态 import 失败）→ 返回清晰错误

3. 消息预处理（format.ts）
   - 截断超长消息（按平台限制）
   - 格式降级（markdown → text，如果平台不支持）

4. 发送（带重试）
   - 使用 p-retry（3 次，指数退避）
   - 首次失败等 1s，第二次 2s，第三次 4s
   - 仅对网络错误和 429 重试，不对 400/403/404 重试

5. 结果
   - 成功 → { ok: true, messageId, timestamp }
   - 失败 → { ok: false, error: "人类可读错误", timestamp }

6. 日志
   - logAgentOp({ tool: 'send_im_message', params: { platform, recipientId: maskId(recipientId) }, result, message })
   - **不记录 message.text 的完整内容**（可能含敏感信息），只记录长度
   - **recipientId 做部分掩码**：只显示前3+后3字符，中间用 `***` 替代
   - **绝不记录 token/secret 的任何部分**
```

## 超时控制

```typescript
const DEFAULT_SEND_TIMEOUT_MS = 10_000;

async function sendWithTimeout(
  adapter: IMAdapter,
  message: IMMessage,
  signal?: AbortSignal,
): Promise<IMSendResult> {
  const controller = new AbortController();

  // 合并外部 signal 和超时 signal
  const timeout = setTimeout(() => controller.abort(), DEFAULT_SEND_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    return await adapter.send(message, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
```

## 重试策略

复用 MindOS 已有的 retry 工具（`app/lib/agent/retry.ts` + `app/lib/agent/reconnect.ts`），不引入额外的 `p-retry` 依赖。

```typescript
import { retryDelay, sleep } from '@/lib/agent/reconnect';

const MAX_RETRIES = 3;

async function sendWithRetry(
  adapter: IMAdapter,
  message: IMMessage,
  signal?: AbortSignal,
): Promise<IMSendResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendWithTimeout(adapter, message, signal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 不对客户端错误重试
      if (lastError.name === 'AbortError') throw lastError;
      if (!isRetryableIMError(lastError)) throw lastError;

      // 最后一次也失败了，不再等待
      if (attempt === MAX_RETRIES) break;

      // 指数退避：1s, 2s, 4s（复用 retryDelay）
      const delay = retryDelay(attempt);
      await sleep(delay, signal);
    }
  }

  // 全部重试耗尽
  return {
    ok: false,
    error: `Failed after ${MAX_RETRIES} retries: ${lastError?.message ?? 'unknown error'}`,
    timestamp: new Date().toISOString(),
  };
}

/** 判断 IM 发送错误是否可重试 */
function isRetryableIMError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  // 429 / 5xx / 网络瞬态错误可重试
  if (msg.includes('429') || msg.includes('rate limit')) return true;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound')) return true;
  return false; // 400/401/403/404 等不重试
}
```

## format.ts 消息预处理

```typescript
import { PLATFORM_LIMITS, type IMMessage } from './types';

/** 截断消息到平台限制 */
export function truncateMessage(message: IMMessage): IMMessage {
  const limit = PLATFORM_LIMITS[message.platform].maxTextLength;
  if (message.text.length <= limit) return message;
  const suffix = '\n\n... (message truncated)';
  return {
    ...message,
    text: message.text.slice(0, limit - suffix.length) + suffix,
  };
}

/** 格式降级：markdown → text */
export function downgradeFormat(message: IMMessage): IMMessage {
  const limits = PLATFORM_LIMITS[message.platform];
  if (message.format === 'markdown' && !limits.supportsMarkdown) {
    return { ...message, format: 'text', text: stripMarkdown(message.text) };
  }
  if (message.format === 'html' && !limits.supportsHtml) {
    return { ...message, format: 'text', text: stripHtml(message.text) };
  }
  return message;
}

/** 去除 Markdown 标记，保留纯文本 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')       // **bold** → bold
    .replace(/\*(.*?)\*/g, '$1')           // *italic* → italic
    .replace(/`(.*?)`/g, '$1')             // `code` → code
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')    // [text](url) → text
    .replace(/^#{1,6}\s+/gm, '')           // # heading → heading
    .replace(/^>\s+/gm, '')               // > quote → quote
    .replace(/^[-*+]\s+/gm, '• ');         // - item → • item
}

/** 去除 HTML 标签 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}
```

## 测试计划

| 测试用例 | 类型 | 说明 |
|---------|------|------|
| sendIMMessage 成功路由到 Telegram | 正常 | mock TelegramAdapter |
| sendIMMessage 成功路由到 Feishu | 正常 | mock FeishuAdapter |
| 未配置的平台返回错误 | 错误 | 验证错误信息提及配置方法 |
| 空消息文本被拒绝 | 边界 | 验证参数校验 |
| 超长消息被截断 | 边界 | 验证截断后 ≤ 平台限制 |
| markdown 降级为 text | 边界 | wecom 不支持 markdown → 自动降级 |
| 网络错误触发重试 | 错误 | 验证重试 3 次后返回最终错误 |
| 400 错误不重试 | 错误 | 验证 shouldRetry 返回 false |
| AbortSignal 取消 | 边界 | 验证操作被中断 |
| Adapter 单例缓存 | 正常 | 两次 send 同一平台只创建一个 Adapter |
| disposeAllAdapters 清理 | 正常 | 验证缓存被清空 |
| listConfiguredPlatforms | 正常 | 验证返回已配置平台列表 |
| stripMarkdown 各格式 | 边界 | bold, italic, code, link, heading, list |
