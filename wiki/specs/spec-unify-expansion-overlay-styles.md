# Spec: 统一展开/浮层/遮罩交互风格

## 目标

消除展开动画和浮层遮罩的 4 种不一致实现，统一为 3 个标准模式，让用户在整个 App 中获得一致的交互反馈。

## 现状分析

审计发现 **3 类不一致**，涉及 **14 个组件**。

### 问题 A：内联展开动画 — 3 种实现混用

| 实现方式 | 组件 | 行为 | 问题 |
|----------|------|------|------|
| **CSS Grid `grid-rows-[1fr/0fr]`** | `EchoInsightCollapsible`, `AgentsOverviewSection` (risk) | 平滑高度过渡，浏览器自动计算高度 | **最佳方案** |
| **`maxHeight: 9999px` + `transition-all`** | `FileTree` (DirectoryNode) | 有过渡但 closing 速度不可控：内容 50px 时 closing 延迟明显（因为从 9999→0 的过渡时间按比例分配） | 关闭时视觉延迟，hack 感重 |
| **条件渲染 `{expanded && ...}`** | `ToolCallBlock`, `ThinkingBlock`, `DiscoverPanel` (plugins) | 瞬间出现/消失，无动画 | 生硬，与设计系统动效规范不一致 |

### 问题 B：全屏遮罩 — 4 种背景不一致

| 实现方式 | 组件 | 遮罩效果 |
|----------|------|---------|
| **`.modal-backdrop`** (globals.css) | `AskModal`, `SettingsModal`, `SearchModal` | `rgba(10,9,6,0.72)` + `blur(8px)` |
| **`bg-black/30 backdrop-blur-[2px]`** | `SkillDetailPopover` | 轻遮罩 + 微模糊 |
| **`bg-black/40 backdrop-blur-[2px]`** | `ConfirmDialog` (AgentsPrimitives) | 稍深遮罩 + 微模糊 |
| **`bg-black/60 backdrop-blur-sm`** | `ImportModal` | 深遮罩 + 中等模糊 |
| **`bg-black/10 backdrop-blur-xs`** | `dialog.tsx` (shadcn) | 极浅遮罩 + 极微模糊 |

用户在同一 App 内打开不同弹窗，背后遮罩深浅、模糊度各异，品牌感不统一。

### 问题 C：浮动元素 — 基本一致（无需大改）

| 组件 | 样式 |
|------|------|
| `ContextMenuShell`, `AgentPickerPopover` | `bg-card border border-border rounded-lg shadow-lg` |
| `SlashCommandPopover`, `MentionPopover` | `border border-border rounded-lg bg-card shadow-lg` |

浮动元素已高度统一：`bg-card` + `border-border` + `shadow-lg` + `rounded-lg`，只需小幅对齐。

## 数据流 / 状态流

```
用户交互 (click/toggle)
    │
    ├─ 内联展开 ──→ state: open/expanded
    │                 │
    │                 └─→ CSS Grid 动画 (grid-rows-[1fr/0fr])
    │                     └─→ overflow-hidden 子容器
    │
    ├─ 全屏模态 ──→ state: isOpen
    │                 │
    │                 ├─→ 遮罩层 (.modal-backdrop) ← z-50
    │                 └─→ 内容面板 (bg-card)
    │
    └─ 浮动面板 ──→ state: isOpen
                      │
                      ├─→ 轻遮罩 (.overlay-backdrop) ← z-40
                      └─→ 内容面板 (bg-card shadow-lg)
```

关键约束：
- 遮罩层和内容面板是**兄弟元素**，都挂在 fixed/absolute 容器下
- CSS Grid 动画只影响**展开容器本身**，不涉及其他组件
- `FileTree` 的展开是递归组件，改动 `DirectoryNode` 即覆盖全部层级

## 方案

### 标准 1：内联展开 — 统一 CSS Grid 动画

**选定方案：`grid-rows-[1fr/0fr]`**

理由：
- 浏览器自动计算真实高度，无需 magic number
- 开/关速度一致（不像 `maxHeight: 9999px` 关闭时延迟）
- 已在 2 个组件中验证可用
- 设计系统要求 `duration ≤ 0.3s`，`grid-rows` 配合 `duration-200` 满足

```
标准模板：
┌─ trigger (button/header) ─────────────────┐
│  [▸/▾] Title              [count/badge]   │
├───────────────────────────────────────────┤
│  <div class="grid transition-[grid-       │
│    template-rows] duration-200 ease-out   │
│    ${open ? 'grid-rows-[1fr]'             │
│          : 'grid-rows-[0fr]'}">           │
│    <div class="overflow-hidden">          │
│      ... expanded content ...             │
│    </div>                                 │
│  </div>                                   │
└───────────────────────────────────────────┘
```

**例外：`ToolCallBlock` / `ThinkingBlock`**

这两个组件在 AI 对话流式输出中使用，内容长度不可预测（可达数千行），展开时不需要"从 0 滑开"的动画——用户是为了查看内容而非享受过渡。保留条件渲染 `{expanded && ...}` 是合理的。

### 标准 2：全屏遮罩 — 两级制

| 级别 | 用途 | 样式 | 适用组件 |
|------|------|------|---------|
| **重遮罩** `.modal-backdrop` | 核心模态（需要用户完全聚焦） | `rgba(10,9,6,0.72)` + `blur(8px)` | `AskModal`, `SettingsModal`, `SearchModal`, `ImportModal` |
| **轻遮罩** `.overlay-backdrop` | 辅助浮层（快速查看/确认，不切断上下文） | `rgba(10,9,6,0.35)` + `blur(2px)` | `SkillDetailPopover`, `ConfirmDialog` |

```css
/* globals.css — 新增 */
.overlay-backdrop {
  background: rgba(10, 9, 6, 0.35);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.dark .overlay-backdrop {
  background: rgba(0, 0, 0, 0.4);
}
```

shadcn `dialog.tsx` 的 `bg-black/10 backdrop-blur-xs` 也改为引用 `.overlay-backdrop`，保持一致。

### 标准 3：浮动元素 — 维持现状

已统一为 `bg-card border-border shadow-lg rounded-lg`，无需改动。

## 影响范围

### 变更文件列表

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `app/app/globals.css` | 新增 | 添加 `.overlay-backdrop` 样式 |
| `app/components/FileTree.tsx` | 重构 | `maxHeight: 9999px` → CSS Grid 动画 |
| `app/components/panels/DiscoverPanel.tsx` | 重构 | 条件渲染 → CSS Grid 动画 |
| `app/components/ImportModal.tsx` | 微调 | `bg-black/60 backdrop-blur-sm` → `.modal-backdrop` |
| `app/components/agents/SkillDetailPopover.tsx` | 微调 | `bg-black/30 backdrop-blur-[2px]` → `.overlay-backdrop` |
| `app/components/agents/AgentsPrimitives.tsx` | 微调 | `bg-black/40 backdrop-blur-[2px]` → `.overlay-backdrop` |
| `app/components/ui/dialog.tsx` | 微调 | shadcn overlay → `.overlay-backdrop` |
| `wiki/21-design-principle.md` | 文档 | 新增展开动画 + 遮罩两级标准 |

### 对抗性审查额外发现

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `app/components/SidebarLayout.tsx` | 微调 | 移动端 sidebar overlay `bg-black/60 backdrop-blur-sm` → `.overlay-backdrop` |
| `app/components/Sidebar.tsx` | 微调 | 同上 |
| `app/components/CreateSpaceModal.tsx` | 微调 | `bg-black/40 dark:bg-black/60` → `.overlay-backdrop` |
| `app/components/echo/EchoInsightCollapsible.tsx` | 修复 | 已有 CSS Grid 组件补 `inert` 属性 |
| `app/components/agents/AgentsOverviewSection.tsx` | 修复 | 同上 |

### 不受影响的模块

- `ToolCallBlock` / `ThinkingBlock`：保留条件渲染（流式输出场景例外）
- `SlashCommandPopover` / `MentionPopover`：浮动元素已统一，不改
- `ContextMenuShell` / `AgentPickerPopover`：同上
- `WalkthroughOverlay`：教程遮罩有特殊 z-index 和 spotlight 需求，保留独立实现
- `SidebarLayout` 拖拽覆盖层：`bg-background/80` 非 dismiss 型遮罩，语义不同
- `ChangesBanner` / `SpaceInitToast`：卡片本身的毛玻璃材质效果，非全屏遮罩
- `AgentsPanelAgentDetail` sticky header：header 元素的毛玻璃材质，非遮罩

### 破坏性变更

无。所有改动仅影响视觉表现和动画，不改变功能逻辑。

## 边界 case 与风险

| 边界 case | 处理方式 |
|-----------|---------|
| **FileTree 递归展开 + CSS Grid**：目录嵌套 5+ 层，每层都有 grid 动画 | 验证：每层独立动画，不会叠加延迟。`duration-200` 足够短，嵌套展开流畅 |
| **FileTree Space 左侧 amber 竖线**：当前用 `border-l-2` + `overflow-hidden`，改 grid 后竖线是否受影响 | 竖线在外层 div 上，grid 动画在内层，不冲突。需验证 |
| **DiscoverPanel 插件列表展开**：当前无动画直接显示，改 grid 后空 renderer 列表是否 layout shift | 空列表 `grid-rows-[0fr]` 高度为 0，无 shift |
| **`prefers-reduced-motion`**：CSS Grid transition 需要在 `reduced-motion` 下禁用 | globals.css 已有全局 `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; } }`，自动覆盖 |
| **shadcn dialog.tsx 被其他组件引用**：改 overlay 样式是否影响未审计的 dialog 用法 | 全局 grep `DialogOverlay` 确认所有消费者 |

**已知风险：**
- `FileTree` 是高频交互组件，改动需逐层验证（单层/多层/全展开/快速连续点击）
- `dialog.tsx` 是 shadcn 基础组件，改动影响所有使用 `<Dialog>` 的位置

## 验收标准

- [ ] **V-1** `FileTree` 目录展开/收起有 200ms 平滑过渡（CSS Grid），无 magic number `9999px`
- [ ] **V-2** `DiscoverPanel` 插件列表展开/收起有 200ms 平滑过渡
- [ ] **V-3** `AskModal`/`SettingsModal`/`SearchModal`/`ImportModal` 遮罩一致（`.modal-backdrop`）
- [ ] **V-4** `SkillDetailPopover`/`ConfirmDialog`/`dialog.tsx` 遮罩一致（`.overlay-backdrop`）
- [ ] **V-5** `ToolCallBlock`/`ThinkingBlock` 保留条件渲染，不受影响
- [ ] **V-6** `prefers-reduced-motion` 下所有动画被禁用
- [ ] **V-7** `wiki/21-design-principle.md` 更新展开动画 + 遮罩标准
- [ ] **V-8** 全量测试 `npx vitest run` 通过
- [ ] **V-9** FileTree Space amber 竖线在展开/收起时正常显示
