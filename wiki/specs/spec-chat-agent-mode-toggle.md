# Spec: Chat / Agent 模式切换

## 目标

在 Ask AI 中增加 Chat / Agent 双模式切换，让用户在不需要写操作的场景下使用轻量级的 Chat 模式（只读工具 + 轻 prompt），大幅节省 token 消耗（预计减少 ~80% 系统开销）。

## 现状分析

当前每次 Ask AI 请求都走同一条重型管道：

| 组件 | 估算 tokens | Chat 模式 | Agent 模式 |
|------|------------|----------|-----------|
| System prompt | ~600 | ~250（轻量版） | ~600（完整版） |
| SKILL.md + write-supplement.md | ~2500 | ❌ 跳过 | ✅ 加载 |
| Bootstrap context (INSTRUCTION/README/CONFIG) | ~1500 | ❌ 跳过 | ✅ 加载 |
| Tool definitions | ~5000 (25+ 工具) | ~1600 (8 只读工具) | ~5000 (25+ 工具) |
| Current file / @ 提及 / 上传文件 | 变化 | ✅ 保留 | ✅ 保留 |
| **系统开销合计** | | **~1850** | **~9600** |

即使用户只是问一句"帮我翻译这段话"，也要加载完整工具链和知识库上下文，浪费 token 且增加延迟。

已有的 `organize` 模式证明了管道分流是可行的（更少的工具 + 更轻的 prompt），但目前用户无法主动控制。

### 行业对标

| 产品 | Chat/Ask 模式 | Agent 模式 | 切换方式 |
|------|-------------|-----------|---------|
| Cursor 3.0 | Ask：只读搜索工具 | Agent：完整读写+终端 | `Cmd+.` |
| GitHub Copilot | Ask：零工具 | Agent：完整+MCP | Chat 底部 dropdown |
| Windsurf | Chat：只读分析 | Cascade：完整读写+终端 | 模式选择 |

**MindOS 采用 Cursor 风格**：Chat 模式保留只读工具（搜索/读取/浏览），Agent 模式保留完整工具链。

## 数据流 / 状态流

```
┌─ 前端 AskContent ─────────────────────────────────────────┐
│                                                            │
│  [mode state: 'chat' | 'agent']  ← ModeCapsule 切换       │
│         │                                                  │
│    handleSubmit()                                          │
│         │                                                  │
│    POST /api/ask  { mode: 'chat'|'agent', messages, ... } │
│         │                                                  │
└─────────┼──────────────────────────────────────────────────┘
          │
          ▼
┌─ 后端 route.ts ──────────────────────────────────────────┐
│                                                           │
│  mode === 'chat'?                                         │
│    ├─ YES → CHAT_SYSTEM_PROMPT (轻量，~250 tok)           │
│    │        + 当前文件 / 上传文件 / @ 提及文件（仍注入）    │
│    │        + tools = getChatTools() (8 只读工具)          │
│    │        + 跳过: SKILL.md, bootstrap, loop detection    │
│    │                                                      │
│    └─ NO  → AGENT_SYSTEM_PROMPT (完整，~600 tok)          │
│             + SKILL.md + bootstrap + 所有 25+ 工具         │
│             + loop detection + step limit                  │
│                                                           │
│  → createAgentSession({ customTools })                    │
│  → session.prompt() → SSE stream → 前端                   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**写数据的组件：**
- `AskContent.tsx`：写 mode state、写 session 历史
- `route.ts`：根据 mode 构建 prompt 和 tools

**读数据的组件：**
- `AskContent.tsx`：读 mode state 显示 UI
- `ModeCapsule.tsx`（新）：读/写 mode state
- `stream-consumer.ts`：不受 mode 影响（SSE 协议不变）

## 方案对比

### 方案 A：Per-session Mode Toggle（推荐）

在 AskContent 输入区增加 Chat/Agent 模式切换胶囊，模式绑定到当前会话，可随时切换。

```
┌─ Ask Panel / Modal ─────────────────────────────┐
│  ┌─────────────────────────────────────────────┐ │
│  │  对话消息列表                                │ │
│  │  ...                                        │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ┌───────────────────┐                       │ │
│  │ │ (●) Chat │ Agent  │ ← 模式切换胶囊        │ │
│  │ └───────────────────┘                       │ │
│  │ [___输入框___________________________] [➤]  │ │
│  │  @ 文件  📎 附件  🖼 图片                    │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- 用户体验质量：⭐⭐⭐⭐⭐ — 直觉清晰，随时切换
- 实现复杂度：低 — mode 作为 state 传到后端，后端已有 mode 分流逻辑
- 可维护性：高 — 新增一个 prompt 变体 + 一个 UI 组件
- 风险：低

### 方案 B：Per-message Mode（每条消息独立模式）

每条消息独立选择 Chat 或 Agent 模式，更灵活但更复杂。

```
┌─ Ask Panel / Modal ──────────────────────────────┐
│  [User] 帮我翻译这段话        [Chat 💬]          │
│  [AI] Here's the translation...                  │
│  [User] 把结果保存到 notes/   [Agent 🤖]         │
│  [AI] ✓ 已保存到 notes/translation.md            │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ [___输入框___________________________] [➤]  │ │
│  │  模式: [Chat 💬 ▼]  @ 文件  📎 附件         │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- 用户体验质量：⭐⭐⭐⭐ — 灵活但认知负担更大
- 实现复杂度：中 — 需要在消息历史中记录每条消息的模式，后端需处理混合模式
- 可维护性：中 — 消息类型扩展，历史回放需考虑模式
- 风险：中 — 混合模式的上下文管理可能引入 edge case

### 方案 C：智能自动检测

LLM 先不带工具做一次轻量判断，如果需要工具再自动升级。

- 用户体验质量：⭐⭐⭐ — 用户无感但可能误判
- 实现复杂度：高 — 需要两次 LLM 调用（预判断 + 实际执行）
- 可维护性：低 — 预判断的 prompt 难以维护
- 风险：高 — 误判导致用户期望和实际行为不符

### 选择：方案 A

理由：
1. **UX 最清晰**：用户明确知道当前处于什么模式，不存在"AI 猜错了"的问题
2. **实现最简**：已有 organize mode 作为先例，扩展为三模式分流是自然延伸
3. **符合行业惯例**：Claude、ChatGPT、Cursor 都采用了类似的 per-session 模式选择

方案 B 被排除因为：per-message 增加了认知负担，且混合模式的上下文管理复杂（Agent 消息有 tool 结果，Chat 消息没有，后续 Agent 消息需要理解前面 Chat 消息丢失的上下文）。

方案 C 被排除因为：两次 LLM 调用反而可能更贵；且误判带来的 UX 不可控——用户说"帮我搜一下 XXX"，AI 可能判定为 Chat 不需要工具，实际需要 search 工具。

## 方案

### 1. 新增 Chat 系统提示词 (prompt.ts)

```typescript
export const CHAT_SYSTEM_PROMPT = `You are MindOS Agent — the operator of the user's second brain.

Persona: Methodical, strictly objective, execution-oriented. Zero fluff.

## Mode: Chat (Read-Only)

You are in Chat mode. You can **read and search** the knowledge base, but you **cannot create, edit, or delete** any files. If the user asks you to modify files, politely suggest switching to Agent mode.

## Core Directives

1. **Anti-Hallucination**: Strictly separate your training data from the user's local knowledge. If asked about the user's notes, rely EXCLUSIVELY on tool outputs. If a search yields nothing, state "Not found in knowledge base."
2. **Cite Sources**: Always include the exact file path when answering from local knowledge.
3. **Language Alignment**: Match the user's language when replying.

## Output

- Reply in the user's language.
- Use clean Markdown (tables, lists, bold).`;
```

~250 tokens vs Agent 的 ~600 tokens。保留了 Anti-Hallucination 和 Cite Sources 指令（因为 Chat 模式有只读工具，需要这些约束）。

### 2. Chat 只读工具集 (tools.ts)

```typescript
const CHAT_TOOL_NAMES = new Set([
  'list_files',       // 浏览知识库结构
  'read_file',        // 读取文件内容
  'read_file_chunk',  // 读取文件片段
  'search',           // 搜索知识库
  'get_recent',       // 最近修改的文件
  'get_backlinks',    // 反向链接
  'web_search',       // Web 搜索
  'web_fetch',        // 获取网页内容
]);

export function getChatTools(): AgentTool<any>[] {
  return knowledgeBaseTools.filter(t => CHAT_TOOL_NAMES.has(t.name));
}
```

8 个只读工具 × ~200 tokens/tool = ~1600 tokens（vs Agent 的 25+ 工具 ~5000 tokens）。

### 3. 后端 mode 分流 (route.ts)

扩展 `mode` 参数为 `'chat' | 'agent' | 'organize'`：

```
mode === 'chat':
  - systemPrompt = CHAT_SYSTEM_PROMPT + timeContext + currentFile + attachedFiles + uploadedFiles
  - tools = getChatTools() (8 只读工具)
  - 跳过: SKILL.md, write-supplement.md, bootstrap context
  - loop detection: 保留（只读工具也可能循环）
  - step limit: 降低（默认 10，Agent 默认 20）

mode === 'agent':
  - (现有行为不变)

mode === 'organize':
  - (现有行为不变)
```

### 4. 前端 ModeCapsule 组件 (AskContent.tsx)

在输入区的输入框上方增加模式切换胶囊：

```
┌──────────────────────────────────────────────────┐
│  ┌─────────────────────────┐                     │
│  │ 💬 Chat  │  🤖 Agent   │  ← pill toggle      │
│  │ ████████    ░░░░░░░░░░  │     (active = 填充) │
│  └─────────────────────────┘                     │
│                                                  │
│  [___输入消息...____________________________] [➤]│
│                                                  │
│  📎 附件  🖼 图片  @ 文件                        │
│  ──────────────────────────────────────────────  │
│  💡 Chat: 可搜索/阅读知识库，不可修改 · 省 token  │
└──────────────────────────────────────────────────┘
```

**交互细节：**
- 默认模式：Agent（向后兼容）
- 模式偏好持久化到 localStorage（`mindos-ask-mode`）
- 切换时无需确认（即时生效，下一条消息起使用新模式）
- 历史消息不受影响（已发送的消息保持原样）
- 在 Chat 模式下 `/` 斜杠命令和 MCP Agent 选择器不可用（隐藏或禁用）

### 5. Token 节省效果

| 场景 | Agent 模式 | Chat 模式 | 节省 |
|------|-----------|-----------|------|
| 单次请求系统开销 | ~9600 tokens | ~1850 tokens | **81%** |
| 10 轮对话总开销 | ~96K tokens | ~18.5K tokens | **81%** |
| 混合使用 (5 Chat + 5 Agent) | ~96K tokens | ~57K tokens | **41%** |

### 6. 模式能力对比

| 能力 | Chat 模式 | Agent 模式 |
|------|----------|-----------|
| 纯文本对话 | ✅ | ✅ |
| 查看当前文件上下文 | ✅ | ✅ |
| @ 提及文件内容 | ✅ | ✅ |
| 上传文件内容 | ✅ | ✅ |
| 图片理解 | ✅ | ✅ |
| Extended Thinking | ✅ | ✅ |
| 搜索知识库 | ✅ (search) | ✅ |
| 读取文件 | ✅ (read_file) | ✅ |
| 浏览文件树 | ✅ (list_files) | ✅ |
| 最近文件 | ✅ (get_recent) | ✅ |
| 反向链接 | ✅ (get_backlinks) | ✅ |
| Web 搜索/抓取 | ✅ (web_search/fetch) | ✅ |
| 创建/编辑/删除文件 | ❌ | ✅ |
| MCP 工具调用 | ❌ | ✅ |
| A2A/ACP Agent | ❌ | ✅ |
| Skill 加载 | ❌ | ✅ |
| / 斜杠命令 | ❌ | ✅ |
| Git 历史查看 | ❌ | ✅ |

## 影响范围

### 变更文件列表

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/lib/agent/prompt.ts` | 修改 | 添加 `CHAT_SYSTEM_PROMPT` |
| `app/lib/agent/tools.ts` | 修改 | 添加 `CHAT_TOOL_NAMES` + `getChatTools()` |
| `app/app/api/ask/route.ts` | 修改 | mode 三路分流逻辑 |
| `app/components/ask/AskContent.tsx` | 修改 | 添加 mode state + ModeCapsule 引用 |
| `app/components/ask/ModeCapsule.tsx` | 新增 | 模式切换 UI 组件 |
| `app/lib/i18n/modules/ai-chat.ts` | 修改 | 新增 i18n 键 |
| `app/lib/types.ts` | 修改 | 扩展 mode 类型定义 |

### 受影响但不改的模块

- `stream-consumer.ts`：SSE 协议不变，Chat 模式仍会收到只读工具的 tool_start/tool_end 事件
- `useAskSession.ts`：session 存储不变，mode 不影响 session 结构
- `MessageList.tsx`：渲染逻辑不变，Chat 模式消息可能包含只读 tool 的 parts
- `useAcpDetection.ts`：不变，但 Chat 模式下 ACP agent 选择器隐藏
- `useMention.ts`：不变，@ 提及仍可用
- `useSlashCommand.ts`：不变，但 Chat 模式下禁用
- Settings AI tab：不变，mode 是 per-session 设置不是全局 AI 配置

### 无破坏性变更

现有 `mode: 'organize'` 和默认（无 mode）行为完全不变。

## 边界 case 与风险

### 边界 case

1. **Chat 模式下用户要求写操作**
   - 处理：AI 只有只读工具，无法执行写操作。回复"请切换到 Agent 模式来创建/修改文件"
   - prompt 中已包含此指令
   - 即使 LLM 尝试调用 `write_file`，工具不存在，pi-agent-core 会报 tool not found

2. **mid-session 切换 Agent → Chat**
   - 处理：之前的写操作 tool 结果仍在对话历史中，Chat 模式只加载只读工具
   - 风险：LLM 可能尝试引用之前写操作的结果（合理），但不能执行新的写操作
   - 决策：允许，不清除历史

3. **mid-session 切换 Chat → Agent**
   - 处理：工具变为完整版，系统提示变为完整版
   - 风险：之前 Chat 模式的对话可能缺少 SKILL.md 上下文
   - 决策：允许，Agent 模式会自动加载完整上下文

4. **新建会话时记住上次模式**
   - 处理：localStorage 持久化
   - 风险：用户可能忘记自己上次选了 Chat 模式
   - 决策：输入区始终显示当前模式 + hint 文字

5. **初始消息来自外部（Discover 面板、AskFab、AI Organize）**
   - 处理：这些入口总是需要 Agent 模式（需要写操作）
   - 决策：`initialMessage` 存在时强制 Agent 模式

6. **ACP Agent 选择器 + Chat 模式**
   - 处理：Chat 模式下隐藏 ACP Agent 选择器（ACP 需要完整工具）
   - 风险：无

7. **organize 模式的优先级**
   - 处理：organize 是内部模式（不由用户选择），优先于用户的 Chat/Agent 选择
   - 决策：前端仅展示 Chat/Agent 两个选项，organize 仍由内部逻辑触发

8. **Chat 模式下搜索结果包含需要修改的文件**
   - 处理：AI 可以搜索和读取，告诉用户内容是什么，但不能修改
   - 决策：这是正确行为——"看但不动"

### 风险

1. **用户困惑**：不清楚 Chat 能做什么不能做什么
   - Mitigation：hint 文字明确说"可搜索/阅读，不可修改"；AI 遇到写请求时主动建议切换

2. **默认模式选择**：新用户可能浪费 token 因为默认是 Agent
   - Mitigation：保持 Agent 默认（向后兼容），Help 页面说明模式区别

3. **prompt 注入**：Chat 模式 prompt 更短，是否更容易被注入？
   - Mitigation：Chat 模式只有只读工具，即使被注入也无法执行破坏性操作（最坏情况是读取文件内容）

4. **只读工具仍消耗 token**：搜索/读取结果会占用 context
   - Mitigation：step limit 降低为 10（Agent 为 20），减少工具调用轮次

## 验收标准

- [ ] Chat 模式下后端不加载 SKILL.md、write-supplement.md、bootstrap context
- [ ] Chat 模式下只注册 8 个只读工具（list_files/read_file/read_file_chunk/search/get_recent/get_backlinks/web_search/web_fetch）
- [ ] Chat 模式下 AI 可以搜索和读取文件（tool_start/tool_end 事件正常）
- [ ] Chat 模式下 AI 无法调用任何写操作工具
- [ ] Chat 模式下当前文件内容、@ 提及文件、上传文件仍可被 AI 引用
- [ ] Agent 模式行为与现有完全一致（无回归）
- [ ] 模式切换胶囊 UI 正确显示当前模式
- [ ] 模式偏好通过 localStorage 持久化，刷新后保留
- [ ] mid-session 切换模式后，后续消息使用新模式
- [ ] Chat 模式下 / 斜杠命令不可用（隐藏）
- [ ] Chat 模式下 ACP Agent 选择器隐藏
- [ ] initialMessage 存在时强制 Agent 模式
- [ ] i18n 键覆盖 EN + ZH
- [ ] 单元测试覆盖：mode 分流逻辑（chat/agent/organize）、getChatTools 返回正确工具集、CHAT_SYSTEM_PROMPT 不包含写操作指令
