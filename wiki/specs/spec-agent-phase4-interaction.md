# SPEC: Agent Phase 4 — 高级交互

> Thinking 显示 + Agent 配置 UI + 流式 Markdown 优化

## 动机

Phase 1-3 解决了功能和可靠性问题。Phase 4 提升交互体验：
- Anthropic 模型支持 extended thinking，但当前不显示推理过程
- Agent 参数（maxSteps、approvalMode）硬编码或仅在 footer 微调，缺少统一配置
- 长回复的 Markdown 渲染在拼接完才显示，有卡顿感

## 设计决策

| 决策 | 选项 | 结论 |
|------|------|------|
| Thinking 启用 | 始终启用 vs 用户配置 | **用户配置**（默认关）。Extended thinking 消耗更多 token 且增加延迟 |
| Thinking 显示 | inline 展开 vs 可折叠 `<details>` | **可折叠**。默认收起，点击展开。不干扰主回复 |
| Agent 配置位置 | Settings 独立 Tab vs AI Tab 子区域 | **AI Tab 子区域**。在现有 API Key 配置下方新增 "Agent Behavior" 区 |
| 配置持久化 | localStorage vs 服务端 settings.json | **服务端 settings.json**（与 API Key 等配置同源） |
| Human-in-the-loop | 假确认（tool 已执行） vs 真 pre-execution approval vs 仅视觉警告 | **仅视觉警告**。假确认比没有更糟（虚假安全感）。真 pre-execution 需要 `addToolResult` 模式（复杂度高），标记为 v2。Phase 4 只做视觉区分：破坏性 tool call 用警告色渲染 |

## 变更范围

### 4a. Thinking / Reasoning 显示

**后端**：
- `route.ts`：当 provider 为 Anthropic 且用户开启 thinking 时，添加 `providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: N } } }`
- `stream-consumer.ts`：处理 `reasoning-start` / `reasoning-delta` / `reasoning-end` chunks

**前端**：
- 新文件 `app/components/ask/ThinkingBlock.tsx`：可折叠的 thinking 渲染
- `types.ts`：新增 `ReasoningPart { type: 'reasoning'; text: string }`
- `MessageList.tsx`：在 text parts 之前渲染 ThinkingBlock

### 4b. Agent 配置 UI

新增配置项（存入 settings.json）：

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `agent.maxSteps` | number | 20 | 每次请求最大工具调用步数 |
| `agent.enableThinking` | boolean | false | 启用 extended thinking（仅 Anthropic） |
| `agent.thinkingBudget` | number | 5000 | thinking token 预算 |
| `agent.contextStrategy` | enum | 'auto' | 'auto'（自动 compact）/ 'off' |

**文件变更**：
- `app/components/settings/AiTab.tsx`：新增 "Agent Behavior" 表单区
- `app/app/api/ask/route.ts`：读取 settings 中的 agent 配置
- `app/components/AskModal.tsx`：maxSteps 从 settings 读取，移除 footer 的 `<select>`

### 4c. 破坏性操作视觉警告

`ToolCallBlock.tsx` 增强：
- 当 `toolName` 为 `delete_file` / `move_file` / `write_file` 时，渲染用 `border-warning` / `bg-warning/10` 样式区分
- 在 tool call 标题行前加 ⚠️ 图标
- 不加 Approve/Reject 按钮（tool 在后端已执行，假确认比没有更糟）

**真正的 pre-execution approval**（需要 AI SDK 的 `toolCallStreaming` + `addToolResult` 模式）复杂度高，标记为 v2。

### 4d. 流式 Markdown 优化

当前 `ReactMarkdown` 在每次 `parts` 更新时重新解析整个文本。优化方向：

- 短回复（< 2000 chars）：保持现有 `ReactMarkdown`，无需优化
- 长回复（> 2000 chars）：debounce markdown 渲染（100ms），中间帧显示 raw text
- 替代方案：评估 `react-markdown` 的 `rehype-raw` 是否支持增量渲染

**优先级低**，如果 Phase 1-3 完成后实际使用中卡顿不明显，可跳过。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/components/ask/ThinkingBlock.tsx` | **新建** | 可折叠 thinking 渲染 |
| `app/lib/agent/stream-consumer.ts` | 修改 | 解析 reasoning-* chunks |
| `app/lib/types.ts` | 修改 | 新增 ReasoningPart |
| `app/components/ask/MessageList.tsx` | 修改 | 渲染 ThinkingBlock |
| `app/components/ask/ToolCallBlock.tsx` | 修改 | 破坏性操作视觉警告样式 |
| `app/components/AskModal.tsx` | 修改 | maxSteps 从 settings 读取 |
| `app/app/api/ask/route.ts` | 修改 | 读 agent settings + thinking providerOptions |
| `app/components/settings/AiTab.tsx` | 修改 | 新增 Agent Behavior 配置区 |

## 不做的事

- **真正的 pre-execution tool approval**（需要 `addToolResult` 模式）：标记为 v2
- **假确认 UI（Approve/Reject 按钮但 tool 已执行）**：比没有更差，产生虚假安全感
- **token 使用量 UI 展示**：低优先，可后续加
- **多模型切换 per-session**：超出 Agent 增强范围

## 验收标准

- [ ] Anthropic 模型开启 thinking 后，推理过程显示为可折叠区块
- [ ] Settings AI Tab 可配置 maxSteps、thinking、contextStrategy
- [ ] 配置保存后立即生效（下次请求使用新配置）
- [ ] 破坏性 tool call（delete/move/write）显示警告色样式 + ⚠️ 图标
- [ ] 长回复渲染流畅，无明显卡顿（主观评估）
- [ ] `tsc --noEmit` 通过
