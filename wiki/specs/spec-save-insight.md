# Spec: 查询回流 — Save Insight (Feature 1)

## 目标

用户在 Ask 面板中获得有价值的 AI 回答后，能一键保存到知识库，实现"查询回流"——对话中产生的知识不再消失在聊天记录中，而是沉淀为可复用的笔记。

## 现状分析

当前 Ask 面板中 assistant 消息只有 Copy 按钮。用户想保存 AI 回答需要：复制 → 手动创建文件 → 粘贴。这打断心流且容易遗忘，违背"知识复利"原则。

## 数据流 / 状态流

```
用户 hover → 操作栏出现（Copy + Save）→ 点击 Save
                                          │
                               Inline 保存区展开
                               ├─ 默认路径：Inbox/{slug}.md
                               ├─ 模式：new / append
                               └─ 用户确认
                                          │
                              POST /api/file
                              { op: create_file | append_to_file }
                                          │
                              KB 新增文件 → toast + "Open"
```

**组件读写关系**：
- `MessageList.tsx` 读取 messages → 渲染 → 操作栏
- `SaveInsightInline.tsx` 新组件 → 读消息文本 → 生成路径 → 调用 `/api/file`
- `/api/file` 写入 KB → 审计日志追加

## 方案

### 选定方案：Inline 展开（方案 B）

在 assistant 消息气泡底部展开保存区域，不使用 Modal。原因：
- 不打断上下文（MindOS 设计原则 Content is King）
- 用户保存时仍能看到回答内容
- 操作更轻量

### 实现清单

| 文件 | 改动 | 大小 |
|------|------|------|
| `app/components/ask/SaveInsightInline.tsx` | 新建：inline 保存组件 | ~130 行 |
| `app/components/ask/MessageList.tsx` | 增加 Save 按钮 + 嵌入 inline 组件 | ~25 行 |
| `app/lib/i18n/modules/ai-chat.ts` | 新增保存相关 i18n 键 | ~15 行 |

### 不需要的

- **不需要新 API 端点** — 复用 `POST /api/file` 的 `create_file` / `append_to_file` op
- **不需要新 MCP 工具** — Agent 已有 `create_file` / `append_to_file`
- **不需要路径建议 AI** — 默认 `Inbox/` + 日期 slug 即可，用户可修改

## 影响范围

- 变更文件：`MessageList.tsx`、`ai-chat.ts`
- 新增文件：`SaveInsightInline.tsx`
- 不受影响：API 层、MCP 层、其他 UI 组件、Desktop/Electron

## 边界 case 与风险

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | 回答为空/纯 thinking block | Save 按钮不显示（已有 `stripThinkingTags` 过滤） |
| 2 | 文件名含特殊字符 | 路径 sanitize，只允许 `[a-zA-Z0-9_\-/.]` |
| 3 | 目标文件已存在（新建模式）| 显示警告 + 切换到追加模式 |
| 4 | 快速双击保存 | 第一次点击后 disabled，防止重复 |
| 5 | 超长回答 | 内容完整保存，预览区截断显示 |
| 6 | 路径为空 | Save 按钮 disabled |
| 7 | 保存到不存在的子目录 | `createFile` 自动创建父目录 |

## 验收标准

- [ ] Assistant 消息 hover 时出现 Save 按钮（移动端常显）
- [ ] 点击 Save 展开 inline 保存区，预填 `Inbox/insight-YYYY-MM-DD.md`
- [ ] 可切换 New/Append 模式
- [ ] 保存后 toast 提示成功 + Open 动作
- [ ] 空回答/纯 thinking 不显示 Save 按钮
- [ ] 重复点击不会创建多个文件
- [ ] 保存失败时显示错误提示，表单保持展开
- [ ] i18n 中英文完整
