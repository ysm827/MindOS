# Spec: Ask Panel Focus Mode + 宽度扩展

## 目标

让 Ask AI Panel 支持更大的拖拽宽度（最大覆盖 content 区域），并将 Maximize 按钮改为 Focus Mode（一键平滑展开到最大宽度），消除当前 maximize 的突兀布局切换。

## 现状分析

当前 Ask Panel 有 3 种形态：Side Panel（380-700px）、Popup Modal、Maximized。

问题：
1. **拖拽上限太低**：max 700px / 45% viewport，长代码块仍然换行
2. **Maximize 实现粗暴**：从 `width` 属性切到 `left` 定位，导致布局跳变（"左右弹出来"）
3. **Popup 模式与 Panel 场景重叠**：增加用户选择成本

## 数据流 / 状态流

```
useAskPanel (hook)
  ├── askPanelWidth: number        ← 拖拽 / Focus toggle 时更新
  ├── askMaximized: boolean        ← Focus 按钮 toggle
  └── prevWidth: number (新增)     ← 进入 Focus 前保存当前宽度

RightAskPanel (component)
  ├── useResizeDrag(maxWidth, maxWidthRatio)  ← 拖拽约束
  └── style={{ width }}                        ← 统一用 width（删除 left 分支）

SidebarLayout (CSS)
  └── --right-panel-width: askMaximized
        ? calc(100vw - rail - sidebar)         ← Focus 时动态计算
        : askPanelWidth                        ← 正常时用拖拽宽度
```

关键变更：
- `RightAskPanel` 不再有两套定位逻辑（`width` vs `left`），统一用 `width`
- `useResizeDrag` 的 `maxWidth` 和 `maxWidthRatio` 放宽
- Focus 模式下 `askPanelWidth` 被设为动态最大值，退出时恢复 `prevWidth`

## 方案

### 变更 1：放宽拖拽上限
- `MAX_WIDTH_ABS`: 700 → 1400
- `MAX_WIDTH_RATIO`: 0.45 → 0.92

### 变更 2：统一 Focus Mode 实现
- 删除 `RightAskPanel` 中 `maximized ? { left } : { width }` 的分支
- Focus 模式下：计算目标宽度 = `window.innerWidth - sidebarOffset`，设为 `askPanelWidth`
- 进入 Focus 前保存 `prevWidth`，退出时恢复
- `useAskPanel` 新增 `prevWidthRef` 存储进入 Focus 前的宽度

### 变更 3：Esc 退出 Focus
- 在 `RightAskPanel` 或 `AskContent` 中监听 Esc 键，如果 `maximized` 则退出

### 变更 4：i18n 更新
- `maximizePanel` → `focusMode` / `Focus Mode`
- `restorePanel` → `exitFocusMode` / `Exit Focus`

## 影响范围

- `app/components/RightAskPanel.tsx` — 删除 left 定位分支，统一 width，Esc 键监听
- `app/hooks/useAskPanel.ts` — prevWidthRef，toggleAskMaximized 逻辑调整
- `app/components/SidebarLayout.tsx` — --right-panel-width CSS 计算简化
- `app/lib/i18n/modules/ai-chat.ts` — 更新 maximize/restore 文案
- `app/components/AskModal.tsx` — 不变（保留 popup 模式，本次不删除）
- `app/components/ask/AskContent.tsx` — 图标保持 Maximize2/Minimize2，title 文案更新

不受影响：
- `AskContent` 内部逻辑（消息、session、@ mention）完全不变
- `useResizeDrag` hook 接口不变，只是传入更大的参数

## 边界 case 与风险

1. **窗口 resize 导致 panel 超宽** → `useResizeDrag` 已有 `Math.min(maxWidth, viewport * ratio)` clamp
2. **Focus 时 sidebar 开关** → SidebarLayout 的 CSS 动态计算 `sidebarOffset`，自动适配
3. **Focus 后关闭 Panel 再打开** → closeAskPanel 已设 `askMaximized = false`，重新打开时用 prevWidth
4. **连续快速点击 Focus 按钮** → toggle 是同步 setState，React batch 确保正确
5. **localStorage 存储的宽度超过新上限** → 加载时 clamp 到 maxWidth

风险：
- `--right-panel-width` CSS 变量被 TOC 组件使用，确认 TOC 在 Focus 时正确偏移 → 已验证，TOC 的 `right: var(--right-panel-width)` 会自动适配
- Focus 时 content 被完全覆盖，用户可能误以为文件丢失 → Focus 按钮图标清晰（Minimize2 表示可恢复），且 sidebar 可见作为锚点

## 验收标准

- [ ] 拖拽 Panel 左边缘可扩展到 ≥ 92% viewport 宽度
- [ ] 拖拽过程中 Content 区域实时收窄，无跳变
- [ ] 点击 Focus 按钮，Panel 平滑展开覆盖 Content（transition 动画）
- [ ] Focus 模式下 Sidebar 保持可见、可交互
- [ ] Focus 模式下点 Restore 按钮，Panel 平滑收缩回之前宽度
- [ ] Focus 模式下按 Esc，Panel 收缩回之前宽度
- [ ] 导航到其他页面时自动退出 Focus（已有逻辑）
- [ ] Panel 关闭后重新打开，宽度恢复为 Focus 前的宽度（非 Focus 宽度）
- [ ] Focus 时 TOC 正确偏移，不被遮盖
- [ ] i18n 文案更新（en + zh）
- [ ] 所有测试通过
