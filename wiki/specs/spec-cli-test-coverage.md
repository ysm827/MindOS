# Spec: CLI 核心模块测试覆盖

**Status**: Draft
**Priority**: P0（整个 `bin/` 目录零测试，用户安装到启动的每一步都在此，出 bug 只能人肉发现）
**涉及文件**: `tests/unit/` 新增测试文件（不改源码）

---

## 现状

| 层 | 测试文件数 | 测试数 | 覆盖 |
|----|----------|-------|------|
| App API routes | 14 | ~180 | ✅ 良好 |
| App core libs | 13 | ~200 | ✅ 良好 |
| `bin/lib/` CLI 模块 | 0 | 0 | ❌ 零覆盖 |
| `tests/unit/` 已有 | 4 | ~40 | 提取逻辑的合约测试，不测实际模块 |

`tests/unit/` 现有 4 个文件全是**提取逻辑后的合约测试**（复制函数到测试文件里测，不 import 源码），当源码改动时测试不会自动感知回归。

---

## 目标

为 `bin/lib/` 中 **用户安装/启动关键路径** 的模块补充单元测试，覆盖以下断裂风险：

### T1: `config.js` — 配置加载与环境变量映射

**风险**：映射错 → AI 不可用、端口错、Token 丢失
**测试文件**: `tests/unit/cli-config.test.ts`

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | 新格式 providers 映射 | `config.ai.providers.anthropic.apiKey` → `ANTHROPIC_API_KEY` |
| 2 | 旧格式 fallback 映射 | `config.ai.anthropicApiKey` → `ANTHROPIC_API_KEY` |
| 3 | OpenAI 全字段映射 | apiKey + model + baseUrl 三个变量都设置 |
| 4 | 端口映射 | `config.port` → `MINDOS_WEB_PORT`，`config.mcpPort` → `MINDOS_MCP_PORT` |
| 5 | mindRoot 映射 | `config.mindRoot` → `MIND_ROOT` |
| 6 | authToken 映射 | `config.authToken` → `AUTH_TOKEN` |
| 7 | webPassword 映射 | `config.webPassword` → `WEB_PASSWORD` |
| 8 | 不覆盖已有 env | 若 `process.env.AUTH_TOKEN` 已存在，loadConfig 不覆盖 |
| 9 | config 不存在 | 不 throw，静默返回 |
| 10 | config JSON 损坏 | 不 throw，输出 warning |
| 11 | 幂等性 | 多次调用 loadConfig 只生效一次（模块级 `loaded` flag） |
| 12 | `getStartMode()` 默认值 | 无 config → `'start'` |
| 13 | `getStartMode()` daemon 映射 | `startMode: 'daemon'` → 返回 `'start'`（CLI 层用 --daemon flag） |
| 14 | `isDaemonMode()` | `startMode: 'daemon'` → true，否则 false |

**测试方法**：
- 在 `beforeEach` 创建临时 `~/.mindos/` 目录和 `config.json`
- Mock `CONFIG_PATH` 常量指向临时文件
- **关键**：`loadConfig()` 有模块级 `let loaded = false` 幂等锁，调用一次后后续调用跳过。每个测试必须 `vi.resetModules()` + `await import()` 重新加载模块，否则只有第一个测试能真正执行内部逻辑
- 每次测试前清空 `process.env` 中的 MindOS 相关变量（`MIND_ROOT`、`MINDOS_WEB_PORT`、`MINDOS_MCP_PORT`、`AUTH_TOKEN`、`WEB_PASSWORD`、`AI_PROVIDER`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_BASE_URL`）
- `afterEach` 恢复 env 和清理临时文件

### T2: `build.js` — 构建判断与依赖安装

**风险**：`needsBuild()` 判断错 → 每次启动重建浪费 3 分钟 / 不该跳过时跳过了；`ensureAppDeps()` 失败 → 启动崩溃
**测试文件**: `tests/unit/cli-build.test.ts`

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | 无 `.next` 目录 → 需要构建 | `needsBuild()` → true |
| 2 | `.next` 存在但无 stamp → 需要构建 | `needsBuild()` → true |
| 3 | stamp 版本匹配 → 不需要构建 | `needsBuild()` → false |
| 4 | stamp 版本不匹配 → 需要构建 | `needsBuild()` → true |
| 5 | `writeBuildStamp` 写入版本 | 写入后 `needsBuild()` → false |
| 6 | `cleanNextDir` 删除 `.next` | 调用后 `.next` 不存在 |
| 7 | `ensureAppDeps` npm 不可用 | mock `execSync` throw → 调用 `process.exit(1)` |
| 8 | `ensureAppDeps` 已安装且 hash 匹配 → 跳过 | 不调用 npm install |
| 9 | `ensureAppDeps` hash 不匹配 → 触发安装 | 调用 npm install |
| 10 | `verifyDeps` 检测关键依赖 | next/react/react-dom 缺失 → 重试安装 |

**测试方法**：
- 创建临时目录模拟 app/.next 结构
- Mock `ROOT` 和 `BUILD_STAMP` 指向临时路径
- Mock `execSync` 避免真实 npm install
- **关键**：`ensureAppDeps()` 内部调用 `process.exit(1)`，会杀掉 vitest 进程。必须 `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })`，测试里用 `expect(...).toThrow('exit')` 捕获

### T3: `port.js` — 端口检测

**风险**：误报占用 → 无法启动（已出过自回环 bug）；漏报 → 端口冲突 crash
**测试文件**: `tests/unit/cli-port.test.ts`

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | 空闲端口 → false | `isPortInUse(随机空闲端口)` → false |
| 2 | 占用端口 → true | 开 TCP server → `isPortInUse(该端口)` → true |
| 3 | server 关闭后 → false | 关闭 server → `isPortInUse` → false |

**测试方法**：
- 使用 `node:net` 的 `createServer` 创建真实 TCP server 进行集成式测试
- 用 `server.address().port` 获取系统分配的随机端口，避免端口冲突
- 原 spec 有 ECONNREFUSED 模拟和超时处理两个测试，砍掉：空闲端口测试已隐式覆盖 ECONNREFUSED；超时场景实现复杂且极少触发

### T4: `mcp-install.js` — MCP 配置写入逻辑

**风险**：配置写错 → Agent 连不上 MindOS
**测试文件**: `tests/unit/cli-mcp-install.test.ts`

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | stdio entry 格式正确 | `{ type: 'stdio', command: 'mindos', args: ['mcp'], env: { MCP_TRANSPORT: 'stdio' } }` |
| 2 | http entry 带 token | `{ url, headers: { Authorization: 'Bearer xxx' } }` |
| 3 | http entry 无 token | `{ url }` 无 headers |
| 4 | 写入新文件 | 不存在时创建，JSON 格式正确 |
| 5 | 合并已有配置 | 已有其他 mcpServers → mindos 追加不覆盖 |
| 6 | 覆盖已有 mindos 配置 | 已有旧 mindos entry → 更新不丢其他 |

**测试方法**：
- Entry 格式验证（测试 1-3）：在测试文件内复制 entry 构建逻辑做合约测试。`mcpInstall()` 是交互式 TUI 流程，entry 构建不单独 export，源码不改动所以无法直接 import。**承认这是合约测试**，与 `stop-restart.test.ts` 风格一致
- 配置文件合并（测试 4-6）：用临时文件做端到端验证 — 写入预设 JSON → 模拟合并逻辑 → 读回验证结果。这部分不需要 import 源码

### T5: CLI 冒烟测试

**风险**：任何 CLI 命令因 import 错误、依赖缺失而直接 crash
**测试文件**: `tests/unit/cli-smoke.test.ts`

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | `mindos --version` | 退出码 0，输出包含版本号 |
| 2 | `mindos --help` | 退出码 0，输出包含 "MindOS CLI" |
| 3 | `mindos doctor` 无 config | 退出码 1，输出包含 "onboard" |
| 4 | `mindos config show` 无 config | 退出码 1 |
| 5 | `mindos config validate` 无 config | 退出码 1 |
| 6 | `mindos sync` 无 config | 退出码 0，输出包含 "not configured" |
| 7 | `mindos nonexistent` | 退出码 1 |

**测试方法**：
- 使用 `execFileSync('node', ['bin/cli.js', ...args])` 在子进程中运行
- 设 `HOME` 到空临时目录确保无 config 干扰
- 验证退出码和 stdout/stderr 包含关键字

---

## 不做

| 模块 | 原因 |
|------|------|
| `gateway.js` | 平台强相关（systemd/launchd），mock 成本高且价值低 |
| `update-check.js` | 依赖 npm registry 网络调用，不影响核心功能 |
| `sync.js` | 已有 `__tests__/core/sync.test.ts`（15 个用例）+ `sync-status.test.ts`（17 个用例）覆盖 |
| `stop.js` | 已有 `tests/unit/stop-restart.test.ts` 覆盖核心逻辑（端口解析、进程清理合约） |
| `mcp-spawn.js` | 强依赖子进程 spawn + npm install，适合集成测试而非单测 |
| `startup.js` / `colors.js` / `debug.js` | 纯 UI 输出，无逻辑风险 |
| Setup wizard (`scripts/setup.js`) | 交互式 TUI，已有 `setup.test.ts` 覆盖 API 层 |

---

## 技术方案

### 测试框架

沿用现有 vitest 配置。`tests/unit/` 已在 `app/vitest.config.ts` 的 `include` 中：
```ts
include: ['__tests__/**/*.test.ts', '../tests/unit/**/*.test.ts'],
```

### 模块 Mock 策略

`bin/lib/` 模块是 ESM（`import/export`），但 `vitest.config.ts` 的 alias 只配了 `@` → `app/`。两种策略：

**方案 A（推荐）：提取纯逻辑 + 直接 import**
- `config.js` 的 `loadConfig` 直接 import，用临时文件 + 环境变量隔离
- `build.js` 的 `needsBuild` 等函数依赖 `ROOT` 常量 → 通过 `vi.mock` mock `constants.js`
- `port.js` 用真实 TCP server 测，无需 mock

**方案 B：子进程运行（仅冒烟测试）**
- `cli-smoke.test.ts` 用 `execFileSync` 在子进程跑完整 CLI
- 适合验证"不 crash"但无法验证内部状态

### 文件结构

```
tests/unit/
├── build-integrity.test.ts      # 已有
├── detect-system-lang.test.ts   # 已有
├── setup-needs-restart.test.ts  # 已有
├── stop-restart.test.ts         # 已有
├── cli-config.test.ts           # 新增 T1
├── cli-build.test.ts            # 新增 T2
├── cli-port.test.ts             # 新增 T3
├── cli-mcp-install.test.ts      # 新增 T4
└── cli-smoke.test.ts            # 新增 T5
```

---

## 验收标准

1. 新增 5 个测试文件，总计 ~40 个测试用例
2. 所有测试通过（`npm test`）
3. 覆盖 `loadConfig` env 映射的所有字段（新旧两种格式）
4. 覆盖 `needsBuild` 的 4 种状态判断
5. `isPortInUse` 在真实端口上的 true/false 两种结果都验证
6. MCP 配置写入的 3 种 entry 格式正确
7. CLI 7 个核心命令的冒烟测试通过

---

## 工作量估算

| 模块 | 用例数 | 预估 |
|------|-------|------|
| T1 cli-config | ~14 | 25min |
| T2 cli-build | ~10 | 20min |
| T3 cli-port | ~3 | 10min |
| T4 cli-mcp-install | ~6 | 15min |
| T5 cli-smoke | ~7 | 15min |
| **合计** | **~40** | **~85min** |

---

## 优先级排序

1. **T5 冒烟测试** — 最快出成果，立即验证"安装后 CLI 不 crash"
2. **T1 config 映射** — 影响面最广，映射错全链路断
3. **T3 port 检测** — 已出过自回环 bug，需要回归测试
4. **T2 build 判断** — 影响启动体验，误判导致 3 分钟浪费
5. **T4 mcp-install** — Agent 工具连接依赖此
