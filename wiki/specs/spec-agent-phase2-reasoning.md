# SPEC: Agent Phase 2 — 推理增强

> 步骤监控 + 循环检测 + 危险操作确认（Human-in-the-loop）

## 动机

Agent 当前可以连续调用最多 30 步工具，但没有任何监控和防护：
- 无循环检测：同一 tool 同参数可能被反复调用（死循环）
- 无进度反馈：用户不知道 Agent 已用多少步
- 破坏性操作（delete_file、move_file、write_file 全覆盖）无需确认直接执行

## 设计决策

| 决策 | 选项 | 结论 |
|------|------|------|
| 循环检测位置 | 前端检测 vs 后端 callback | **后端 `prepareStep`**。在每步执行前检查历史并注入警告 |
| 循环检测策略 | 精确参数匹配 vs tool name 频率 | **精确匹配**。同一 tool + 相同 JSON.stringify(input) 连续出现 3 次即判定循环 |
| 循环处理 | 中断执行 vs 注入提示 | **注入提示**。通过 `prepareStep` 在下一步的 messages 末尾追加 user message 警告，不强制中断 |
| 危险操作确认 | 前端弹窗阻断 vs 后端标记 | **Phase 2 不做前端阻断**。仅在 system prompt 中强化 "先确认后执行" 指令，Phase 4 再做 UI 阻断 |
| 步骤进度 | 前端计算 vs 后端推送 | **前端计算**。前端已有 `parts` 数组，count tool-call parts 即可 |

## 变更范围

### 2a. 步骤监控 + 循环检测（`route.ts`）

两个 callback 配合使用：

**`onStepFinish`** — 事后记录（日志 + 历史收集）：
```typescript
const stepHistory: Array<{ tool: string; input: string }> = [];
let loopDetected = false;

onStepFinish: ({ stepType, toolCalls, usage }) => {
  if (toolCalls) {
    for (const tc of toolCalls) {
      stepHistory.push({ tool: tc.toolName, input: JSON.stringify(tc.input) });
    }
  }
  // 循环检测
  if (stepHistory.length >= 3) {
    const last3 = stepHistory.slice(-3);
    if (last3.every(s => s.tool === last3[0].tool && s.input === last3[0].input)) {
      loopDetected = true;
    }
  }
  console.log(`[ask] Step ${stepHistory.length}/${stepLimit}, type=${stepType}, tokens=${usage?.totalTokens ?? '?'}`);
},
```

**`prepareStep`** — 事前注入（循环警告）：
```typescript
prepareStep: ({ stepNumber, messages }) => {
  if (loopDetected) {
    loopDetected = false; // 只警告一次
    return {
      messages: [
        ...messages,
        {
          role: 'user' as const,
          content: '[SYSTEM WARNING] You have called the same tool with identical arguments 3 times in a row. This appears to be a loop. Try a completely different approach or ask the user for clarification.',
        },
      ],
    };
  }
  return undefined; // 不修改
},
```

**注意**：需要确认 `prepareStep` 在当前 AI SDK 版本中是否可用。如果不可用，降级方案为 `onStepFinish` 中设置 flag → 下一个 `onStepFinish` 检测到 flag 后直接 `controller.abort()`（强制中断循环）。

### 2b. System Prompt 强化（`prompt.ts`）

在现有 "Complex task protocol" 后追加：

```
Step awareness:
- You have a limited number of steps (configured by user, typically 10-30).
- If a tool call fails or returns unexpected results, do NOT retry with the same arguments.
- Try a different approach or ask the user for clarification.

Destructive operation protocol:
- Before delete_file: list what links to this file (get_backlinks), warn user about impact
- Before move_file: same — check backlinks first
- Before write_file (full overwrite): confirm with user that full replacement is intended
- NEVER chain multiple destructive operations without pausing to summarize what you've done
```

### 2c. 前端步骤计数器（`MessageList.tsx`）

在 streaming 状态的 assistant message 底部显示步骤进度：

```
🔧 Step 3/20 — search("project plan")
```

实现：count `parts.filter(p => p.type === 'tool-call')` 得到当前步数，`maxSteps` 通过 `MessageListProps` 新增字段从 AskModal 传入。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/app/api/ask/route.ts` | 修改 | 添加 `onStepFinish` + `prepareStep` + 循环检测 |
| `app/lib/agent/prompt.ts` | 修改 | 追加 step awareness + destructive protocol |
| `app/components/ask/MessageList.tsx` | 修改 | 新增 `maxSteps` prop + streaming 时显示步骤计数 |
| `app/components/AskModal.tsx` | 修改 | 传 `maxSteps` 给 MessageList |

## 不做的事

- **前端 Human-in-the-loop 阻断 UI**：移到 Phase 4。当前 prompt 层面约束够用
- **token 使用量展示**：Phase 3 做上下文管理时一起加

## 验收标准

- [ ] 后端日志输出每步的 tool name + token 用量
- [ ] 同一 tool + 同参数连续 3 次后，Agent 行为改变（不再重复同一操作）
- [ ] System prompt 包含破坏性操作约束，Agent 执行 delete 前会先查 backlinks
- [ ] 前端 streaming 时显示 "Step N/M" 进度
- [ ] `tsc --noEmit` 通过
