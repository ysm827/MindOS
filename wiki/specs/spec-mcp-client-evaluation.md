# Spec: MCP Client 方案评估与优化

> 状态：**已完成** | 日期：2026-04-10 | Commit: `8f9236e3`

## 目标

评估当前 MindOS 使用的 MCP Client 方案（`mcporter`），与社区流行的替代方案（`pi-mcp-adapter`、直接使用 `@modelcontextprotocol/sdk`）进行对比，确定最优路径。核心诉求：**token 高效、运维简单、适合 Web-based 知识库 Agent（非终端编码 Agent）**。

---

## 现状分析

### 当前架构

MindOS 的 MCP 分为两个角色：

| 角色 | 实现 | 用途 |
|------|------|------|
| **MCP Server** | `@modelcontextprotocol/sdk@^1.25.0`（`mcp/` 目录） | 暴露 MindOS 31 个工具给外部 Agent（Claude Code、Cursor 等） |
| **MCP Client** | `mcporter@^0.7.3`（`app/lib/pi-integration/mcporter.ts`） | 消费外部 MCP Server 的工具，注入 Agent 的 tool list |

本 Spec 聚焦 **MCP Client** 侧。

### 关键背景：MindOS 与 pi-coding-agent 的关系

MindOS **已经深度使用 pi-coding-agent 框架**（`@mariozechner/pi-coding-agent@^0.61.1`），包括：

- `createAgentSession()` — Agent session 引擎
- `DefaultResourceLoader` — 资源加载（skill、extension 发现）
- `additionalExtensionPaths: scanExtensionPaths()` — **extension 加载管道已打通**
- `ModelRegistry`、`AuthStorage`、`SessionManager`、`SettingsManager`
- `convertToLlm`、`bashTool`

这意味着 **pi extension 格式的插件可以直接被 MindOS 加载**。Extension 通过 `export default function(pi: ExtensionAPI)` 注册工具和事件钩子，框架支持 headless（RPC）模式，`pi.registerTool()` 在非 TUI 环境下完全可用。

代码位置：`app/app/api/ask/route.ts:628-644`

```typescript
const resourceLoader = new DefaultResourceLoader({
  cwd: projectRoot,
  additionalExtensionPaths: scanExtensionPaths(), // ← ~/.mindos/extensions/
  // ...
});
const { session } = await createAgentSession({ resourceLoader, ... });
```

### 当前 MCP Client 实现细节（228 行）

```
mcporter.ts
├── loadMcporter()              ← ESM 动态 import（mcporter 是 ESM-only）
├── getRuntime()                ← 单例 Runtime，进程退出时 cleanup
├── listMcporterServers()       ← 枚举所有 MCP server + 每个 server 的工具列表
├── listMcporterTools(server)   ← 单个 server 的工具详情（含 inputSchema）
├── callMcporterTool()          ← 调用工具（30s timeout）
└── createMcporterAgentTools()  ← 将 MCP 工具转为 AgentTool[] 格式
```

**配置文件**：`~/.mindos/mcp.json`

**工具命名**：`mcp__{server_name}__{tool_name}`（与 Claude Code 命名约定一致）

### 当前方案的痛点

| 问题 | 影响 |
|------|------|
| **全量工具注册** | 所有 MCP server 的所有工具一次性注入 Agent tool list，每个工具定义消耗 ~150-300 tokens |
| **无 lazy loading** | 所有 server 在 `getRuntime()` 时启动，无论是否被使用 |
| **无 metadata 缓存** | 每次重启需重新连接所有 server 获取工具列表 |
| **ESM 兼容性摩擦** | mcporter 是 ESM-only，需要 dynamic import hack |
| **无 idle 断开** | server 进程常驻，即使长时间未使用 |
| **与框架 extension 体系脱节** | mcporter 是独立 runtime，绕过了 pi-coding-agent 的 extension 管道 |

---

## 候选方案对比

### 方案 A：mcporter（当前方案）

**项目**：[github.com/steipete/mcporter](https://github.com/steipete/mcporter)

| 维度 | 详情 |
|------|------|
| 版本 | 0.8.1（我们用 ^0.7.3） |
| GitHub Stars | ~3,900 |
| npm 周下载 | ~112,000 |
| 依赖数 | 9 个（含 `@modelcontextprotocol/sdk`、`rolldown`、`zod` 等） |
| 定位 | 通用 MCP runtime + CLI + 代码生成工具包 |
| 传输支持 | stdio / HTTP / SSE |
| OAuth | 内置 |
| 独立性 | 完全独立，不依赖 pi-coding-agent |

**优势**：
- 社区活跃度高（3.9k stars，112k 周下载）
- 功能全面：CLI、代码生成、daemon 管理、多配置源合并
- 多 agent 配置导入（Cursor、Claude Desktop、VSCode、Windsurf、OpenCode）

**劣势**：
- **面向 CLI/终端用户设计**，非 Web 嵌入优先。CLI、daemon 管理、代码生成等 MindOS 用不到
- **无 token 优化能力**。不提供 lazy loading 或 proxy tool 机制——工具定义全量透传
- **较重**：`rolldown` bundler 依赖引入额外体积
- **ESM-only**，Next.js 集成需要 dynamic import workaround
- **无 idle 超时**：已连接的 server 不会自动断开
- **绕过框架**：作为独立 runtime 运行，不走 pi extension 管道，与框架的 tool 管理割裂

### 方案 B：pi-mcp-adapter（直接作为 Extension 加载）

**项目**：[github.com/nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)

| 维度 | 详情 |
|------|------|
| 版本 | 2.2.2 |
| GitHub Stars | ~325 |
| npm 周下载 | ~4,000 |
| 依赖数 | 4 个（`@modelcontextprotocol/sdk`、`@modelcontextprotocol/ext-apps`、`@sinclair/typebox`、`zod`） |
| 定位 | Pi coding agent 的 MCP 适配层，token 效率优先 |
| 传输支持 | stdio / HTTP / SSE |
| OAuth | Bearer + OAuth |

**关键发现：MindOS 可以直接加载 pi-mcp-adapter**

MindOS 已经具备 pi extension 的完整加载管道：

1. `DefaultResourceLoader({ additionalExtensionPaths })` 扫描 `~/.mindos/extensions/`
2. 框架通过 jiti 加载 TypeScript extension，无需编译
3. Extension 的 `pi.registerTool()` 注册的工具会自动进入 Agent 的 tool list
4. 框架支持 headless（RPC）模式，`pi.registerTool()` 不依赖 TUI
5. Extension 可通过 `ctx.hasUI` 判断是否在 TUI 环境中，优雅降级

**集成路径**：
```bash
# 安装
npm install pi-mcp-adapter

# 将入口放到 extension 路径
# 方式一：符号链接
ln -s node_modules/pi-mcp-adapter/dist/extension.js ~/.mindos/extensions/pi-mcp-adapter.js

# 方式二：additionalExtensionPaths 直接指向
additionalExtensionPaths: [
  ...scanExtensionPaths(),
  require.resolve('pi-mcp-adapter'),
]
```

**优势**：
- **token 效率是核心设计目标**：单个 proxy tool（~200 tokens）替代数百个工具定义
- **三级生命周期**：lazy（按需连接）、eager（立即连接）、keep-alive（持久连接+心跳）
- **idle 超时自动断开**：默认 10 分钟
- **metadata 缓存**：工具搜索/描述无需活跃连接
- **npx 优化**：解析到实际二进制路径，跳过 ~143MB npm 父进程
- **Direct Tools**：可将高频工具提升为一等工具，绕过 proxy
- **与框架对齐**：走 pi extension 标准管道，工具注册、事件钩子等框架统一管理
- **依赖轻量**：仅 4 个依赖，其中 `@sinclair/typebox` 和 `zod` 项目已有

**劣势 / 需验证**：
- **TUI 相关调用的降级**：`ctx.ui.custom()` 等 TUI 专属方法在 headless 模式下的行为需要实测。核心功能（tool 注册/搜索/调用）不受影响，但 `/mcp` 交互式管理面板无法使用
- **配置路径差异**：pi-mcp-adapter 默认读 `~/.pi/agent/mcp.json`，MindOS 用 `~/.mindos/mcp.json`。需要通过配置映射或符号链接解决
- **社区规模较小**（325 stars vs mcporter 3.9k）
- **OAuth token 不自动刷新**
- **MCP server 不跨 session 共享**（每个 pi session 独立进程）

### 方案 C：直接使用 @modelcontextprotocol/sdk

**项目**：[github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)

| 维度 | 详情 |
|------|------|
| 版本 | ^1.25.0（MindOS mcp/ 目录已在使用） |
| 定位 | Anthropic 官方 MCP TypeScript SDK |
| 依赖 | 已存在于项目中（MCP Server 侧） |

**优势**：
- **零额外依赖**：MindOS 已经安装了这个包
- **完全可控**：自己实现连接管理、工具发现、调用，无黑盒
- **最轻量**：不引入任何不需要的功能

**劣势**：
- 需要自己实现：连接池管理、lazy loading、idle 超时、配置解析、多 transport 支持
- 预估开发量 ~300-500 行
- 需要自己处理 MCP server 的生命周期管理（spawn/kill stdio 进程等）
- 没有多 agent 配置导入（Cursor 等），需要自建或放弃

---

## 综合对比

| 维度 | mcporter（当前） | pi-mcp-adapter | 直接 SDK |
|------|:---:|:---:|:---:|
| Token 效率 | ❌ 全量注入 | ✅ Proxy tool ~200 tokens | ✅ 可自建 |
| Lazy loading | ❌ | ✅ 三级生命周期 | ✅ 可自建 |
| Idle 超时 | ❌ | ✅ 可配置 | ✅ 可自建 |
| Metadata 缓存 | ❌ | ✅ 本地 JSON 缓存 | ✅ 可自建 |
| 框架对齐 | ❌ 独立 runtime | ✅ 原生 pi extension | ❌ 需自建适配 |
| 额外依赖 | 9 个包 | 2 个新包（其余已有） | 0（已有） |
| 开发量 | 已完成 | 需验证 + 适配配置路径 | ~300-500 行 |
| 社区支持 | ⭐⭐⭐ 3.9k stars | ⭐⭐ 325 stars | ⭐⭐⭐ 官方 SDK |
| 配置导入 | ✅ 6+ agent | ✅ 4+ agent | ❌ 需自建 |
| 适合 Web Agent | ⚠️ CLI 优先设计 | ✅ 核心功能与 UI 解耦 | ✅ 完全可控 |
| 可删除 mcporter | — | ✅ 可替代 | ✅ 可替代 |

---

## 推荐方案：替换 mcporter，直接集成 pi-mcp-adapter

### 理由

1. **MindOS 已经跑在 pi-coding-agent 框架上**。Extension 加载管道（`additionalExtensionPaths` → `DefaultResourceLoader` → `createAgentSession`）已完全打通。pi-mcp-adapter 是标准 pi extension，理论上可以直接加载，无需额外适配层。

2. **pi-mcp-adapter 解决了 mcporter 的所有痛点**：token 优化（proxy tool）、lazy loading、idle 超时、metadata 缓存——这些功能在 mcporter 上需要自建 ~260 行代码，而 pi-mcp-adapter 已经内置。

3. **消除架构割裂**。mcporter 是独立 runtime，绕过了 pi 框架的 tool 管理。换成 pi-mcp-adapter 后，MCP 工具走框架标准管道，与 skill、extension 统一管理。

4. **减少依赖**。移除 mcporter（9 个依赖，含 `rolldown`），引入 pi-mcp-adapter（2 个新依赖），净减少 ~7 个依赖。

5. **开发量最小**。不需要自建 proxy tool 层、metadata 缓存、lazy loading——pi-mcp-adapter 全部内置。主要工作是配置适配和验证。

### 实施计划

#### Phase 1：验证可行性（Spike）

在不修改生产代码的情况下验证：

1. **安装 pi-mcp-adapter**
   ```bash
   cd app && npm install pi-mcp-adapter
   ```

2. **配置 extension 路径**，临时在 `route.ts` 中添加：
   ```typescript
   additionalExtensionPaths: [
     ...scanExtensionPaths(),
     path.dirname(require.resolve('pi-mcp-adapter')),
   ],
   ```

3. **创建 MCP 配置**
   ```bash
   # pi-mcp-adapter 默认读 ~/.pi/agent/mcp.json
   # 验证时可以直接创建：
   mkdir -p ~/.pi/agent
   cat > ~/.pi/agent/mcp.json << 'EOF'
   {
     "mcpServers": {
       "test-server": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-everything"],
         "lifecycle": "lazy"
       }
     }
   }
   EOF
   ```

4. **验证清单**
   - [ ] Extension 被框架成功加载（无 crash）
   - [ ] `mcp()` proxy tool 出现在 Agent tool list 中
   - [ ] Agent 可以通过 `mcp({ search: "..." })` 搜索工具
   - [ ] Agent 可以通过 `mcp({ tool: "...", args: "..." })` 调用工具
   - [ ] headless 模式下 TUI 相关调用优雅降级（不 crash）
   - [ ] lazy 模式下 server 不在启动时连接

#### Phase 2：正式集成

验证通过后：

| 步骤 | 文件 | 变更 |
|------|------|------|
| 1. 安装依赖 | `app/package.json` | 添加 `pi-mcp-adapter`，移除 `mcporter` |
| 2. 配置路径映射 | `app/lib/pi-integration/extensions.ts` | `scanExtensionPaths()` 中追加 pi-mcp-adapter 路径 |
| 3. 配置文件兼容 | `app/lib/pi-integration/mcp-config.ts`（新增） | 将 `~/.mindos/mcp.json` 映射/符号链接到 pi-mcp-adapter 期望的路径，或通过 adapter 配置项指定自定义路径 |
| 4. 删除 mcporter 层 | `app/lib/pi-integration/mcporter.ts` | 删除整个文件（228 行） |
| 5. 更新工具注册 | `app/lib/agent/tools.ts` | 移除 `createMcporterAgentTools()` 调用——框架的 extension 管道会自动注册 proxy tool |
| 6. 更新 Settings UI | `app/components/settings/` | MCP server 管理页面适配新配置格式（如有差异） |
| 7. 更新 MCP 安装 CLI | `bin/lib/mcp-install.js` | 配置文件写入路径适配 |

#### Phase 3：增强（可选）

- **Direct Tools UI**：在 Settings 中让用户勾选哪些 MCP 工具作为 direct tool
- **MindOS 配置路径覆盖**：向 pi-mcp-adapter 提 PR，支持自定义 config path
- **Server 状态 UI**：在 Settings MCP 面板显示 server 连接状态、idle 倒计时

---

## 回退方案

如果 Phase 1 验证发现 pi-mcp-adapter 在 headless 模式下有不可解决的问题（如 TUI 调用 crash、Extension API 不兼容等），则回退到 **保留 mcporter + 自建 Proxy Tool 层**：

- 在 `mcporter.ts` 上层新增 `mcp-proxy-tools.ts`（~150 行）
- 实现 `mcp_search` + `mcp_call` 两个代理工具
- 自建 metadata 缓存和 lazy loading
- 这仍然比当前全量注册方案好得多

---

## 变更清单

### 主方案（替换 mcporter 为 pi-mcp-adapter）

| 文件 | 变更 | 行数 |
|------|------|------|
| `app/package.json` | +pi-mcp-adapter, -mcporter | ~2 行改 |
| `app/lib/pi-integration/extensions.ts` | 追加 pi-mcp-adapter extension 路径 | +~5 行 |
| `app/lib/pi-integration/mcp-config.ts` | **新增** 配置文件路径映射 | ~30 行 |
| `app/lib/pi-integration/mcporter.ts` | **删除** | -228 行 |
| `app/lib/agent/tools.ts` | 移除 mcporter 工具注册调用 | -~15 行 |
| `app/app/api/mcp/*` | 适配新配置格式 | ~20 行改 |

**净效果：-200 行代码，-7 个依赖**

### 回退方案（保留 mcporter + Proxy Tool 层）

| 文件 | 变更 | 行数 |
|------|------|------|
| `app/lib/agent/mcp-proxy-tools.ts` | **新增** Proxy Tool 策略层 | ~150 行 |
| `app/lib/pi-integration/mcporter.ts` | 添加 metadata 缓存、lazy 连接 | +~80 行 |
| `app/lib/agent/tools.ts` | 替换全量注册为 proxy tools | ~10 行改 |

---

## 验收标准

- [ ] MCP 工具通过 proxy tool 暴露（~200 tokens），而非全量注册（N*150 tokens）
- [ ] Lazy loading 生效：未使用的 MCP server 不在启动时连接
- [ ] Metadata 缓存生效：`mcp_search` 在无活跃连接时仍能返回结果
- [ ] idle 超时生效：闲置 server 自动断开
- [ ] 现有 `~/.mindos/mcp.json` 配置兼容（或有清晰的迁移路径）
- [ ] Agent 完整流程：搜索工具 → 调用工具 → 获取结果
- [ ] Settings UI 中 MCP server 管理功能正常

---

## Token 节省估算

| 场景 | 当前（mcporter 全量注册） | 改造后（proxy tool） | 节省 |
|------|:---:|:---:|:---:|
| 1 个 MCP server（10 个工具） | ~1,500 tokens | ~200 tokens | **87%** |
| 3 个 MCP server（30 个工具） | ~4,500 tokens | ~200 tokens | **96%** |
| 5 个 MCP server（50 个工具） | ~7,500 tokens | ~200 tokens | **97%** |

---

## 附录：Pi Coding Agent Extension 生态调研

### 值得关注的 Extension

除 MCP adapter 外，以下 pi-coding-agent extension 对 MindOS 有参考价值：

| Extension | Stars | 功能 | MindOS 可借鉴 |
|-----------|-------|------|--------------|
| **pi-web-access** | - | 多引擎 Web 搜索 + YouTube 分析 + PDF 提取 | 多引擎 fallback 策略可增强 `web_search` 工具 |
| **pi-browser** | - | Playwright 浏览器自动化（连接现有浏览器） | 未来"帮用户操作网页"场景的成熟方案 |
| **pi-memory-md** | - | 结构化 Markdown 长期记忆系统 | 长期/短期/工作记忆分层设计可启发 Agent 上下文管理 |
| **oh-pi** | - | 一键配置 + ant-colony 多 Agent 协作 | 蚁群模式的多 Agent 编排思路 |
| **pi-extension-manager** | - | 交互式扩展管理 | 如果 MindOS 开放扩展系统，可参考其 UI |

### 官方示例中的有用模式

| 模式 | 示例 | MindOS 启发 |
|------|------|------------|
| 危险操作拦截 | `permission-gate.ts` | 写操作前确认可以更细粒度 |
| 路径保护 | `protected-paths.ts` | 类似已有的 `resolveSafe()` 沙盒 |
| Git 检查点 | `git-checkpoint.ts` | 知识库版本回溯可以更轻量 |
| 只读模式 | `plan-mode/` | MindOS 可加"只读浏览"模式 |
| 子 Agent 委托 | `subagent/` | Skill 执行支持委托给专门子 Agent |
| 上下文交接 | `handoff.ts` | 跨 Agent 共享知识库上下文 |

### Extension API 能力总览

Pi Extension 可注册：工具、slash 命令、20+ 生命周期事件钩子、自定义 UI、自定义 LLM Provider、消息注入（动态 RAG）、session 管理。当前 MindOS 已使用 extension 扫描机制（`scanExtensionPaths()`），extension 加载管道完全打通。

### 建议后续行动

1. **短期**：实施本 Spec，替换 mcporter 为 pi-mcp-adapter，解决 token 开销问题
2. **中期**：评估 `pi-web-access` 的多引擎搜索策略，增强 MindOS 的 `web_search` 工具
3. **长期**：探索将更多社区 extension（如 pi-browser、pi-memory-md）作为可选插件提供给用户
