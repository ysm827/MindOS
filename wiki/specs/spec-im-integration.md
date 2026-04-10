# Spec: IM 平台集成系统框架

> Created: 2026-04-10 | Status: Draft

## 目标

为 MindOS Agent 增加跨平台 IM 消息推送能力，让 Agent 能够通过 Telegram、飞书、Discord、Slack、企业微信、钉钉等平台发送/接收消息，实现「知识库 Agent 触达用户」的最后一公里。

## 现状分析

### 当前能力

MindOS Agent 有 33 个工具，分为三类：
- **知识库工具** (25): 文件读写、搜索、MCP 桥接
- **A2A 工具** (6): 远程 Agent 发现与委派
- **ACP 工具** (2): Agent Client Protocol 调用

### 缺失能力

- **无任何 IM 平台集成**：Agent 无法主动向用户发送消息
- **无 Webhook 接收**：无法从 IM 平台接收用户消息
- **无消息路由**：无法在多个 IM 平台间统一消息分发

### OpenClaw 参考

OpenClaw 已验证「薄适配层 + 成熟 SDK」模式：
- Telegram: grammY | Discord: discord.js | Slack: @slack/bolt
- 飞书: @larksuite/openclaw-lark | WhatsApp: baileys
- 架构：Gateway + Channel Adapters，每个 adapter ~50-150 LOC

## 数据流 / 状态流

### 发送消息流（Agent → IM 平台）

```
用户在 MindOS Ask AI 中提问
    ↓
Agent 执行循环 (pi-agent-core)
    ↓
Agent 调用 send_im_message 工具
    ↓
IMToolExecutor (app/lib/im/executor.ts)
    ├─ 从 ~/.mindos/im.json 读取平台凭据
    ├─ 获取或创建对应平台的 Adapter 实例（懒加载，单例缓存）
    ├─ 格式转换：通用 IMMessage → 平台特定格式
    └─ 调用 Adapter.send()
         ↓
    平台 SDK (grammY / discord.js / @slack/bolt / ...)
         ↓
    目标 IM 平台 API
         ↓
    返回结果 → Agent 得到 send 结果
```

### 接收消息流（IM 平台 → MindOS）— Phase 2

```
用户在 IM 平台发消息 @bot
    ↓
平台推送事件到 MindOS
    ├─ Webhook: POST /api/im/webhook/:platform
    ├─ 或 WebSocket/Stream (飞书 WebSocket / 钉钉 Stream / Telegram polling)
    ↓
IMWebhookRouter (app/app/api/im/webhook/[platform]/route.ts)
    ├─ 签名验证（每个平台不同）
    ├─ 格式标准化：平台特定格式 → 通用 IncomingMessage
    └─ 分发到 Agent
         ↓
    POST /api/ask (复用现有 Agent 执行流)
         ↓
    Agent 响应 → 通过 send_im_message 回复到原平台
```

### 配置数据流

```
~/.mindos/
├── config.json      (现有：通用配置)
├── mcp.json         (现有：MCP servers)
└── im.json          (新增：IM 平台凭据)
     │
     ├─ providers.telegram.bot_token
     ├─ providers.feishu.app_id + app_secret
     ├─ providers.discord.bot_token
     ├─ providers.slack.bot_token + signing_secret
     ├─ providers.wecom.webhook_key  (或 corp_id + corp_secret)
     └─ providers.dingtalk.client_id + client_secret
```

## User Flow

```
用户目标：让 MindOS Agent 能向自己的 Telegram/飞书等 IM 平台发送消息

前置条件：用户已安装 MindOS，有一个可用的 IM bot（如 Telegram bot token）

Step 1: 用户编辑 ~/.mindos/im.json，添加平台凭据
  → 系统反馈：无（纯文件编辑）
  → 状态变化：im.json 文件创建/更新

Step 2: 用户在 MindOS Ask AI 中切换到 Agent 模式
  → 系统反馈：工具列表自动包含 send_im_message 和 list_im_channels
  → 状态变化：Agent system prompt 注入 IM 工具定义

Step 3: 用户向 Agent 发送指令："把这条笔记发到我的 Telegram 群"
  → 系统反馈：Agent 自动调用 list_im_channels 查询可用平台
  → 状态变化：Agent 获取已配置平台列表

Step 4: Agent 调用 send_im_message 发送消息
  → 系统反馈：Agent 在对话中显示工具调用过程和结果
  → 状态变化：Telegram API 被调用，消息送达目标 chat

Step 5: 用户在 Telegram 上收到消息
  → 系统反馈：Agent 告知用户 "消息已发送到 Telegram chat xxx"
  → 状态变化：Agent 记录操作日志

成功结果：用户在 Telegram 上看到来自 MindOS bot 的消息

异常分支：
- 异常 A：凭据无效 → Adapter 返回明确错误 → Agent 告知用户检查 im.json 中的 token
- 异常 B：bot 被目标用户拉黑 → API 返回 403 → Agent 提示 "bot was blocked by the user"
- 异常 C：平台 API 不可用 → 重试 3 次后失败 → Agent 提示 "Platform temporarily unavailable"
- 异常 D：用户未配置任何 IM → Agent 工具列表中无 IM 工具 → Agent 无法发送

边界场景：
- 消息超长（>4096 字符）→ 自动截断 + 添加 "(truncated)" 后缀
- im.json 格式损坏 → 静默降级为空配置，不影响其他功能
- SDK 包未安装 → 动态 import 失败时返回清晰错误提示
- 配置热更新 → 用户修改 im.json 后，下次 send 自动使用新凭据
```

## 方案对比

### 方案 A：MCP Server 模式（外部进程）

将 IM 集成作为独立的 MCP Server 运行，通过 `~/.mindos/mcp.json` 注册。

```
MindOS Agent
    ↓ call_mcp_tool("im-server", "send_message", {...})
MCP Bridge (mcporter.ts)
    ↓ JSON-RPC over stdio
IM MCP Server (独立 Node.js 进程)
    ↓
平台 SDK → IM 平台
```

- 用户体验质量：⭐⭐⭐ — 间接调用，多一层抽象
- 实现复杂度：高 — 需要独立进程管理、MCP 协议、IPC
- 可维护性：中 — 独立部署但增加运维复杂度
- 风险：MCP Server 启动/停止生命周期管理复杂

### 方案 B：内置 Agent Tool 模式（进程内）

将 IM 工具直接集成到 MindOS Agent 工具体系，与知识库工具同级。

```
MindOS Agent
    ↓ send_im_message({platform: "telegram", ...})
IMToolExecutor (进程内，同 tools.ts)
    ↓
平台 SDK → IM 平台
```

- 用户体验质量：⭐⭐⭐⭐⭐ — 直接调用，零额外延迟
- 实现复杂度：低 — 复用现有 AgentTool 模式
- 可维护性：高 — 和其他工具同一代码库，统一测试
- 风险：SDK 依赖增加 node_modules 大小（可通过 lazy import 缓解）

### 方案 C：混合模式（内置工具 + 可选 MCP）

Phase 1 用方案 B（内置工具），未来支持用户自行注册 IM MCP Server。

- 用户体验质量：⭐⭐⭐⭐⭐ — 默认最佳体验
- 实现复杂度：低（Phase 1），中（加 MCP 支持时）
- 可维护性：高
- 风险：低

### 选择：方案 B（内置 Agent Tool 模式）

**理由**：
1. **UX 最优**：Agent 直接调用，不需要额外配置 MCP Server
2. **复用最大**：完全复用 `tools.ts` 的 `safeExecute` + TypeBox schema + `logAgentOp` 模式
3. **OpenClaw 验证**：OpenClaw 也是进程内集成，而非独立 MCP Server
4. **SDK 懒加载**：只有配置了凭据的平台才加载对应 SDK，不影响未使用 IM 的用户

## 分阶段计划

| Phase | 范围 | 核心交付 |
|-------|------|---------|
| **Phase 1** | 系统框架 + Telegram | Adapter 接口、Executor、配置管理、Telegram 适配器 |
| **Phase 2** | 飞书 + Discord | 飞书/Discord 适配器、Webhook 接收路由 |
| **Phase 3** | Slack + 企业微信 + 钉钉 | 补齐中国平台 + 企业平台 |
| **Phase 4** | UI 管理界面 | Settings 中 IM 配置面板 |

**本 Spec 聚焦 Phase 1：系统框架 + Telegram**。

## 方案详情

### 文件结构

```
app/lib/im/
├── types.ts              # 核心类型定义（IMAdapter, IMMessage, etc.）
├── config.ts             # 配置读写（~/.mindos/im.json）
├── executor.ts           # 统一执行器（adapter 管理 + 分发）
├── tools.ts              # Agent 工具定义（send_im_message, list_im_channels）
├── format.ts             # 消息格式转换工具
└── adapters/
    ├── telegram.ts       # Telegram 适配器（grammY）
    ├── feishu.ts         # [Phase 2] 飞书适配器
    ├── discord.ts        # [Phase 2] Discord 适配器
    ├── slack.ts          # [Phase 3] Slack 适配器
    ├── wecom.ts          # [Phase 3] 企业微信适配器
    └── dingtalk.ts       # [Phase 3] 钉钉适配器
```

### 核心类型（详见 `spec-im-types.md`）

核心接口：`IMAdapter`、`IMMessage`、`IMSendResult`、`IMConfig`

### Agent 工具定义（详见 `spec-im-tools.md`）

两个工具：`send_im_message`、`list_im_channels`

### 配置管理（详见 `spec-im-config.md`）

`~/.mindos/im.json` 读写 + 凭据校验

### Telegram 适配器（详见 `spec-im-adapter-telegram.md`）

基于 grammY 的 Telegram 适配器

### 飞书适配器（详见 `spec-im-adapter-feishu.md`）

基于 @larksuiteoapi/node-sdk 的飞书适配器

### Discord 适配器（详见 `spec-im-adapter-discord.md`）

基于 discord.js 的 Discord 适配器

### Webhook 接收路由（详见 `spec-im-webhook.md`）

统一 Webhook 入口 + 平台路由

## 影响范围

### 变更文件列表

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/lib/im/types.ts` | 新增 | 核心类型定义 |
| `app/lib/im/config.ts` | 新增 | 配置读写 |
| `app/lib/im/executor.ts` | 新增 | 统一执行器 |
| `app/lib/im/tools.ts` | 新增 | Agent 工具定义 |
| `app/lib/im/format.ts` | 新增 | 格式转换 |
| `app/lib/im/adapters/telegram.ts` | 新增 | Telegram 适配器 |
| `app/lib/agent/tools.ts` | 修改 | 引入 IM 工具到工具列表 |
| `app/app/api/ask/route.ts` | 修改 | 工具组装加入 IM 工具 |
| `package.json` | 修改 | 添加 `grammy` 依赖 |

### 不受影响的模块

- **知识库工具**：IM 工具与知识库工具并列，互不影响
- **A2A/ACP**：独立的 Agent 协作体系，不涉及 IM
- **前端 UI**：Phase 1 不涉及 UI 变更
- **MCP Server**：MindOS 对外暴露的 MCP 不变

### 破坏性变更

无。IM 工具为纯新增，不修改任何现有工具的行为。未配置 IM 凭据时，IM 工具不会出现在工具列表中（条件加载）。

## 边界 case 与风险

### 边界 case

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | 用户未配置任何 IM 凭据 | IM 工具不注册到 Agent，Agent 不知道 IM 能力存在 |
| 2 | 凭据配置了但无效（token 过期/错误） | Adapter.send() 返回明确错误消息，Agent 可告知用户 |
| 3 | 平台 API 临时不可用（429/5xx） | 指数退避重试 3 次（用 p-retry），最终失败返回错误 |
| 4 | 消息内容超过平台字符限制 | format.ts 按平台限制自动截断 + 添加 "(truncated)" 后缀 |
| 5 | 同时配置多个平台，Agent 不知道发到哪里 | send_im_message 的 platform 参数为必填；list_im_channels 让 Agent 先查询可用平台 |
| 6 | im.json 文件被手动改坏（非法 JSON） | config.ts 解析失败时 console.warn + 返回空配置，不影响其他功能 |
| 7 | SDK 包未安装（用户通过源码构建跳过了可选依赖） | 动态 import 失败时返回清晰错误：`"grammy package not installed"` |
| 8 | 消息包含 Markdown 但目标平台不支持 | format.ts 提供 markdown → plaintext 降级转换 |

### 已知风险

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| SDK 依赖增加包大小 | 中 | lazy import（只在首次 send 时加载），列为 optionalDependencies |
| 平台 API 变更导致适配器失效 | 中 | 版本锁定 SDK，集成测试自动检测 |
| 凭据泄露（im.json 明文存储） | **高** | im.json 权限 0o600（非 Windows）；logAgentOp 中 token 完全不记录；recipientId 做部分掩码；错误消息中不返回 token 任何部分；Phase 4 UI 用 secret input |
| 消息发送阻塞 Agent 执行 | 中 | send 操作有 10s 超时；使用 AbortSignal 支持取消 |
| Prompt injection 导致向非预期目标发消息 | 中 | recipientId 格式校验（per-platform regex）；Agent 只能发到已配置平台 |
| Telegram MarkdownV2 转义失败 | 低 | 自动 fallback 为纯文本重发 |

## 验收标准

### Phase 1 验收

- [ ] `app/lib/im/types.ts` 定义了 `IMAdapter`、`IMMessage`、`IMSendResult`、`IMConfig` 等核心接口
- [ ] `app/lib/im/config.ts` 能正确读写 `~/.mindos/im.json`，处理文件不存在、格式错误等异常
- [ ] `app/lib/im/executor.ts` 实现 Adapter 懒加载 + 单例缓存 + 平台分发
- [ ] `app/lib/im/tools.ts` 定义了 `send_im_message` 和 `list_im_channels` 两个 Agent 工具
- [ ] `app/lib/im/adapters/telegram.ts` 基于 grammY 实现 IMAdapter 接口
- [ ] 未配置 IM 凭据时，IM 工具不出现在 Agent 工具列表中
- [ ] 配置 Telegram token 后，Agent 能成功发送文本消息到指定 chat
- [ ] 平台 API 返回错误时，Agent 收到人类可读的错误信息
- [ ] 消息超长自动截断，不会导致 API 调用失败
- [ ] 所有 IM 模块有对应的单元测试，覆盖正常/边界/错误三类场景
- [ ] `npm run build` 无新增 TypeScript 错误
- [ ] 未安装 grammY 时，其他功能不受影响（graceful degradation）

### 子文档索引

| 文档 | 内容 |
|------|------|
| [spec-im-types.md](./spec-im-types.md) | 核心类型定义 |
| [spec-im-tools.md](./spec-im-tools.md) | Agent 工具定义 |
| [spec-im-config.md](./spec-im-config.md) | 配置管理 |
| [spec-im-adapter-telegram.md](./spec-im-adapter-telegram.md) | Telegram 适配器 |
| [spec-im-adapter-feishu.md](./spec-im-adapter-feishu.md) | 飞书适配器 |
| [spec-im-adapter-discord.md](./spec-im-adapter-discord.md) | Discord 适配器 |
| [spec-im-webhook.md](./spec-im-webhook.md) | Webhook 接收路由 |
