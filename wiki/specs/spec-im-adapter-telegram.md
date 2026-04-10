# Spec: Telegram 适配器

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/adapters/telegram.ts`

## 依赖

- **grammY** (`grammy` on npm): MIT 协议，TypeScript-native，API 9.6
- 安装方式：`npm install grammy`（列为 optionalDependencies）

## 接口实现

```typescript
import type { IMAdapter, IMMessage, IMSendResult, TelegramConfig } from '../types';

export class TelegramAdapter implements IMAdapter {
  readonly platform = 'telegram' as const;

  private bot: InstanceType<typeof import('grammy').Bot> | null = null;
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  async send(message: IMMessage, signal?: AbortSignal): Promise<IMSendResult> { ... }
  async verify(): Promise<boolean> { ... }
  async dispose(): Promise<void> { ... }
}
```

## send() 实现逻辑

```
1. 懒初始化 Bot 实例（首次 send 时创建）
   - const { Bot } = await import('grammy');
   - 注意：new Bot(token) 默认会在首次 API 调用时自动 getMe() 验证 token（增加一个 RTT）
   - 优化：传入 botInfo 参数跳过自动验证（从 verify() 缓存或手动构造）
   - this.bot = new Bot(this.config.bot_token, { botInfo: this.cachedBotInfo });
   - 如果没有 cachedBotInfo（首次使用），允许自动 getMe（只慢一次）

2. 格式转换
   - format='text' → sendMessage(chatId, text)
   - format='markdown' → sendMessage(chatId, text, { parse_mode: 'MarkdownV2' })
   - format='html' → sendMessage(chatId, text, { parse_mode: 'HTML' })

3. 处理 Markdown 转义
   - Telegram MarkdownV2 需要转义特殊字符：_ * [ ] ( ) ~ ` > # + - = | { } . !
   - 提供 escapeMarkdownV2(text) 工具函数

4. 处理 thread_id
   - 如果 message.threadId 存在 → 添加 message_thread_id 参数

5. 处理附件
   - image → bot.api.sendPhoto(chatId, url, { caption })
   - file → bot.api.sendDocument(chatId, url, { caption })
   - audio → bot.api.sendAudio(chatId, url, { caption })
   - video → bot.api.sendVideo(chatId, url, { caption })

6. 超时保护
   - 使用 AbortSignal，默认 10s 超时
   - grammY 支持 signal 参数

7. 错误处理
   - GrammyError → 提取 description 作为人类可读错误
   - HttpError → 网络错误，提示用户检查网络
   - 其他 → 通用错误消息
```

## verify() 实现逻辑

```
1. 懒初始化 Bot 实例
2. 调用 bot.api.getMe()
3. 成功 → return true
4. 失败 → return false
```

## dispose() 实现逻辑

```
1. 如果 bot 存在 → bot = null (grammY Bot 无需显式关闭，除非用了 polling)
2. 清理引用
```

## 消息格式转换

### Markdown → Telegram MarkdownV2

Telegram MarkdownV2 语法与标准 Markdown 有差异：

| 标准 Markdown | Telegram MarkdownV2 | 说明 |
|--------------|---------------------|------|
| `**bold**` | `*bold*` | 粗体 |
| `_italic_` | `_italic_` | 斜体（相同） |
| `` `code` `` | `` `code` `` | 行内代码（相同） |
| `[text](url)` | `[text](url)` | 链接（相同） |
| `# heading` | 不支持 | 需要降级为粗体 |

**转换策略**：在 `format.ts` 中提供 `markdownToTelegramV2(text)` 函数：
1. 转义 MarkdownV2 特殊字符
2. 将 `**bold**` 转换为 `*bold*`
3. 将 `# heading` 转换为 `*heading*`（降级为粗体）
4. 保留链接、代码块、斜体

**Markdown 容错**：MarkdownV2 转义规则极其严格，是 Telegram bot 开发中最常见的 bug 来源。策略：
- 如果 sendMessage(parse_mode: 'MarkdownV2') 返回 400 "can't parse entities"
- **自动 fallback**：以纯文本（无 parse_mode）重新发送一次
- 记录 warn 日志，提示 markdown 格式异常

### 消息截断

Telegram 文本消息限制 4096 字符。超过时：

```typescript
function truncateForTelegram(text: string): string {
  if (text.length <= 4096) return text;
  return text.slice(0, 4060) + '\n\n... (message truncated)';
}
```

## 平台特有常量

```typescript
const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_SEND_TIMEOUT_MS = 10_000;
const TELEGRAM_RETRY_COUNT = 3;
```

## 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| `GrammyError` (400 Bad Request) | 返回 `"Invalid request: {description}"` |
| `GrammyError` (403 Forbidden) | 返回 `"Bot blocked by user or removed from group"` |
| `GrammyError` (404 Not Found) | 返回 `"Chat not found: {chatId}"` |
| `GrammyError` (429 Too Many Requests) | 重试（指数退避），最终返回 `"Rate limited, retry after {seconds}s"` |
| `HttpError` | 返回 `"Network error: {message}"` |
| `AbortError` | 返回 `"Send cancelled"` |

## 测试计划

| 测试用例 | 类型 | 说明 |
|---------|------|------|
| 发送纯文本成功 | 正常 | mock bot.api.sendMessage 返回成功 |
| 发送 markdown 格式 | 正常 | 验证 parse_mode 设置正确 |
| 发送到不存在的 chat | 错误 | 验证错误信息人类可读 |
| bot_token 无效 | 错误 | verify() 返回 false |
| 消息超过 4096 字符 | 边界 | 验证截断逻辑 |
| 空消息 | 边界 | 验证拒绝发送 + 错误提示 |
| MarkdownV2 特殊字符转义 | 边界 | 验证 `.` `!` `(` 等被正确转义 |
| 429 重试逻辑 | 错误 | 验证指数退避 + 最终失败返回 |
| AbortSignal 取消 | 边界 | 验证 send 被中断时返回取消结果 |
| grammy 包未安装 | 边界 | 动态 import 失败返回清晰错误 |
