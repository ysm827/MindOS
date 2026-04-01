# Spec: Token 消耗优化

## 目标

将每次 Ask AI 请求的固定 token 开销从 ~17,000 降至 ~8,000，多轮对话累计节省 60-70%，核心手段是 SKILL.md 分层按需加载 + Tool Schema 分组注入 + Session 级上下文缓存。

---

## 现状分析

### 每次请求的固定 token 构成（实测）

| 来源 | 大小 | 估算 Token | 注入方式 |
|------|------|-----------|---------|
| SKILL.md（全文） | 18,033 bytes / 333行 | ~4,500 | `route.ts` 每次无条件注入 |
| System Prompt | ~2,400 bytes | ~600 | `AGENT_SYSTEM_PROMPT` 常量 |
| Bootstrap（README + INSTRUCTION） | 最多 20,000 chars | ~5,000 | `readKnowledgeFile()` |
| Tool Schema（20个工具定义） | 估计 ~8,000 chars | ~2,000 | `getRequestScopedTools()` 全量 |
| currentFile 上下文 | 最多 20,000 chars | ~5,000 | 按需，有文件时注入 |
| Thinking Budget | config 5,000 tokens | ~5,000 | `enableThinking` 开启时 |
| **合计（无文件、无历史）** | | **~12,100** | |
| **合计（有文件、有历史）** | | **~17,000+** | |

### 根本病灶

**SKILL.md 把完整"操作手册"无条件塞进每个请求**。333 行内容按实际使用频率拆解：

| 内容段 | 行数 | 每次需要？ |
|-------|------|----------|
| MindOS 概念介绍 | ~40 行 | 极少（模型已知） |
| Core Principles + Startup Protocol | ~25 行 | 仅 session 首次 |
| Dynamic Structure Rules | ~20 行 | 仅写操作时 |
| Pre-Write Checklist | ~15 行 | 仅写操作时 |
| Tool Selection Guide（工具速查）| ~35 行 | **每次都需要** |
| 20+ Execution Patterns 表格 | ~60 行 | 每次只触发 1-2 个 |
| SOP Template | ~30 行 | 仅"提炼 SOP"时 |
| Post-Task Hooks | ~50 行 | 任务完成后需要 |
| Fallback Rules / Safety / Quality Gates | ~30 行 | **每次都需要** |
| Preference Capture | ~30 行 | 仅首次偏好捕获时 |

**实际 60-70% 的请求只需要其中约 100 行核心内容。**

### 其余问题点

- `getRequestScopedTools()` 全量注册 20 个工具，大量 schema tokens 对只读查询是浪费
- 每轮请求完全无状态，bootstrap + SKILL.md 每轮重复注入，无法利用已有 session 状态
- `compactMessages()` 本身触发一次 LLM 调用消耗 input tokens，且分割点固定（最后6条），未考虑消息重要性
- `enableThinking` 默认关闭（`agentConfig.enableThinking ?? false`），但若开启则隐性新增 5,000 tokens budget

---

## 数据流 / 状态流

### 现有流程（route.ts POST handler）

```
POST /api/ask
  ↓
readAbsoluteFile(SKILL.md)          ← 18KB 全量读取（mtime 缓存 IO，但 tokens 不省）
readKnowledgeFile(INSTRUCTION.md)   ← 最多 20,000 chars
readKnowledgeFile(README.md)        ← 最多 20,000 chars
readKnowledgeFile(currentFile)      ← 最多 20,000 chars（有文件时）
getRequestScopedTools()             ← 20 个工具全量 schema
  ↓
systemPrompt = [
  AGENT_SYSTEM_PROMPT               ← ~600 tokens 常量
  mind_root=...
  SKILL.md 全文                     ← ~4,500 tokens
  INSTRUCTION.md                    ← 最多 5,000 tokens
  README.md                         ← 最多 5,000 tokens
  currentFile                       ← 最多 5,000 tokens
  uploadedFiles                     ← 最多 n × 5,000 tokens
]
  ↓
createAgentSession(tools, systemPrompt)
  ↓
每轮前 transformContext():
  truncateToolOutputs() → compactMessages() → hardPrune()
```

### 目标流程（优化后）

```
POST /api/ask
  ↓
[意图分类] detectIntent(messages[-1])
  → 'readonly' | 'write' | 'structural' | 'workflow'
  ↓
loadSkillTier(intent):
  'readonly'   → SKILL-core.md    (~1,000 tokens)
  'write'      → SKILL-core.md + SKILL-write.md  (~1,600 tokens)
  'structural' → SKILL-core.md + SKILL-write.md + SKILL-struct.md  (~2,200 tokens)
  'workflow'   → SKILL-core.md + SKILL-workflow.md  (~2,200 tokens)
  ↓
loadToolGroup(intent):
  'readonly'   → 5 个工具 (~500 tokens schema)
  'write'      → 10 个工具 (~1,000 tokens schema)
  'full'       → 20 个工具 (~2,000 tokens schema)
  ↓
checkSessionCache(sessionId):
  命中 → 跳过 SKILL.md 重注入，只注入 "[SKILL already loaded]" 1行
  未命中 → 完整注入，缓存 sessionId + hash
  ↓
systemPrompt 组装（精简版）
  ↓
transformContext() — Compact 改进：按 token 预算分割而非固定条数
```

**组件读写关系：**
- `route.ts` 读 SKILL.md → 写 systemPrompt → 写 AgentSession
- `context.ts` 读 messages → 写 compacted messages → 读写 SessionCache（新增）
- `tools.ts` 读 intent → 返回 tool subset（新增 loadToolGroup）
- 前端 → 传 sessionId（或由后端从消息 hash 生成）

---

## 方案

### Phase 1：SKILL.md 分层拆分（最高收益，最低风险）

将 `app/data/skills/mindos/SKILL.md`（333行）拆为 4 个文件：

```
app/data/skills/mindos/
├── SKILL.md           ← 入口（YAML frontmatter + 指向分层文件的说明，~10行）
├── SKILL-core.md      ← 核心精简版（~100行，~1,000 tokens）
├── SKILL-write.md     ← 写操作规则（~60行，~600 tokens）
├── SKILL-workflow.md  ← Execution Patterns + SOP模板（~120行，~1,200 tokens）
└── SKILL-hooks.md     ← Post-Task Hooks（~50行，~500 tokens）
```

**SKILL-core.md 包含：**
- Core Principles（5 条）
- Startup Protocol（简化为 3 步）
- Tool Selection Guide（工具速查表）
- Safety Rules
- Quality Gates
- Fallback Rules

**route.ts 修改**：
```typescript
// 意图检测（轻量关键词匹配，不调用 LLM）
function detectWriteIntent(message: string): 'readonly' | 'write' | 'workflow' {
  const msg = message.toLowerCase();
  if (/创建|新建|写入|更新|修改|删除|移动|重命名|create|write|update|delete|move|rename/.test(msg))
    return 'write';
  if (/sop|工作流|复盘|整理|组织|workflow|organize|retrospect/.test(msg))
    return 'workflow';
  return 'readonly';
}

// 只注入需要的 SKILL 段
const skillCore = readAbsoluteFile(SKILL_CORE_PATH);
const skillExtra = intent === 'write' ? readAbsoluteFile(SKILL_WRITE_PATH)
  : intent === 'workflow' ? readAbsoluteFile(SKILL_WORKFLOW_PATH) : null;
```

**中文版**同步拆分：`app/data/skills/mindos-zh/SKILL-core.md` 等。

### Phase 2：Tool Schema 分组注入

```typescript
// tools.ts 新增
export type ToolGroup = 'readonly' | 'write' | 'full';

const READONLY_TOOLS = ['search', 'list_files', 'read_file', 'get_recent', 'get_backlinks'];
const WRITE_TOOLS_LIST = [...READONLY_TOOLS, 'write_file', 'create_file', 'append_to_file',
  'insert_after_heading', 'update_section', 'delete_file'];
const FULL_TOOLS_LIST = [...WRITE_TOOLS_LIST, 'rename_file', 'move_file', 'create_space',
  'rename_space', 'get_history', 'get_file_at_version', 'append_csv', 'batch_create_files',
  'read_file_chunk', 'read_lines', 'insert_lines', 'update_lines', 'list_skills',
  'load_skill', 'list_mcp_tools', 'call_mcp_tool'];

export function getToolsByGroup(group: ToolGroup): AgentTool<any>[] { ... }
```

`route.ts` 根据 `detectWriteIntent()` 结果选 group：
- `readonly` → READONLY_TOOLS（~5 工具）
- `write` / `workflow` → WRITE_TOOLS_LIST（~10 工具）
- 首次 session / 结构性任务 → FULL_TOOLS_LIST

### Phase 3：Session-Level 上下文缓存

```typescript
// context.ts 新增
interface SessionCache {
  sessionHash: string;        // hash(messages[0].content) 作为 session 标识
  skillLoaded: boolean;
  skillTier: string;          // 已加载的 skill tier
  bootstrapHash: string;      // bootstrap 内容 hash，变化时刷新
  turnsCount: number;
  lastActivity: number;
}

const sessionCache = new Map<string, SessionCache>(); // 内存缓存，进程级别
const SESSION_BOOTSTRAP_REFRESH_TURNS = 8; // 每8轮刷新一次 bootstrap
const SESSION_TTL_MS = 30 * 60 * 1000;     // 30分钟 TTL
```

命中缓存时，SKILL.md 替换为 1 行：
```
[SKILL already loaded in this session. Tier: core+write. Core rules apply.]
```

### Phase 4：Compact 策略改进

**改进点 1**：按 token 预算保留最近消息，而非固定6条
```typescript
// context.ts compactMessages() 修改
const COMPACT_KEEP_BUDGET_TOKENS = 20_000;
let splitIdx = messages.length;
let keepTokens = 0;
while (splitIdx > 2) {
  const t = messageTokens(messages[splitIdx - 1]);
  if (keepTokens + t > COMPACT_KEEP_BUDGET_TOKENS) break;
  keepTokens += t;
  splitIdx--;
}
```

**改进点 2**：compact 前对 earlyMessages 二次激进压缩 toolResult（search/list → 100 chars，read_file → 300 chars），降低 summarizer 调用的 input tokens。

**改进点 3**（可选）：引入 `count_tokens` API 替代启发式估算，但增加一次 API round-trip，需权衡。

### Phase 5：Token 可见性（产品层）

`done` 事件扩展分解字段：
```typescript
{ type: 'done'; usage?: {
    input: number;
    output: number;
    breakdown?: {
      systemPrompt: number;
      skill: number;
      bootstrap: number;
      toolSchemas: number;
      history: number;
    };
  }
}
```

Settings 页增加"Token 消耗诊断"面板，显示最近一次请求的 breakdown。

---

## 影响范围

### 变更文件列表

| 文件 | 改动 |
|------|------|
| `app/data/skills/mindos/SKILL.md` | 拆分为 SKILL-core/write/workflow/hooks.md |
| `app/data/skills/mindos-zh/SKILL.md` | 同上，中文版 |
| `app/app/api/ask/route.ts` | 添加 `detectWriteIntent()`，按 tier 加载 SKILL |
| `app/lib/agent/tools.ts` | 添加 `getToolsByGroup()`，按 group 返回工具子集 |
| `app/lib/agent/context.ts` | 添加 `SessionCache`，改进 compact 分割点逻辑 |
| `app/lib/agent/prompt.ts` | 无变更（AGENT_SYSTEM_PROMPT 已精简，保持不动）|

### 受影响模块

- **`/api/ask` POST handler**：核心改动集中于此，其他 API 不受影响
- **前端 ChatPanel**：`done` 事件新增 `breakdown` 字段，前端可选消费（不消费也不 break）
- **测试**：`app/__tests__/core/context.test.ts` 需补充 SessionCache 测试用例

### 破坏性变更

- SKILL.md 文件路径拆分：若有外部工具直接读 `app/data/skills/mindos/SKILL.md`（如 CLI `npx skills install`），需确认兼容性
- Tool group 分组后，`readonly` 模式下某些工具不可用，极少数情况下 Agent 可能在第一步调用失败后需要改用 full mode（Fallback 可降级）

---

## 边界 Case 与风险

1. **意图误判（最大风险）**：用户说"查一下X"实际需要写操作 → 只注入了 readonly tools → Agent 报 tool not found
   - **Mitigation**：`detectWriteIntent()` 保守设计，宁可误判为 write 也不误判为 readonly；提供 fallback：工具不存在时返回 `"Request full tool access by asking user to rephrase"` + 自动升级本次 session 为 full mode

2. **SessionCache 内存泄漏**：长期运行服务器，大量 session 不清理
   - **Mitigation**：TTL 30分钟 + Map 大小上限 500 条，超出 LRU 淘汰

3. **SKILL.md 拆分后维护成本上升**：改一个规则可能需要改多个文件
   - **Mitigation**：`SKILL-core.md` 作为唯一入口维护核心规则；拆分文件添加注释 `<!-- depends on SKILL-core.md -->`

4. **Compact 分割点改为 token 预算后，小消息场景保留条数增多**：极端情况（全是单字消息）可能保留过多历史
   - **Mitigation**：加上条数兜底：`max(6, tokenBudgetResult)`

5. **bootstrap hash 检测误报**：文件内容变化但 hash 未刷新（如 hash 冲突）
   - **Mitigation**：用 content 长度 + 前200字符的轻量指纹，冲突概率极低

6. **中文版 SKILL-zh 拆分滞后**：Phase 1 先拆英文版，中文版如未同步可能出现中文用户仍加载老版
   - **Mitigation**：Phase 1 必须同步拆分两个版本，或临时保留中文版全量加载

---

## 验收标准

### Phase 1（SKILL.md 分层）
- [ ] `SKILL-core.md` 行数 ≤ 110 行，Token 估算 ≤ 1,200
- [ ] `readonly` 意图请求（如"搜索XX笔记"）不注入 SKILL-write.md 和 SKILL-workflow.md
- [ ] `write` 意图请求（如"更新XX文件"）正确注入 SKILL-core.md + SKILL-write.md
- [ ] 中英文版均已拆分
- [ ] `npx vitest run` 全部通过

### Phase 2（Tool Schema 分组）
- [ ] `readonly` 模式下工具数量 ≤ 7 个
- [ ] `write` 模式下工具数量 ≤ 12 个
- [ ] Agent 在 readonly 模式下调用不存在的写工具时，返回有意义的错误信息，不崩溃
- [ ] `npx vitest run` 全部通过

### Phase 3（Session Cache）
- [ ] 同一对话第2轮起，systemPrompt 中 SKILL.md 内容替换为1行标记
- [ ] 30分钟无活动后缓存自动清理
- [ ] 服务重启后缓存正确重建（不复用旧缓存）

### Phase 4（Compact 改进）
- [ ] 相同消息条数下，新 compact 策略保留的 token 量误差 ≤ 10%（对比 token budget 目标）
- [ ] compact 前 earlyMessages 的 toolResult 已二次压缩
- [ ] hard prune 触发次数在测试用例中 ≥ compact 策略改进前减少50%（长对话场景）

### 整体
- [ ] 端到端测试：一次全新"搜索笔记"请求，systemPrompt token 估算 ≤ 8,000
- [ ] 端到端测试：一次"更新笔记"请求，systemPrompt token 估算 ≤ 10,000
- [ ] `done` 事件中 `usage.breakdown` 字段存在且各项之和与 `input` 一致（误差 ≤ 5%）
