# Spec: Save Session — 会话保存与 AI 消化

> **状态**：✅ **MVP 实现完成** (2026-04-10)
> **相关代码**：`app/components/ask/SaveSessionPopover.tsx`, `app/lib/ask/save-session.ts`

## 目标

允许用户将整个 AI 对话会话（或单条消息）保存到知识库，并通过 AI 自动总结与消化，转化为有结构的笔记。避免手动复制粘贴，一键将讨论转为可索引的知识资产。

## 现状分析

### 当前问题
- 用户与 Agent 的有价值讨论仅存在于会话历史中
- 没有简便方式将讨论转为知识库笔记
- 长对话无法快速转为摘要、决策记录或学习笔记
- 单条消息保存与整个会话保存逻辑分散

### 用户期望
1. **一键保存会话** — 点击按钮 → 选择目标目录 → 自动生成笔记
2. **AI 消化** — 由 Agent 总结、提炼关键点、生成结构化输出
3. **灵活保存模式** — 保存整个会话、或仅选定范围
4. **预览确认** — 保存前可预览 AI 生成的内容
5. **多目录支持** — 保存到不同的知识空间

## 数据流 / 状态流

```
用户在对话中
    │
    └─ 点击 [⬆️ Save Session] 按钮
        │
        ├─────────────────────────────────────────────────┐
        │ 弹出窗口：选择保存模式                          │
        ├─────────────────────────────────────────────────┤
        │                                                  │
        │ ├─ [Save full session]  ───────┐              │
        │ ├─ [Archive & digest]   ───────┤              │
        │ └─ [Organize to note]   ───────┤              │
        │                                 │              │
        │ 模式 1: Save Session (新)        │              │
        │   │ 整个对话 → JSON → 存入知识库 │              │
        │   │ 自动生成时间戳 Markdown     │              │
        │   └─ 用于完整回溯                │              │
        │                                 │              │
        │ 模式 2: Archive & Digest (新)    │              │
        │   │ 整个对话 → LLM 总结 → Markdown │           │
        │   │ 提炼关键点、决策、行动项      │              │
        │   └─ 用于沉淀经验                │              │
        │                                 │              │
        │ 模式 3: Organize to Note (既有)  │              │
        │   │ 整个对话 → LLM 转为结构化笔记 │              │
        │   │ 标题、章节、要点              │              │
        │   └─ 用于创作文章                │              │
        │                                 │              │
        └─────────────────────────────────────────────────┘
            │
            └─ 显示 DirPicker
                │
                ├─ 选择目标目录
                │   ↓
                ├─ 输入文件名（可选，默认自动生成）
                │   ↓
                └─ 点击 [Preview] 或 [Save]
                    │
                    ├──────────────────────────────────────┐
                    │ 根据模式调用不同 API                │
                    ├──────────────────────────────────────┤
                    │                                      │
                    │ POST /api/ask/save-session          │
                    │ {                                   │
                    │   sessionId: string,                │
                    │   mode: 'full' | 'digest' | 'org',│
                    │   targetDir: string,                │
                    │   filename?: string,                │
                    │   preview?: true                    │
                    │ }                                   │
                    │                                      │
                    │ ↓ 返回                              │
                    │ {                                   │
                    │   success: true,                    │
                    │   filepath: "path/to/note.md",      │
                    │   content?: string,  // 预览时返回  │
                    │   metadata: {                       │
                    │     wordCount: 1250,               │
                    │     keyPoints: 3,                   │
                    │     timeSpent: "15m"               │
                    │   }                                 │
                    │ }                                   │
                    │                                      │
                    └──────────────────────────────────────┘
```

## 方案

### 保存模式

#### 模式 1: Save Full Session
```markdown
# Session: <title>
**Date**: 2026-04-10 14:23  
**Duration**: 15 minutes  
**Platform**: MindOS Ask  

---

## Conversation

**User**: <first message>
**Agent**: <response>
...

## Metadata
- Messages: 8
- Tokens used: ~2,500
- Model: Claude 3.5 Sonnet
```

**用途**：完整回溯、审计日志、重要讨论的永久备份

#### 模式 2: Archive & Digest
```markdown
# Session Digest: <AI生成的标题>
**Date**: 2026-04-10  
**Source**: MindOS Ask Session  

## Key Points
- <point 1>
- <point 2>
- <point 3>

## Summary
<LLM 生成的摘要段落>

## Decisions Made
- [ ] <Decision 1>
- [ ] <Decision 2>

## Next Steps
- [ ] <Action 1>
- [ ] <Action 2>

## Original Session
[Link to full session if saved separately]
```

**用途**：知识沉淀、经验总结、决策记录

#### 模式 3: Organize to Note
```markdown
# <AI 生成的标题>

## Introduction
<Context>

## Main Insights

### Subtopic 1
<Content>

### Subtopic 2
<Content>

## Conclusion
<Summary>

---
*Generated from Ask Session on 2026-04-10*
```

**用途**：文章创作、知识库补充、可发布内容

### UI 组件

**SaveSessionInline** (组件文件)
- 触发：Ask Panel 底部 [⬆️ Save Session] 按钮
- 内部包含 `SaveSessionPopover` 组件（从 inline ref 弹出）
- 内容：
  - 模式选择（3 个 pill/tab）
  - DirPicker（选择目标目录）
  - 文件名输入（可选）
  - Preview 按钮（显示生成内容预览）
  - Save 按钮（确认保存）
  - 加载状态指示（生成中...）

**集成设计**：
- 单条消息保存：右键菜单 → "Save to note"
- 全会话保存：Ask Panel 底部按钮
- **统一 UI**：两个都用同一个 SaveSessionPopover（参数不同）

### API 路由

**`POST /api/ask/save-session`**

```typescript
Request:
{
  sessionId: string;           // 会话 ID
  mode: 'full' | 'digest' | 'organize';  // 保存模式
  targetDir: string;           // 目标目录（相对 MIND_ROOT）
  filename?: string;           // 可选文件名，默认自动生成
  preview?: boolean;           // 仅返回预览，不保存
  messageRange?: [start, end]; // 可选：仅保存部分消息
}

Response (preview mode):
{
  success: true,
  content: string,             // 生成的 Markdown
  metadata: {
    wordCount: number,
    keyPoints: number,
    estimatedReadTime: string
  }
}

Response (save mode):
{
  success: true,
  filepath: string,            // 相对 MIND_ROOT 的路径
  metadata: {
    size: number,
    encoding: 'utf-8',
    created: timestamp
  }
}
```

### LLM 提示

**模式 2 & 3 触发 LLM 调用**（模式 1 无需 LLM）

```
系统提示 (模式 2 - 消化):
你是一个知识管理助手。用户要求将以下对话会话转为简洁的摘要。
请：
1. 提取 3-5 个核心要点
2. 识别任何明确的决策或行动项
3. 生成 200-300 字的摘要
4. 使用 Markdown 格式

系统提示 (模式 3 - 组织):
你是一个编辑。将以下对话转为一篇结构清晰的笔记。
请：
1. 为整个讨论创建合适的标题
2. 将内容组织为逻辑清晰的章节（3-5 个）
3. 添加介绍和总结
4. 保持原始讨论中的关键细节
5. 生成可发布的内容（1,000-2,000 字）
6. 使用 Markdown 标题和格式化
```

## 影响范围

**变更文件**：
- `app/components/ask/SaveSessionPopover.tsx` (新) — UI 弹窗
- `app/lib/ask/save-session.ts` (新) — 业务逻辑
- `app/app/api/ask/save-session/route.ts` (新) — API 路由
- `app/components/ask/AskPanel.tsx` (改) — 添加 Save 按钮
- `app/components/ask/AskMessage.tsx` (改) — 消息右键菜单

**受影响的其他模块**：
- `lib/fs.ts` — 文件写入（已有，无需改）
- `lib/agent/executor.ts` — 会话 metadata（需要补充）
- `__tests__/ask/save-session.test.ts` (新) — 单元测试

**破坏性变更**：无

## 边界 case 与风险

| Case | 处理方式 |
|------|---------|
| **空会话** | 禁用 Save 按钮；提示"Nothing to save" |
| **网络超时** | 重试 3 次，失败后提示"Save failed, try again" |
| **LLM 错误** | 降级到模式 1（原始保存），通知用户"AI summary unavailable" |
| **文件已存在** | 弹出覆盖确认对话，或自动重命名 (`.1.md`, `.2.md`) |
| **目录不存在** | 创建目录（DirPicker 已确保路径有效） |
| **超长会话** | 截断至最后 10,000 tokens，保存 message range 元数据 |
| **特殊字符文件名** | 自动清理（保留 alphanumeric, `-`, `_`；替换其他为 `_`) |

**已知风险**：
- **LLM 幻觉**：生成的摘要可能失实。建议 Preview → 手动编辑后确认
- **Token 消耗**：每次 digest/organize 模式消耗 2-5K tokens。应在设置中有选项提醒/限制
- **并发冲突**：用户快速连续点 Save 多次可能导致重复创建。加 debounce(1s)

## 验收标准

### 功能完整性
- [ ] Save Full Session 模式工作，生成标准 Markdown
- [ ] Archive & Digest 模式调用 LLM，生成摘要
- [ ] Organize to Note 模式调用 LLM，生成结构化笔记
- [ ] DirPicker 正确显示，选择后生效
- [ ] 文件名自动生成（模式：`session-2026-04-10-14-23.md`）
- [ ] Preview 功能显示生成内容，不保存
- [ ] Save 按钮保存文件，返回确认

### 集成
- [ ] Ask Panel 底部显示 [Save Session] 按钮
- [ ] 单条消息右键菜单有 "Save to note" 选项
- [ ] 点击后弹出同一个 SaveSessionPopover
- [ ] 两个入口的 sessionId/messageId 正确传递

### 安全 & 性能
- [ ] 文件路径验证（resolveSafe）——不允许路径穿越
- [ ] 文件不覆盖受保护文件 (INSTRUCTION.md)
- [ ] Preview 模式 <3 秒响应
- [ ] Save 模式 <5 秒（包括 LLM 调用）
- [ ] 不保存敏感信息（API keys 如已脱敏）

### UX & 可访问性
- [ ] 加载状态清晰（spinner + 文案）
- [ ] 错误提示明确（"Why save failed" 并给出重试选项）
- [ ] 成功提示显示保存路径（可点击打开）
- [ ] Keyboard navigation：Tab 遍历按钮，Enter 确认
- [ ] ARIA labels 正确

### i18n
- [ ] 所有文案支持英文与中文
- [ ] 自动生成的标题有语言标记（生成时已由 LLM 按 locale 处理）

### 测试覆盖
- [ ] 单元测试：保存逻辑、filename 生成、path validation ≥80%
- [ ] 组件测试：UI 交互、preview/save 转换
- [ ] 集成测试：端到端（点击 → 选目录 → 预览 → 保存 → 验证文件）
- [ ] 错误路径测试：网络超时、目录不存在、文件权限

---

## 实现状态（2026-04-10 更新）

### ✅ 已完成
- **MVP 核心**：全会话保存、档案消化、笔记组织三模式
- **UI 弹窗**：DirPicker + 模式选择 + Preview/Save 流程
- **API 路由**：`/api/ask/save-session` 完整实现
- **集成设计**：单条消息 + 全会话保存统一 UI
- **LLM 提示**：消化与组织的两套提示词
- **预处理**：消息格式化、Markdown 生成

### 改进点
- 统一 save UI（单消息与全会话使用同一弹窗）
- LLM 总结时自动调用 askLLMText（实时 token-aware 处理）
- Preview 模式（不保存，仅展示生成内容）

