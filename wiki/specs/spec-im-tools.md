# Spec: IM Agent 工具定义

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/tools.ts`

## 工具列表

### 1. send_im_message

**用途**：Agent 向 IM 平台发送消息。

```typescript
// TypeBox Schema
const SendIMMessageParams = Type.Object({
  platform: Type.Union([
    Type.Literal('telegram'),
    Type.Literal('discord'),
    Type.Literal('feishu'),
    Type.Literal('slack'),
    Type.Literal('wecom'),
    Type.Literal('dingtalk'),
  ], { description: 'Target IM platform' }),
  recipient_id: Type.String({
    description: 'Chat/Channel/Group ID on the platform. Use list_im_channels to find available IDs.',
  }),
  message: Type.String({
    description: 'Message content. Supports markdown if the platform allows it.',
  }),
  format: Type.Optional(Type.Union([
    Type.Literal('text'),
    Type.Literal('markdown'),
  ], { description: 'Message format. Default: text. Use markdown for rich formatting.' })),
  thread_id: Type.Optional(Type.String({
    description: 'Thread/Topic ID for threaded replies (platform-dependent).',
  })),
});
```

**执行逻辑**：

```
1. 验证 platform 对应的凭据是否已配置 → 未配置返回错误提示
2. 获取 Adapter 实例（懒加载）
3. 构造 IMMessage
4. 如果 message 超过平台字符限制 → 自动截断
5. 如果 format=markdown 但平台不支持 → 降级为 text
6. 调用 Adapter.send()，传入 AbortSignal
7. 返回结果给 Agent（成功/失败 + 消息 ID）
```

**Agent 看到的结果示例**：

成功：
```
Message sent to telegram chat 123456789.
Message ID: 42
Timestamp: 2026-04-10T12:00:00Z
```

失败：
```
Failed to send message to telegram: Forbidden: bot was blocked by the user
```

### 2. list_im_channels

**用途**：Agent 查询当前配置了哪些 IM 平台，以及 platform 对应的能力。

```typescript
const ListIMChannelsParams = Type.Object({});
```

**执行逻辑**：

```
1. 读取 im.json 配置
2. 列出已配置凭据的平台
3. 对每个平台显示：名称、是否验证通过、支持的消息格式
```

**Agent 看到的结果示例**：

```
Configured IM platforms:

- telegram: ✓ connected (supports text, markdown, html, threads, attachments)
  Bot: @mindos_bot

- feishu: ✓ connected (supports text, markdown, threads, attachments)
  App: MindOS Assistant

No other platforms configured. Users can add platforms in ~/.mindos/im.json.
```

或无配置时：
```
No IM platforms configured.
Users can configure IM platforms by editing ~/.mindos/im.json.

Supported platforms: telegram, feishu, discord, slack, wecom, dingtalk
```

## 工具注册

### 条件加载逻辑

IM 工具 **仅在有任何平台配置时** 才注册到 Agent：

```typescript
// 在 tools.ts 的 getRequestScopedTools() 中
import { getIMTools } from '@/lib/im/tools';
import { hasAnyIMConfig } from '@/lib/im/config';

export function getRequestScopedTools(): AgentTool[] {
  const tools = [...knowledgeBaseTools];

  // IM 工具：仅在配置了至少一个平台时加载
  if (hasAnyIMConfig()) {
    tools.push(...getIMTools());
  }

  return tools;
}
```

**理由**：
- 未使用 IM 的用户不会在 Agent system prompt 中看到 IM 工具（节省 token）
- 避免 Agent 尝试调用未配置的 IM 工具后返回错误（影响体验）
- 与 MCP 工具的条件加载模式一致

### Chat 模式 vs Agent 模式

| 模式 | IM 工具 |
|------|---------|
| Chat 模式 | 不包含（Chat 模式只有只读工具） |
| Agent 模式 | 包含 send_im_message + list_im_channels |

## 安全考虑

1. **send_im_message 是写操作**：通过 `toPiCustomToolDefinitions` 的写保护机制记录操作日志
2. **不暴露 token**：list_im_channels 只显示平台名和 bot 名称，不返回 token/secret
3. **AbortSignal**：所有 send 操作支持取消，防止 Agent abort 后仍在发送
