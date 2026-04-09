# Spec: IM 核心类型定义

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/types.ts`

## 类型定义

### 平台枚举

```typescript
export type IMPlatform =
  | 'telegram'
  | 'discord'
  | 'feishu'
  | 'slack'
  | 'wecom'
  | 'dingtalk';
```

### 消息格式

```typescript
export type IMMessageFormat = 'text' | 'markdown' | 'html';

export interface IMAttachment {
  type: 'image' | 'file' | 'audio' | 'video';
  /** URL or local file path */
  url: string;
  /** Optional filename for display */
  filename?: string;
  /** MIME type if known */
  mimeType?: string;
}

export interface IMMessage {
  /** Target platform */
  platform: IMPlatform;
  /** Chat/Channel/Group ID on the platform */
  recipientId: string;
  /** Message text content */
  text: string;
  /** Text format (default: 'text') */
  format?: IMMessageFormat;
  /** Optional thread/topic ID for threaded replies */
  threadId?: string;
  /** Optional attachments */
  attachments?: IMAttachment[];
}
```

### 发送结果

```typescript
export interface IMSendResult {
  /** Whether the message was sent successfully */
  ok: boolean;
  /** Platform-specific message ID (for future reference/threading) */
  messageId?: string;
  /** Error message if ok is false */
  error?: string;
  /** Timestamp of send (ISO 8601) */
  timestamp: string;
}
```

### Adapter 接口

```typescript
export interface IMAdapter {
  /** Platform identifier */
  readonly platform: IMPlatform;

  /**
   * Send a message to the platform.
   * Must handle format conversion internally.
   * Must respect AbortSignal for cancellation.
   */
  send(message: IMMessage, signal?: AbortSignal): Promise<IMSendResult>;

  /**
   * Verify that the adapter's credentials are valid.
   * Returns true if credentials work, false otherwise.
   */
  verify(): Promise<boolean>;

  /**
   * Clean up resources (close connections, etc.)
   */
  dispose(): Promise<void>;
}
```

### 配置类型

```typescript
export interface TelegramConfig {
  bot_token: string;
}

export interface FeishuConfig {
  app_id: string;
  app_secret: string;
}

export interface DiscordConfig {
  bot_token: string;
}

export interface SlackConfig {
  bot_token: string;
  signing_secret?: string;
}

export interface WeComConfig {
  /** Simple webhook mode */
  webhook_key?: string;
  /** Full app mode */
  corp_id?: string;
  corp_secret?: string;
}

export interface DingTalkConfig {
  client_id: string;
  client_secret: string;
  /** Webhook mode (simpler) */
  webhook_url?: string;
  webhook_secret?: string;
}

export type PlatformConfig =
  | TelegramConfig
  | FeishuConfig
  | DiscordConfig
  | SlackConfig
  | WeComConfig
  | DingTalkConfig;

export interface IMConfig {
  providers: Partial<{
    telegram: TelegramConfig;
    feishu: FeishuConfig;
    discord: DiscordConfig;
    slack: SlackConfig;
    wecom: WeComConfig;
    dingtalk: DingTalkConfig;
  }>;
}
```

### 平台特性常量

```typescript
export const PLATFORM_LIMITS: Record<IMPlatform, {
  maxTextLength: number;
  supportsMarkdown: boolean;
  supportsHtml: boolean;
  supportsThreads: boolean;
  supportsAttachments: boolean;
}> = {
  telegram:  { maxTextLength: 4096,  supportsMarkdown: true,  supportsHtml: true,  supportsThreads: true,  supportsAttachments: true },
  discord:   { maxTextLength: 2000,  supportsMarkdown: true,  supportsHtml: false, supportsThreads: true,  supportsAttachments: true },
  feishu:    { maxTextLength: 30000, supportsMarkdown: true,  supportsHtml: false, supportsThreads: true,  supportsAttachments: true },
  slack:     { maxTextLength: 4000,  supportsMarkdown: true,  supportsHtml: false, supportsThreads: true,  supportsAttachments: true },
  wecom:     { maxTextLength: 2048,  supportsMarkdown: true,  supportsHtml: false, supportsThreads: false, supportsAttachments: true },
  dingtalk:  { maxTextLength: 20000, supportsMarkdown: true,  supportsHtml: false, supportsThreads: false, supportsAttachments: true },
};
```

## 设计决策

1. **IMMessage 是平台无关的**：所有平台特定格式转换在 Adapter 内部完成
2. **IMAdapter 接口最小化**：只有 `send`、`verify`、`dispose` 三个方法，降低新平台接入成本
3. **配置类型按平台分开**：每个平台的凭据字段不同，用 discriminated union 保证类型安全
4. **PLATFORM_LIMITS 作为常量**：用于 format.ts 的自动截断和格式降级
