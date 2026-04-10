# Spec: 移动端 Markdown 编辑器 (Phase 3)

> 日期：2026-04-10
> 状态：Draft
> 前置：spec-rn-phase2-ai-chat.md
> 后继：spec-rn-phase4-advanced-features.md（未写）

## 目标

在移动端实现 Markdown 文件编辑能力，支持：
1. 原始 Markdown 文本编辑（Plain text + 语法高亮）
2. 实时预览切换（Edit / Preview 双模式）
3. Markdown 工具栏（标题、加粗、列表、链接等快捷操作）
4. 保存到 MindOS 后端
5. 冲突检测与处理

### Why（YAGNI check）

没有编辑能力，移动端只是只读浏览器。用户在手机上最常见的场景是「快速记一笔」和「修改一小段」。

### Simpler（KISS check）

**不做 TipTap 级别的富文本编辑器**。移动端用 Plain text + Markdown 语法高亮，够用且性能好。TenTap（WebView 包装 TipTap）留作 Phase 4 可选升级。理由：

1. Notion 移动端的编辑器也只是简化版（非桌面端完整 block editor）
2. Obsidian 移动端直接用纯文本 Markdown 编辑，用户接受度很高
3. 纯文本编辑性能好、bug 少、维护成本低

---

## 竞品参考

| 产品 | 移动端编辑模式 | 工具栏 |
|------|--------------|--------|
| **Obsidian** | 纯文本 Markdown + 实时预览 | 底部快捷栏（#、**、- 等） |
| **Bear** | 富文本 + Markdown 语法 | 键盘上方工具栏 |
| **Craft** | Block editor（原生 SwiftUI） | 键盘上方 + 长按菜单 |
| **Joplin** | 纯文本 / 预览切换 | 基础工具栏 |
| **iA Writer** | 纯文本 Markdown | 键盘扩展行 |

**MindOS 选择**：Obsidian / iA Writer 模式——纯文本 Markdown + 键盘上方工具栏 + 预览切换。

---

## User Flow

```
用户目标：在手机上编辑 Markdown 文件并保存

前置条件：用户已连接 MindOS 后端，可浏览文件

Step 1: 用户在文件查看页点击右上角「编辑」按钮
  → 系统反馈：切换到编辑模式，文本可编辑，键盘上方出现工具栏
  → 状态变化：从 Preview → Edit 模式

Step 2: 用户编辑 Markdown 文本
  → 系统反馈：文本实时更新，工具栏响应输入（如光标在标题行，# 按钮高亮）
  → 状态变化：本地 draft 保存（每 3 秒 debounce）

Step 3: 用户通过工具栏插入格式
  → 系统反馈：在光标位置插入 Markdown 语法（如 **加粗**、- 列表）
  → 状态变化：文本更新

Step 4: 用户点击「Preview」切换预览
  → 系统反馈：Markdown 渲染为 HTML 预览
  → 状态变化：Edit → Preview 模式

Step 5: 用户点击「Save」保存
  → 系统反馈：显示「Saving...」→「✓ Saved」
  → 状态变化：POST /api/files 保存到后端

Step 5b: 保存冲突
  → 系统反馈：弹出「文件已被修改。覆盖 / 合并 / 取消？」
  → 状态变化：等待用户决策

Step 6: 用户返回
  → 系统反馈：如有未保存更改，提示「Discard changes?」
  → 状态变化：确认后返回文件列表

成功结果：文件已保存到 MindOS 后端

异常分支：
- 异常 A：保存时网络断开 → 本地缓存 + 恢复后自动重试
- 异常 B：文件在服务端被删除 → 提示「文件不存在，另存为？」
- 异常 C：保存超时 → 重试按钮 + 本地 draft 不丢失

边界场景：
- 超大文件 (>100KB) → 编辑时禁用语法高亮提升性能
- 非 Markdown 文件 (csv/yaml) → 显示纯文本编辑器（无工具栏）
- 创建新文件 → 空编辑器 + 提示输入文件名
- 快速切换文件 → 自动保存前一个文件
```

---

## UI 线框图

### 状态 1：预览模式（默认）

```
┌──────────────────────────────────┐
│  ← meeting-notes.md   [Edit] ⋮  │
├──────────────────────────────────┤
│                                  │
│  # Meeting Notes                 │
│                                  │
│  ## Agenda                       │
│                                  │
│  - Review Q2 progress            │
│  - Discuss mobile app plan       │
│  - **Action items**              │
│                                  │
│  ## Decisions                    │
│                                  │
│  > We decided to use React       │
│  > Native + Expo for mobile.    │
│                                  │
│  ## Next Steps                   │
│                                  │
│  1. Set up monorepo              │
│  2. Create app shell             │
│                                  │
└──────────────────────────────────┘
```

### 状态 2：编辑模式

```
┌──────────────────────────────────┐
│  ← meeting-notes.md  [Preview]  │
│                       [Save ✓]  │
├──────────────────────────────────┤
│                                  │
│  # Meeting Notes                 │
│                                  │
│  ## Agenda                       │
│                                  │
│  - Review Q2 progress            │
│  - Discuss mobile app plan█      │
│  - **Action items**              │
│                                  │
│  ## Decisions                    │
│                                  │
│  > We decided to use React       │
│  > Native + Expo for mobile.    │
│                                  │
├──────────────────────────────────┤
│  H1  H2  B  I  -  1.  >  []  @  │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │        (keyboard)          │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 状态 3：保存中

```
┌──────────────────────────────────┐
│  ← meeting-notes.md  [Preview]  │
│                    [◌ Saving...] │
├──────────────────────────────────┤
│  (编辑内容)                      │
└──────────────────────────────────┘
```

### 状态 4：保存冲突

```
┌──────────────────────────────────┐
│  ← meeting-notes.md             │
├──────────────────────────────────┤
│  ┌──────────────────────────┐    │
│  │ ⚠ File Modified          │    │
│  │                          │    │
│  │ This file was changed    │    │
│  │ on another device since  │    │
│  │ you started editing.     │    │
│  │                          │    │
│  │ [ Overwrite ]            │    │
│  │ [ Keep Both ] (new copy) │    │
│  │ [ Discard My Changes ]   │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

### 状态 5：未保存退出确认

```
┌──────────────────────────────────┐
│  (dimmed background)             │
│  ┌──────────────────────────┐    │
│  │ Unsaved Changes           │    │
│  │                          │    │
│  │ You have unsaved changes. │    │
│  │ What would you like to do?│    │
│  │                          │    │
│  │ [ Save & Exit ]          │    │
│  │ [ Discard ]              │    │
│  │ [ Continue Editing ]     │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

### 工具栏详细设计

```
┌──────────────────────────────────────────┐
│  H1  H2  B   I   -   1.  >   []  @  ⌫  │
│  ──  ──  ──  ──  ──  ──  ──  ──  ── ──  │
│  #   ##  **  _   -   1.  >   [ ] @  ↵  │
└──────────────────────────────────────────┘

H1 → 在行首插入 "# "
H2 → 在行首插入 "## "
B  → 选中文本包裹 "**...**"（无选中则插入 "****" 并居中光标）
I  → 选中文本包裹 "_..._"
-  → 在行首插入 "- "
1. → 在行首插入 "1. "（自动递增）
>  → 在行首插入 "> "
[] → 在行首插入 "- [ ] "
@  → 打开文件 mention picker
⌫  → 删除行首 Markdown 标记
```

### 状态流转图

```
[Preview] ──点击 Edit──→ [Edit] ──输入──→ [Edit (dirty)]
    ▲                        │                  │
    │                        │                  ├──Save──→ [Saving] ──成功──→ [Edit (clean)]
    │                        │                  │              │
    │                    点击 Preview            │         ──冲突──→ [冲突弹窗]
    │                        │                  │              │
    │                        ▼                  │         ──失败──→ [Save Error]──重试──→[Saving]
    └────────────────── [Preview]               │
                                                │
                                           ──返回──→ [Unsaved 弹窗]
                                                      │          │
                                                Save & Exit    Discard
                                                      │          │
                                                      ▼          ▼
                                                 [File List]  [File List]
```

---

## 技术方案

### 编辑器组件

```typescript
// mobile/components/editor/MarkdownEditor.tsx
import { useState, useRef, useCallback } from 'react';
import { TextInput, ScrollView, View, Text } from 'react-native';
import { EditorToolbar } from './EditorToolbar';

interface Props {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export function MarkdownEditor({ initialContent, onSave, onDirtyChange }: Props) {
  const [content, setContent] = useState(initialContent);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<TextInput>(null);
  const isDirty = content !== initialContent;

  const handleToolbarAction = useCallback((action: ToolbarAction) => {
    const { newContent, newSelection } = applyMarkdownAction(
      content, selection, action
    );
    setContent(newContent);
    setSelection(newSelection);
    onDirtyChange(newContent !== initialContent);
  }, [content, selection, initialContent]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }}>
        <TextInput
          ref={inputRef}
          multiline
          value={content}
          onChangeText={(text) => {
            setContent(text);
            onDirtyChange(text !== initialContent);
          }}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          style={editorStyles.input}
          autoCorrect={false}
          spellCheck={false}
        />
      </ScrollView>
      <EditorToolbar onAction={handleToolbarAction} />
    </View>
  );
}
```

### Markdown 工具栏操作

```typescript
// mobile/lib/markdown-actions.ts
export type ToolbarAction =
  | 'h1' | 'h2' | 'bold' | 'italic'
  | 'bullet' | 'numbered' | 'quote' | 'todo'
  | 'mention' | 'undo-prefix';

export function applyMarkdownAction(
  content: string,
  selection: { start: number; end: number },
  action: ToolbarAction
): { newContent: string; newSelection: { start: number; end: number } } {
  const before = content.slice(0, selection.start);
  const selected = content.slice(selection.start, selection.end);
  const after = content.slice(selection.end);

  switch (action) {
    case 'bold': {
      const wrapped = `**${selected || 'text'}**`;
      return {
        newContent: before + wrapped + after,
        newSelection: selected
          ? { start: selection.start, end: selection.start + wrapped.length }
          : { start: selection.start + 2, end: selection.start + 6 },
      };
    }
    case 'h1': {
      const lineStart = before.lastIndexOf('\n') + 1;
      const prefix = '# ';
      return {
        newContent: content.slice(0, lineStart) + prefix + content.slice(lineStart),
        newSelection: { start: selection.start + prefix.length, end: selection.end + prefix.length },
      };
    }
    // ... 其他 action 类似
  }
}
```

### 冲突检测

```typescript
// mobile/lib/file-save.ts
export async function saveFile(
  baseUrl: string,
  path: string,
  content: string,
  lastKnownMtime: number
): Promise<{ ok: boolean; conflict?: boolean; serverMtime?: number }> {
  const res = await fetch(`${baseUrl}/api/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      content,
      expectedMtime: lastKnownMtime, // 服务端对比
    }),
  });

  if (res.status === 409) {
    const data = await res.json();
    return { ok: false, conflict: true, serverMtime: data.mtime };
  }

  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return { ok: true };
}
```

### 本地 Draft 缓存

```typescript
// mobile/lib/draft-store.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = 'draft:';

export async function saveDraft(path: string, content: string) {
  await AsyncStorage.setItem(DRAFT_PREFIX + path, JSON.stringify({
    content,
    timestamp: Date.now(),
  }));
}

export async function loadDraft(path: string): Promise<{ content: string; timestamp: number } | null> {
  const raw = await AsyncStorage.getItem(DRAFT_PREFIX + path);
  return raw ? JSON.parse(raw) : null;
}

export async function clearDraft(path: string) {
  await AsyncStorage.removeItem(DRAFT_PREFIX + path);
}
```

---

## 影响范围

### 新增文件

| 文件 | 说明 |
|------|------|
| `mobile/components/editor/MarkdownEditor.tsx` | 核心编辑器组件 |
| `mobile/components/editor/EditorToolbar.tsx` | 工具栏组件 |
| `mobile/components/editor/ConflictModal.tsx` | 冲突处理弹窗 |
| `mobile/components/editor/UnsavedModal.tsx` | 未保存确认弹窗 |
| `mobile/lib/markdown-actions.ts` | 工具栏操作纯逻辑 |
| `mobile/lib/file-save.ts` | 文件保存 + 冲突检测 |
| `mobile/lib/draft-store.ts` | 本地 draft 缓存 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `mobile/app/view/[...path].tsx` | 添加 Edit 按钮 + 编辑模式 |
| `app/app/api/files/route.ts` | 支持 `expectedMtime` 冲突检测 |

---

## 边界 case

| Case | 处理方式 |
|------|----------|
| 超大文件 (>100KB) 编辑卡顿 | 禁用语法高亮；>500KB 提示「建议在桌面端编辑」|
| 中文 IME 组合输入 | 使用 `onChangeText` 而非 `onKeyPress` |
| 多设备同时编辑 | 保存时 mtime 冲突检测 |
| 编辑中 APP 被杀 | draft 已 3 秒自动保存到 AsyncStorage |
| 二进制文件误打开编辑 | 文件类型检查，非文本文件禁用编辑 |
| 新建文件 | 弹窗输入路径+文件名 → 空编辑器 |

---

## 风险

| 风险 | 严重性 | Mitigation |
|------|--------|------------|
| TextInput 性能在大文件上差 | 高 | 超过 100KB 降级为只读 + 桌面端编辑提示 |
| 中文输入法兼容性 | 中 | 测试 iOS/Android 主流输入法 |
| 光标位置计算不准确 | 中 | `onSelectionChange` + 工具栏操作后手动设置光标 |
| 自动保存与手动保存冲突 | 低 | Draft 只存本地，Save 是用户显式操作 |

---

## 验收标准

- [ ] 点击 Edit 可切换到编辑模式
- [ ] 文本输入流畅（中英文）
- [ ] 工具栏 10 个按钮全部可用
- [ ] Bold/Italic 可包裹选中文本
- [ ] H1/H2 正确插入到行首
- [ ] 列表/引用/TODO 正确插入
- [ ] @mention 可弹出文件选择
- [ ] Preview 切换可正确渲染 Markdown
- [ ] Save 可保存到后端
- [ ] 冲突时弹出处理选项
- [ ] 未保存退出有确认弹窗
- [ ] APP 被杀后 draft 不丢失
- [ ] 100KB 文件编辑不卡顿
