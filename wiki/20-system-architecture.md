<!-- Last verified: 2026-04-10 | Current stage: v0.6 | Architecture reviews: wiki/reviews/architecture-review-2026-04-10*.md -->

# MindOS 系统架构 (System Architecture)

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户 & 外部 Agent                         │
└──────────┬──────────────────────┬───────────────────────────────┘
           │ Browser (GUI)         │ MCP Protocol (stdio/HTTP)
           ▼                       ▼
┌─────────────────────┐  ┌────────────────────────┐
│   app/ (Next.js 16) │  │  mcp/ (MCP Server)     │
│   ─────────────────  │  │  ────────────────────  │
│   • 前端 UI 组件     │  │  • MCP ↔ App API       │
│   • API Routes       │  │  • stdio + HTTP 传输   │
│   • 内置 Agent       │  │  • Bearer Token 认证   │
│   • 插件渲染器       │  │  • 安全沙箱 & 写保护   │
└──────────┬──────────┘  └──────────┬─────────────┘
           │                        │
           ▼                        ▼
┌──────────────────────────────────────────────────┐
│              my-mind/ (本地纯文本知识库)             │
│  Markdown + CSV + JSON | Git 版本控制              │
└──────────────────────────────────────────────────┘
```

## 目录结构

```
mindos/
├── app/                        # Next.js 16 前端
│   ├── app/                    # App Router 页面 + API Routes
│   ├── components/             # UI 组件 (189 个)
│   │   ├── agents/             # Agent 管理面板 (15 个)
│   │   │   ├── AgentDetailContent.tsx    # 详情页编排（741 行，从 1,188 行拆分）
│   │   │   ├── AgentDetailHeader.tsx     # Agent 基本信息展示
│   │   │   ├── AgentDetailSkills.tsx     # Skill 管理部分
│   │   │   ├── AgentDetailMcp.tsx        # MCP 配置部分
│   │   │   ├── AgentDetailSpace.tsx      # 知识空间配置
│   │   │   ├── AgentDetailConfig.tsx     # 应用设置部分
│   │   │   ├── AgentDetailSkillEditor.tsx # Skill 编辑器
│   │   │   ├── AgentsSkillsSection.tsx   # Skills 工作台（655 行）
│   │   │   ├── AgentsSkillsByAgent.tsx   # ByAgent 视图 + AgentCard
│   │   │   ├── AgentsPanelA2aTab.tsx     # A2A 面板（297 行）
│   │   │   └── AcpRegistrySection.tsx    # ACP 注册表 + AgentCard
│   │   ├── ask/                # AI 对话
│   │   ├── file-tree/          # 文件树子组件
│   │   │   └── FileTreeContextMenus.tsx  # 右键菜单（Shell/Space/Folder）
│   │   ├── renderers/          # 插件渲染器（14 个）
│   │   │   ├── csv/            # CsvRenderer 拆分：types, EditableCell, TableView, GalleryView, BoardView, ConfigPanel
│   │   │   └── todo/           # TodoRenderer 拆分：parse-todos, FilterBar, SectionCard
│   │   └── settings/           # 设置面板
│   │       ├── DesktopUpdateCards.tsx     # Desktop Core/Shell 更新卡片
│   │       ├── McpConnectGuides.tsx       # MCP 连接指南（CLI/MCP）
│   │       ├── SyncEmptyState.tsx         # Git Sync 初始化向导
│   │       └── ...                        # AiTab, AppearanceTab, KnowledgeTab 等
│   ├── lib/                    # 核心模块
│   │   ├── fs.ts               # 文件系统操作
│   │   ├── agent/              # 内置 Agent (model + tools + prompt)
│   │   │   ├── sse/            # SSE 事件处理
│   │   │   │   └── events.ts   # SSE 类型定义 & 守卫函数
│   │   │   ├── skill-resolver.ts  # Skill 解析器
│   │   │   ├── non-streaming.ts   # 非流式响应回退逻辑
│   │   │   ├── file-context.ts    # 文件上下文构建
│   │   │   ├── request-utils.ts   # JSON 解析 & 验证工具
│   │   │   ├── prompt.ts         # System Prompt 组装
│   │   │   ├── tools.ts          # 24 个知识库工具定义
│   │   │   ├── context.ts        # Token 感知的上下文压缩
│   │   │   └── model.ts          # LLM 提供者选择
│   │   ├── a2a/               # A2A Protocol (Agent-to-Agent 通信)
│   │   ├── acp/               # ACP Protocol (Agent Client Protocol 集成)
│   │   ├── im/                # IM 集成（Telegram/Discord/Feishu/Slack/WeCom/DingTalk/WeChat/QQ）
│   │   │   ├── types.ts       # 8 个平台的统一类型定义
│   │   │   ├── config.ts      # IM 配置文件 I/O + 缓存
│   │   │   ├── executor.ts    # 统一的消息发送执行器 + 适配器生命周期
│   │   │   ├── format.ts      # 消息预处理（截断、格式降级）
│   │   │   ├── index.ts       # Pi Extension API 集成
│   │   │   └── adapters/      # 8 个平台适配器（各 50-150 行）
│   │   ├── hooks/              # 共享 React hooks
│   │   │   └── useDirectoryDragDrop.ts  # 文件拖放 hook
│   │   ├── stores/             # 全局状态 stores
│   │   │   ├── mcp-store.ts    # MCP 数据 (Zustand)
│   │   │   ├── locale-store.ts # 语言切换
│   │   │   └── hidden-files.ts # 隐藏文件 store
│   │   ├── parsing/            # 纯逻辑解析器
│   │   │   └── parse-todos.ts  # TODO 解析、行操作、日期、样式
│   │   ├── settings.ts         # 配置管理
│   │   └── renderers/          # 插件注册表
│   └── data/skills/            # 内置 Skill 上下文
├── mcp/                        # MCP Server（工具见 mcp/README 表格）
├── bin/                        # CLI 入口
│   ├── cli.js                  # 命令路由 + 入口 (208 行)
│   ├── lib/                    # 30 个模块 (4,118 行)
│   │   ├── mcp-agents.js       # MCP Agent 注册 (319 行)
│   │   ├── mcp-install.js      # MCP install 逻辑 (482 行)
│   │   ├── sync.js             # Git 自动同步 (578 行)
│   │   ├── gateway.js          # systemd/launchd 管理 (454 行)
│   │   ├── build.js, config.js, port.js, pid.js, stop.js 等
│   │   └── [其他 24 个模块]
│   └── commands/               # 24 个命令 (3,664 行)
│       ├── file.js            # 文件操作 (849 行)
│       ├── space.js           # 空间管理 (457 行)
│       ├── start.js           # 启动服务 (282 行)
│       ├── update.js          # 更新逻辑 (292 行)
│       ├── agent.js, doctor.js, config.js, sync-cmd.js 等
│       └── [其他 19 个命令]
├── skills/                     # Agent 工作流技能
├── templates/{en,zh}/          # 预设知识库模板
├── landing/                    # 静态 Landing Page
├── scripts/                    # setup.js, release.sh
└── wiki/                       # 项目文档（本文件所在）
```

## 模块详解

### 1. app/ — Next.js 16 前端

**技术栈：** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + TipTap + CodeMirror 6 + pi-agent-core 0.60.0 + pi-coding-agent 0.61.1 (session/model/auth)

**API Routes (65)：**

> **2026-04-10 架构优化**：关键路由已完成职责分离重构。`ask/route.ts` 从 1,524 行减少至 1,050 行 (-31%)，`file/route.ts` 从 451 行减少至 159 行 (-65%)。7 个业务逻辑模块已提取 (`lib/sse/events.ts`, `lib/agent/skill-resolver.ts`, `lib/agent/non-streaming.ts`, `lib/agent/file-context.ts`, `lib/api/request-utils.ts`, `lib/file/handlers.ts`, `lib/sync/config.ts`)。详见 `wiki/reviews/architecture-review-2026-04-10.md`。

| 端点 | 功能 |
|------|------|
| `POST /api/ask` | AI 对话 — 流式输出，自动注入 bootstrap + skill |
| `GET /api/ask-sessions` | 多轮对话历史 |
| `POST /api/auth` | Token 认证 |
| `GET /api/backlinks?path=` | 反向链接查询 |
| `GET /api/bootstrap` | Agent 上下文引导加载 |
| `POST /api/extract-pdf` | PDF 文本提取 |
| `GET/PUT/DELETE /api/file?path=` | 单文件 CRUD |
| `GET /api/files` | 文件树 |
| `GET /api/git` | Git 操作 |
| `GET /api/graph` | 知识图谱 (nodes + edges) |
| `GET /api/health` | 健康检查 |
| `GET /api/init` | 初始化状态 |
| `GET /api/monitoring` | 性能监控数据 |
| `GET /api/recent-files` | 最近修改 |
| `POST /api/restart` | 重启服务 |
| `GET /api/search?q=` | 全文搜索 |
| `GET/PUT /api/settings` | 应用设置 |
| `POST /api/settings/reset-token` | Token 重置 |
| `POST /api/settings/test-key` | API密钥测试 |
| `GET /api/skills` | Skills列表 |
| `POST /api/sync` | Git 同步操作 |
| `GET /api/update` | 更新操作 |
| `GET /api/update-check` | 检查更新 |
| `GET /api/mcp/agents` | MCP Agent列表 |
| `POST /api/mcp/install` | MCP安装 |
| `POST /api/mcp/install-skill` | Skill安装 |
| `GET /api/mcp/status` | MCP状态 |
| `GET /api/setup` | 安装设置 |
| `POST /api/setup/check-path` | 路径检查 |
| `POST /api/setup/check-port` | 端口检查 |
| `POST /api/setup/generate-token` | 生成Token |
| `GET /api/setup/ls` | 列出目录 |
| `POST /api/file/import` | 文件导入（支持 AI Organize） |
| `GET /api/changes` | 变更事件追踪 |
| `GET /api/tree-version` | 文件树版本号（缓存失效） |
| `POST /api/agent-activity` | Agent 活动日志 |
| `POST /api/a2a` | A2A JSON-RPC 端点 |
| `GET /api/a2a/agents` | A2A Agent 列表 |
| `GET /api/a2a/discover` | A2A Agent 发现 |
| `POST /api/a2a/delegations` | A2A 任务委派 |
| `GET /api/acp/registry` | ACP Agent 注册表 |
| `POST /api/acp/detect` | ACP Agent 检测 |
| `POST /api/acp/install` | ACP Agent 安装 |
| `POST /api/acp/config` | ACP 配置 |
| `POST /api/acp/session` | ACP Session 管理 |
| `POST /api/export` | 文件/目录导出 (MD/HTML/ZIP) |
| `GET /api/workflows` | 工作流定义 CRUD |
| `POST /api/mcp/restart` | MCP Server 重启 |
| `GET /api/settings/list-models` | 可用模型列表 |
| `GET /api/update-status` | 更新进度 |
| `POST /api/uninstall` | 卸载清理 |
| `GET /api/inbox` | Inbox 收件箱 |
| `POST /api/inbox/clip` | Web Clipper 裁剪入 Inbox |
| `GET /api/lint` | 知识库健康检查 |
| `GET /api/space-overview` | Space 概览数据 |
| `GET /api/file/raw` | 原始文件内容（无解析） |
| `POST /api/mcp/direct-tools` | MCP 工具直接调用 |
| `GET /api/mcp/tools` | MCP 工具列表 |
| `POST /api/mcp/uninstall` | MCP Agent 卸载 |
| `POST /api/agents/copy-skill` | 跨 Agent 复制 Skill |
| `GET/POST /api/agents/custom` | 自定义 Agent CRUD |
| `POST /api/agents/custom/detect` | 自定义 Agent 检测 |
| `GET/PUT/DELETE /api/im/config` | IM 平台配置 |
| `GET /api/im/status` | IM 平台连接状态 |
| `POST /api/im/test` | IM 消息测试发送 |

**核心组件拆分：**

> **2026-04-10 状态**：8 个超大组件已完成 60-85% 的拆分，提取 15+ 个子组件与专用 hook。

| 组件 | 拆分前 | 拆分后 | 减少 |
|------|--------|--------|------|
| TodoRenderer | 889 行 | 137 行 + (parse-todos.ts / FilterBar / SectionCard) | **-85%** |
| UpdateTab | 868 行 | 357 行 + DesktopUpdateCards.tsx | -59% |
| McpTab | 713 行 | 293 行 + McpConnectGuides.tsx | -59% |
| AgentsPanelA2aTab | 746 行 | 297 行 + AcpRegistrySection.tsx | -60% |
| AgentDetailContent | 1,188 行 | 741 行 + 6 子组件 (Header/Skills/Mcp/Space/Config/SkillEditor) | -38% |
| FileTree | 861 行 | 619 行 + FileTreeContextMenus.tsx, useDirectoryDragDrop hook | -28% |
| SyncTab | 775 行 | 556 行 + SyncEmptyState.tsx | -28% |
| AgentsSkillsSection | 869 行 | 655 行 + AgentsSkillsByAgent.tsx | -25% |
| AskContent | 771 行 | 771 行 | 跳过 (编排型组件，拆分反增复杂度) |

**插件渲染器 (14个)：**

| 渲染器 | 功能 | 目录 |
|--------|------|------|
| agent-inspector | Agent 调用记录查看 | agent-inspector/ |
| audio | 音频播放 | audio/ |
| backlinks | 反向链接展示 | backlinks/ |
| change-log | 变更日志 (改进版本) | change-log/ |
| config | 配置文件渲染 | config/ |
| csv | CSV 表格/看板/画廊视图 | csv/ |
| graph | 知识图谱可视化 | graph/ |
| image | 图片查看 | image/ |
| pdf | PDF 文档渲染 | pdf/ |
| summary | 内容摘要 | summary/ |
| timeline | 时间线视图 | timeline/ |
| todo | 待办事项看板 | todo/ |
| video | 视频播放 | video/ |
| workflow-yaml | YAML 工作流引擎 | workflow-yaml/ |

> **已移除的渲染器**：diff、workflow（旧版），功能已由 change-log 和 workflow-yaml 替代。

**安全：** middleware.ts Bearer Token 认证，同源浏览器免认证。

### 2. mcp/ — MCP Server

**传输：** stdio (本地 Agent) / Streamable HTTP (远程设备，Bearer Token)

**工具覆盖：** 读取 (bootstrap, list, read, recent, backlinks, history) / 搜索 (search_notes) / 写入 (write, create, append, append_csv) / 语义编辑 (insert_after_heading, update_section, insert_lines, update_lines) / 管理 (delete, rename, move) — 完整列表以 `mcp/src/index.ts` 注册为准。

**安全边界：** 路径沙箱 (`MIND_ROOT` 内) + `INSTRUCTION.md` 写保护 + 25,000 字符上限

### 3. bin/ — CLI

13 个 lib 模块 + cli.js 主入口。ESM (`"type": "module"`)。

**命令：** start, dev, stop, open, sync, mcp, mcp install, gateway, token, config, doctor, update, logs, help

### 4. skills/ — Agent Skill

`mindos` (EN) + `mindos-zh` (ZH) + 28 条 evals。定义结构感知路由、搜索回退、多文件审批等最佳实践。

同步：`skills/` → `app/data/skills/` 手动同步。

### 6. IM Integration — 即时通讯平台集成

**支持的平台（8 个）：**

| # | 平台 | SDK / 协议 | 认证方式 | 文本上限 | Markdown | 线程 |
|---|------|-----------|---------|---------|----------|------|
| 1 | **Telegram** | grammY | `bot_token`（含 `:` 分隔） | 4,096 | yes | yes |
| 2 | **Discord** | discord.js (REST) | `bot_token` | 2,000 | yes | yes |
| 3 | **飞书 (Feishu/Lark)** | @larksuiteoapi/node-sdk | `app_id` + `app_secret` | 30,000 | yes | yes |
| 4 | **Slack** | @slack/web-api | `bot_token`（`xoxb-` 前缀） | 4,000 | yes | yes |
| 5 | **企业微信 (WeCom)** | native fetch | `webhook_key` 或 `corp_id` + `corp_secret` | 2,048 | yes | no |
| 6 | **钉钉 (DingTalk)** | native fetch + HMAC | `webhook_url` 或 `client_id` + `client_secret` | 20,000 | yes | no |
| 7 | **微信 (WeChat)** | native fetch (ClawBot) | `bot_token` | 4,096 | no | no |
| 8 | **QQ** | native fetch (QQ Open Platform) | `app_id` + `app_secret` | 4,096 | yes | no |

> WeCom 和 DingTalk 支持**双认证模式**：简单 webhook（单向发送）或完整应用凭证（双向交互）。

**核心模块 (`lib/im/`)：**
- `types.ts` (147 行) — 8 个平台的统一类型定义 + 能力矩阵 + `PLATFORM_LIMITS`
- `config.ts` (160 行) — `~/.mindos/im.json` 配置文件 I/O，mtime-based 缓存，原子写入
- `executor.ts` (225 行) — 统一的消息发送执行器 + 适配器单例管理 + 指数退避重试
- `format.ts` (116 行) — 消息预处理（Markdown 降级、Telegram MarkdownV2 转换、截断）
- `index.ts` (122 行) — pi-coding-agent Extension API 集成，注册 2 个工具 + 1 个命令
- `adapters/` — 8 个平台适配器（50-250 行，全部 lazy-load + dynamic import）

**适配器设计模式：**
- Telegram/Discord/Feishu/Slack 使用 npm SDK（dynamic import，未使用时零 bundle 成本）
- WeCom/DingTalk/WeChat/QQ 使用 native fetch（无外部依赖）
- WeCom/DingTalk/QQ 有 token 自动刷新（过期前 5 分钟提前刷新）

**Agent 工具（2 个）：**
- `send_im_message(platform, recipient_id, message, format?, thread_id?)` — 发送消息到已配置平台
- `list_im_channels()` — 列出已连接平台 + 连接状态 + 支持的特性

**配置文件：** `~/.mindos/im.json`（权限 0o600，原子写入）

```json
{
  "providers": {
    "telegram": { "bot_token": "123:ABC..." },
    "feishu": { "app_id": "...", "app_secret": "..." },
    "wecom": { "webhook_key": "..." },
    "dingtalk": { "webhook_url": "...", "webhook_secret": "..." }
  }
}
```

**API 端点：**
- `GET /api/im/status` — 列出已配置平台 + 连接状态
- `GET/PUT/DELETE /api/im/config` — IM 配置 CRUD（敏感信息自动掩盖）
- `POST /api/im/test` — 测试消息发送

参考：`wiki/refs/im-integration-research-2026-04-09.md`（详细的平台对比与 SDK 选型）、`wiki/specs/spec-im-integration.md`（完整架构）。

### 7. A2A Protocol — Agent 间通信

**协议：** Google A2A (Agent-to-Agent) 标准协议

**端点：**
- `/.well-known/agent-card.json` — Agent Card 发现
- `POST /api/a2a` — JSON-RPC 入口（SendMessage / GetTask / CancelTask）

**暴露能力：** Search Knowledge Base, Read Note, Write Note, List Files, Organize Files

**Agent 工具 (6)：** `list_remote_agents`, `discover_agent`, `discover_agents`, `delegate_to_agent`, `check_task_status`, `orchestrate`

### 8. ACP Protocol — Agent Client Protocol

**协议：** ACP 标准协议，支持远程 Agent subprocess 调用

**端点：** `/api/acp/*`（registry / detect / install / config / session）

**注册表：** 31+ 个 ACP Agent 可用

**Agent 工具 (2)：** `list_acp_agents`, `call_acp_agent`

### 9. Agent 支持体系

**当前支持 25 个 Agent**（`app/lib/mcp-agents.ts`，单一真实来源）：

| # | Agent | 全局配置路径 | 格式 | 配置 Key | CLI |
|---|-------|-------------|------|---------|-----|
| 1 | MindOS | `~/.mindos/mcp.json` | json | `mcpServers` | — |
| 2 | Claude Code | `~/.claude.json` | json | `mcpServers` | `claude` |
| 3 | Cursor | `~/.cursor/mcp.json` | json | `mcpServers` | — |
| 4 | Windsurf | `~/.codeium/windsurf/mcp_config.json` | json | `mcpServers` | — |
| 5 | Cline | VS Code globalStorage | json | `mcpServers` | — |
| 6 | Trae | `~/.trae/mcp.json` | json | `mcpServers` | — |
| 7 | Gemini CLI | `~/.gemini/settings.json` | json | `mcpServers` | `gemini` |
| 8 | OpenClaw | `~/.openclaw/mcp.json` | json | `mcpServers` | `openclaw` |
| 9 | CodeBuddy | `~/.codebuddy/mcp.json` | json | `mcpServers` | `codebuddy` |
| 10 | iFlow CLI | `~/.iflow/settings.json` | json | `mcpServers` | `iflow` |
| 11 | Kimi Code | `~/.kimi/mcp.json` | json | `mcpServers` | `kimi` |
| 12 | OpenCode | `~/.config/opencode/config.json` | json | `mcpServers` | `opencode` |
| 13 | Pi | `~/.pi/agent/mcp.json` | json | `mcpServers` | `pi` |
| 14 | Augment | `~/.augment/settings.json` | json | `mcpServers` | `auggie` |
| 15 | Qwen Code | `~/.qwen/settings.json` | json | `mcpServers` | `qwen` |
| 16 | Qoder | `~/.qoder.json` | json | `mcpServers` | `qoder` |
| 17 | Trae CN | Application Support (平台相关) | json | `mcpServers` | `trae-cli` |
| 18 | Roo Code | VS Code globalStorage | json | `mcpServers` | — |
| 19 | GitHub Copilot | `Code/User/mcp.json` (平台相关) | json | **`servers`** | `code` |
| 20 | Codex | `~/.codex/config.toml` | **toml** | **`mcp_servers`** | `codex` |
| 21 | Antigravity | `~/.gemini/antigravity/mcp_config.json` | json | `mcpServers` | `agy` |
| 22 | QClaw | `~/.qclaw/mcp.json` | json | `mcpServers` | `qclaw` |
| 23 | WorkBuddy | `~/.workbuddy/mcp.json` | json | `mcpServers` | `workbuddy` |
| 24 | Lingma | `~/.lingma/mcp.json` | json | `mcpServers` | — |
| 25 | CoPaw | `~/.copaw/config.json` | json | **`mcp`** | `copaw` |

**特殊格式 Agent：**
- **GitHub Copilot**：配置 key 为 `servers`（非 `mcpServers`）
- **Codex**：TOML 格式，key 为 `mcp_servers`
- **CoPaw**：key 为 `mcp`，嵌套路径 `mcp.clients`

**所有 Agent 均使用 stdio 传输。** CLI 和 TS 注册表共享同一数据源（`bin/lib/mcp-agents.js` 导入自 TS 编译产物）。

新增 Agent 支持时需改动的文件：

| 文件 | 改什么 | 说明 |
|------|--------|------|
| `app/lib/mcp-agents.ts` | `MCP_AGENTS` 对象新增 `AgentDef` | **主定义**，MCP 配置路径、传输方式、存在检测。UI 和 API 自动读取 |
| `app/app/api/mcp/install-skill/route.ts` | `UNIVERSAL_AGENTS` / `AGENT_NAME_MAP` / `SKILL_UNSUPPORTED` | Skill 安装时判断是否需要 `-a` flag |

自动生效（不需要改）：`/api/mcp/agents`（遍历 `MCP_AGENTS`）、`SetupWizard.tsx`、`McpTab.tsx`（动态渲染）。

参考：`wiki/refs/npx-skills-mechanism.md`（Skills CLI 机制与 Agent 支持矩阵）。

## 数据流

### AI 对话流

```
用户消息 → POST /api/ask
    ├── 注入：Skill + Bootstrap (INSTRUCTION + README + CONFIG) + 当前文件 + 附件
    └── pi-coding-agent session → Anthropic/OpenAI → 24 个 KB tools + 6 个 A2A tools + 2 个 ACP tools + 2 个 IM tools → 流式输出
```

### 外部 Agent (MCP)

```
Agent → stdio: spawn node mcp/dist/index.js ← stdin/stdout → MCP Server ← fs → my-mind/
     → HTTP:  POST http://host:8781/mcp ← Bearer Token → MCP Server ← fs → my-mind/
```

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 前端框架 | Next.js 16 App Router | 服务端组件 + 流式渲染 + API Routes 一体化 |
| 编辑器 | TipTap + CodeMirror 6 | 富文本 + 源码双模式，各自领域最优 |
| Agent SDK | pi-agent-core 0.60.0 | Agent 执行循环 + TypeBox 工具定义 |
| MCP SDK | `@modelcontextprotocol/sdk` | 标准协议，跨 Agent 兼容 |
| 存储 | 本地纯文本 + Git | 隐私、主权、可审计、零依赖 |
| 认证 | Bearer Token (可选) | 简单，兼顾本地开发和网络暴露 |
| 模块格式 | ESM (`"type": "module"`) | Node.js 原生 ESM，import/export |
| 原子写入 | temp file + rename | 防写入中断丢数据 |
