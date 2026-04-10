# Spec: Discord 适配器

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/adapters/discord.ts`

## 依赖

- **discord.js** (v14+): Apache 2.0，25k+ stars，TypeScript-native
- 安装方式：`npm install discord.js`（列为 optionalDependencies）

## 接口实现

```typescript
import type { IMAdapter, IMMessage, IMSendResult, DiscordConfig } from '../types';

export class DiscordAdapter implements IMAdapter {
  readonly platform = 'discord' as const;

  private rest: InstanceType<typeof import('discord.js').REST> | null = null;
  private config: DiscordConfig;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  async send(message: IMMessage, signal?: AbortSignal): Promise<IMSendResult> { ... }
  async verify(): Promise<boolean> { ... }
  async dispose(): Promise<void> { ... }
}
```

## 设计决策：REST-only，不用 Gateway

MindOS 的 IM 集成是「Agent 主动发送消息」，不需要实时监听 Discord 事件。因此：
- **使用 REST API 直接发送**（不需要 WebSocket Gateway 连接）
- 使用 `discord.js` 的 `REST` 类而非完整 `Client`
- 大幅减少资源占用（无需维持 WebSocket 长连接）

## send() 实现逻辑

```
1. 懒初始化 REST 实例
   - const { REST, Routes } = await import('discord.js');
   - this.rest = new REST({ version: '10' }).setToken(this.config.bot_token);

2. 格式转换
   - format='text' → 直接发送 content 字段
   - format='markdown' → Discord 原生支持 Markdown，直接发送

3. 发送
   - rest.post(Routes.channelMessages(message.recipientId), {
       body: { content: text, message_reference: threadRef },
     });

4. 处理 thread_id
   - Discord 的 thread 就是 channel
   - 如果有 threadId → 发送到 threadId 对应的 channel

5. 处理 Embed（可选增强）
   - 长消息可以用 Embed 格式美化
   - 但 Phase 1 先用纯文本

6. 超时保护
   - discord.js REST 支持 signal 参数

7. 错误处理
   - DiscordAPIError → 提取 message + code
```

## 消息格式映射

### Text → Discord

Discord 直接发送 content 字段：

```json
{ "content": "Hello World" }
```

### Markdown → Discord

Discord 原生支持 Markdown（最友好的平台之一）：
- `**bold**` ✅
- `*italic*` ✅
- `` `code` `` ✅
- `> quote` ✅
- `# heading` ✅（大字标题）
- `[text](url)` ✅（但仅在 Embed 中可点击）
- `||spoiler||` ✅

**无需转换**，直接发送标准 Markdown。

### 消息截断

Discord 限制 2000 字符。超过时：

```typescript
function truncateForDiscord(text: string): string {
  if (text.length <= 2000) return text;
  return text.slice(0, 1960) + '\n\n... (message truncated)';
}
```

### 附件

```typescript
// discord.js REST 支持 FormData 附件
rest.post(Routes.channelMessages(channelId), {
  body: { content: caption },
  files: [{ name: 'file.png', data: buffer }],
});
```

## 平台特有常量

```typescript
const DISCORD_TEXT_LIMIT = 2000;
const DISCORD_EMBED_DESC_LIMIT = 4096;
const DISCORD_SEND_TIMEOUT_MS = 10_000;
const DISCORD_RETRY_COUNT = 3;
```

## verify() 实现逻辑

```
1. 懒初始化 REST
2. 调用 rest.get(Routes.user('@me'))
3. 成功 → return true（可以顺便缓存 bot 名称）
4. 失败 → return false
```

## 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| DiscordAPIError 50001 | 返回 `"Missing access to channel {channelId}"` |
| DiscordAPIError 50013 | 返回 `"Missing permissions to send messages"` |
| DiscordAPIError 10003 | 返回 `"Unknown channel: {channelId}"` |
| DiscordAPIError 40001 | 返回 `"Unauthorized: check bot_token"` |
| 429 Rate Limit | discord.js 内置自动重试，无需额外处理 |
| 网络错误 | 返回 `"Network error: {message}"` |
| AbortError | 返回 `"Send cancelled"` |

## 测试计划

| 测试用例 | 类型 | 说明 |
|---------|------|------|
| 发送纯文本成功 | 正常 | mock rest.post 返回成功 |
| 发送到 thread | 正常 | 验证 message_reference 设置正确 |
| channel 不存在 | 错误 | 验证错误信息人类可读 |
| 无发送权限 | 错误 | 验证 50013 错误提示 |
| token 无效 | 错误 | verify() 返回 false |
| 消息超过 2000 字符 | 边界 | 验证截断逻辑 |
| discord.js 未安装 | 边界 | 动态 import 失败返回清晰错误 |
