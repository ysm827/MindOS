# Spec: A2A Integration

## ACP (Agent Client Protocol) 调研

### 1. ACP 概述

ACP 是由 Zed Industries 和 JetBrains 联合主导的开放协议，专注于 **编辑器/IDE 与 AI 编码 Agent 之间的通信**。灵感来自 LSP (Language Server Protocol) 的成功经验 — 正如 LSP 将编辑器与语言服务解耦，ACP 将编辑器与 AI Agent 解耦。

- **协议版本**: v0.11.0 (2026年3月4日)
- **传输层**: JSON-RPC 2.0 over stdio (主要) / Streamable HTTP (Draft)
- **许可证**: Apache-2.0
- **治理**: Lead Maintainer: Sergey Ignatov (JetBrains)，多供应商协作模式
- **注册表**: https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json

### 2. ACP 生态规模

截至 2026年3月，ACP 注册表包含 **31 个 Agent**:

| 分类 | Agent |
|------|-------|
| 大厂 | Gemini CLI (Google), GitHub Copilot, Claude Agent (Anthropic), Cursor, Junie (JetBrains), Codebuddy Code (Tencent), Qwen Code (Alibaba), Kimi CLI (Moonshot) |
| 开源 | Cline, Goose (Block), OpenCode, Kilo, Mistral Vibe, DeepAgents (LangChain) |
| 新兴 | Auggie (Augment), Factory Droid, Nova (Compass), Codex CLI (OpenAI) |

**支持的编辑器/客户端**: Zed, JetBrains IDEs, VS Code (扩展), Neovim, Emacs, Obsidian

### 3. ACP 核心架构

#### 3.1 通信模型

```
编辑器 (Client) <--JSON-RPC 2.0 over stdio--> Agent (子进程)
                          |
                    MCP Servers (外部工具/数据源)
```

ACP 是一个**双向、可流式、可中断、可扩展的会话协议**。

#### 3.2 初始化流程

```
Client -> Agent: initialize (版本协商 + 能力交换)
Client -> Agent: authenticate (如需要)
Client -> Agent: session/new 或 session/load
```

#### 3.3 Prompt Turn 执行流

```
用户发起 prompt
  -> Client 发送 session/prompt
  -> Agent 通过 session/update 流式返回 (文本/计划/工具调用/文件修改)
  -> Client 可通过 session/cancel 中断
  -> Turn 完成
```

#### 3.4 Agent 能力

- 文件系统: 读/写/创建/删除文件
- 终端: 执行命令、流式输出、退出码
- 权限请求: 敏感操作需用户批准
- MCP 集成: 复用 MCP ContentBlock 结构、工具定义

### 4. ACP vs A2A 对比

| 维度 | ACP | A2A |
|------|-----|-----|
| **定位** | 编辑器 <-> Agent 通信 | Agent <-> Agent 通信 |
| **发起方** | Zed + JetBrains | Google (Linux Foundation) |
| **传输层** | JSON-RPC 2.0 over stdio | JSON-RPC 2.0 over HTTP |
| **交互模型** | 有状态会话 (session) | 无状态任务 (task) |
| **核心概念** | Session + Prompt Turn | Agent Card + Task + Artifact |
| **发现机制** | 注册表 (registry.json) | Well-known URI (agent-card.json) |
| **流式** | session/update 通知 | SSE (Server-Sent Events) |
| **Agent 类型** | 编码 Agent (IDE集成) | 通用 Agent (任意领域) |
| **MCP 关系** | 深度复用 MCP 数据类型 | 独立于 MCP |
| **生态规模** | 31 Agent, 6+ 编辑器 | 较小，标准化中 |
| **成熟度** | v0.11.0, 生产级 | v1.0, 初期阶段 |

### 5. 关键洞察

**ACP 和 A2A 是互补的，不是竞争的**:
- ACP 解决的是 **编辑器如何调用 Agent** 的问题 (垂直集成)
- A2A 解决的是 **Agent 之间如何协作** 的问题 (水平协作)
- MindOS 可以同时支持两者: 作为 A2A Agent 被其他 Agent 调用，同时通过 ACP 被 IDE 集成

**MindOS 的机会**:
1. **ACP Agent**: 将 MindOS 注册为 ACP Agent，让 Zed/JetBrains 用户可以直接使用 MindOS 的知识库能力
2. **ACP Client**: 在 MindOS 中集成 ACP 客户端，让用户可以调用任何 ACP Agent (如 Gemini, Copilot)
3. **A2A + ACP 桥**: 将 ACP Agent 的能力通过 A2A 协议暴露给其他 Agent

### 6. 后续计划

- [ ] 评估将 MindOS 注册为 ACP Agent 的可行性 (需要实现 stdio 传输)
- [ ] 调研 ACP SDK (Rust 为主，JS/TS SDK 状态待确认)
- [ ] 考虑在 A2A Tab 中增加 ACP Agent 发现能力
- [ ] 关注 ACP v0.12.0 (远程 Agent 支持完善)
