# Spec: Webhook 接收路由

> Parent: [spec-im-integration.md](./spec-im-integration.md)
> Phase: Phase 2（Phase 1 先聚焦 Agent 主动发送）

## 文件位置

```
app/app/api/im/webhook/[platform]/route.ts   # Next.js 动态路由
app/lib/im/webhook-router.ts                  # 路由 + 签名验证逻辑
```

## 概述

Phase 2 实现：各 IM 平台通过 Webhook 向 MindOS 推送用户消息，MindOS 接收后转发给 Agent 处理并回复。

## 路由设计

统一入口：`POST /api/im/webhook/:platform`

```
POST /api/im/webhook/telegram   → Telegram webhook
POST /api/im/webhook/feishu     → 飞书事件订阅
POST /api/im/webhook/discord    → Discord Interactions (非 Gateway)
POST /api/im/webhook/slack      → Slack Events API
POST /api/im/webhook/wecom      → 企业微信回调
POST /api/im/webhook/dingtalk   → 钉钉 Stream callback
```

## 签名验证

每个平台有不同的签名验证机制，必须在处理消息前验证：

| 平台 | 验证方式 | 验证函数 |
|------|---------|---------|
| Telegram | 可选：`X-Telegram-Bot-Api-Secret-Token` header 比对 | compareSecretToken() |
| 飞书 | Encrypt Key + challenge-response | verifyFeishuSignature() |
| Discord | Ed25519 签名验证 (`X-Signature-Ed25519` + `X-Signature-Timestamp`) | verifyDiscordSignature() |
| Slack | HMAC-SHA256 (`X-Slack-Signature` + `X-Slack-Request-Timestamp`) | verifySlackSignature() |
| 企业微信 | SHA1 签名 + AES-256-CBC 解密 | verifyWeComSignature() |
| 钉钉 | HMAC-SHA256 签名 | verifyDingTalkSignature() |

## 消息标准化

各平台推送的消息格式不同，统一转换为 `IncomingMessage`：

```typescript
export interface IncomingMessage {
  /** 来源平台 */
  platform: IMPlatform;
  /** 发送者 ID */
  senderId: string;
  /** 发送者名称（可选） */
  senderName?: string;
  /** 聊天/群组 ID */
  chatId: string;
  /** 消息文本 */
  text: string;
  /** 消息 ID（用于回复线程） */
  messageId: string;
  /** 线程 ID（如果在线程中） */
  threadId?: string;
  /** 原始事件（平台特定，用于调试） */
  rawEvent: unknown;
}
```

## Agent 处理流

```
Webhook 收到消息
    ↓
签名验证 → 失败返回 401
    ↓
消息标准化 → IncomingMessage
    ↓
创建 Agent session（或复用已有 session）
    ↓
POST /api/ask (内部调用)
    ├─ 消息作为 user message
    ├─ Agent 处理（可能调用知识库工具）
    └─ Agent 回复
         ↓
    通过 send_im_message 发回原平台原 chat
    ↓
Webhook 返回 200 OK（在 5s 内）
```

## 超时处理

所有平台都要求 Webhook 在 **1-5 秒内** 返回 200，但 Agent 处理可能需要更长时间。解决方案：

```
1. Webhook 立即返回 200（确认收到）
2. 异步启动 Agent 处理
3. Agent 处理完成后通过 send_im_message 回复
```

## Session 管理

- 每个 (platform, chatId) 组合对应一个 Agent session
- DM 消息：复用同一个 session（保持上下文）
- 群组消息：每个群一个独立 session
- Session 超时：30 分钟无活动自动清理

## 本阶段不实现

Phase 2 Webhook 功能不在 Phase 1 范围内。Phase 1 只实现 Agent 主动发送（send_im_message 工具）。此文档作为 Phase 2 的预研设计。
