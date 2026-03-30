# Spec: Ask AI 质量修复（Bug + 拖拽 Context + UX）

## 目标
修复 MindOS 内置 Ask AI 对话功能的已知阻塞性 bug，新增文件树拖拽作为 context，并补齐关键可访问性缺失。

## 现状分析
`AskContent.tsx`（672 行）+ `useMention.ts`（65 行）构成核心交互层。
当前存在以下阻塞性问题：

1. **@ mention 零结果时 submit 被锁死**：`mentionQuery !== null` 导致 submit disabled，但零结果时 popover 不渲染，用户只能手动删除 `@` 才能发送。
2. **@ mention 文件列表不刷新**：`useMention` 仅 mount 时 `fetch('/api/files')`，新建/删除/重命名文件后 `@` 无法找到新文件。
3. **navigateMention 负索引**：零结果时 `Math.min(i + 1, -1)` 产生 `-1` 索引。
4. **`/api/files` 错误响应导致 crash**：不检查 `Array.isArray()`，API 返回 `{error: ...}` 时 `allFiles.filter` 抛出 TypeError。
5. **FileChip remove 按钮无 aria-label**：纯 `<X size={10}>` 图标按钮，屏幕阅读器无法识别。
6. **无文件树拖拽 context**：用户无法从侧边栏拖拽文件到 Ask 面板作为附加上下文。

## 数据流 / 状态流

### @ mention 流（修复后）

```
用户输入 "@" → debounce(80ms) → updateMentionFromInput
  → allFiles.filter(query)
  → results > 0 → MentionPopover 渲染，↑↓/Enter 选择
  → results === 0 → 自动 resetMention()，submit 不再锁死
  → 选择/ESC → resetMention()
```

### 拖拽 context 流

```
FileTree row → draggable=true, dataTransfer("text/mindos-path", relativePath)
  ↓
Ask panel composer → onDragOver + onDrop
  → 读取 "text/mindos-path"
  → 如果路径不在 attachedFiles → 加入
  → 视觉反馈：drag-over 边框高亮 → drop 后 FileChip 出现
```

### 文件列表刷新流（修复后）

```
useMention mount → fetch('/api/files') → allFiles
  + 监听 window event 'mindos:files-changed'
  → 重新 fetch → allFiles 更新
```

## 方案

### Fix 1: @ mention 零结果不锁 submit

在 `useMention.ts` 的 `updateMentionFromInput` 中，当过滤结果为空时自动 reset：

```typescript
const filtered = allFiles.filter(f => f.toLowerCase().includes(query)).slice(0, 8);
if (filtered.length === 0) {
  // 不锁死 submit，让用户继续输入
  setMentionQuery(null);
  setMentionResults([]);
  return;
}
```

### Fix 2: 文件列表可刷新

在 `useMention` 中监听 `'mindos:files-changed'` 事件（已有先例：`renderer-state-changed`），自动 refetch。

### Fix 3: navigateMention 负索引

```typescript
if (direction === 'down') {
  setMentionIndex(i => mentionResults.length > 0 ? Math.min(i + 1, mentionResults.length - 1) : 0);
}
```

### Fix 4: `/api/files` 响应防御

```typescript
fetch('/api/files')
  .then(r => r.ok ? r.json() : [])
  .then(data => setAllFiles(Array.isArray(data) ? data : []))
  .catch(() => {});
```

### Fix 5: FileChip aria-label

```tsx
<button aria-label={`Remove ${name}`} ...>
```

### Feat 6: 文件树拖拽到 Ask

**FileTree 侧**：给每个文件行增加 `draggable` + `onDragStart`。

**AskContent 侧**：在 composer 区域增加 `onDragOver` + `onDrop` handler，读取 `text/mindos-path`。

## 影响范围
- `app/hooks/useMention.ts`（bug fix 1-4）
- `app/components/ask/FileChip.tsx`（fix 5）
- `app/components/ask/AskContent.tsx`（feat 6 drop target + fix 1 fallback）
- `app/components/FileTree.tsx`（feat 6 drag source）
- `app/__tests__/ask/` 或 `app/__tests__/hooks/`（新增测试）

不影响：
- `/api/ask` route（只是客户端 attachedFiles 变更方式不同）
- Agent 执行逻辑
- Session 持久化

无破坏性变更。

## 边界 case 与风险

1. **@ 输入后快速删除 @ 字符** — debounce 中 input 已改变 → `updateMentionFromInput` 自动 reset（已有 `atIdx === -1` 分支）
2. **拖拽非文件行（如目录）** — `dataTransfer` 只对文件行设置，目录行不设置 `draggable`
3. **拖拽到非 Ask 区域** — 标准 DnD 行为，无副作用
4. **并发 fetch('/api/files')** — `useMention` 每次 refetch 替换 allFiles，无竞态（最后一次结果生效）
5. **极长文件路径（>500 chars）** — FileChip 已有 `truncate max-w-[220px]`

## 验收标准
- [ ] 输入 `@nonexistent` 时不锁死发送按钮（submit button 仍可用）
- [ ] navigateMention 在空结果时不产生负索引
- [ ] `/api/files` 返回错误时不崩溃，allFiles 降级为空数组
- [ ] 新建文件后，@ mention 可搜到新文件（无需刷新页面）
- [ ] FileChip 的 remove 按钮有 `aria-label`
- [ ] 可从侧边栏文件树拖拽文件到 Ask 面板，文件自动出现在 attached context
- [ ] 拖拽目录行不触发 context 附加
- [ ] 全量测试通过
