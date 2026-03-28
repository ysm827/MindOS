# Spec: UI 审计修复（2026-03-27）

## 目标

修复 `wiki/reviews/ui-audit-2026-03-27.md` 中发现的 P2 + P3 级别 UI/UX 问题，提升可访问性、交互反馈和视觉一致性。P1（技能列表虚拟化）作为独立 epic 后续处理。

## 现状分析

2026-03-27 的全面 UI 审计覆盖 17 个页面、68 张截图，发现 9 个问题（1 P1 + 3 P2 + 5 P3）。MindOS 的设计系统（Warm Amber + 双主题 + CSS token 体系）整体成熟，问题集中在**可访问性细节**和**UX 一致性**上。

## 数据流 / 状态流

本次修复不涉及新的数据流，改动集中在展示层：

```
globals.css (token 调整)
  ↓
components/*.tsx (UI 组件改动)
  ↓
pages/*.tsx (页面级改动)
```

无 API 变更、无状态管理变更、无数据库变更。

## 方案

### 修复范围与分批策略

| 批次 | 编号 | 问题 | 文件 | 改动类型 |
|------|------|------|------|---------|
| **Batch 1** | P2-2 | 琥珀色文字对比度不足 | `globals.css` + 多个组件 | CSS token + className |
| **Batch 1** | P2-3 | 通知横幅持续显示 | 通知组件 | useEffect + state |
| **Batch 1** | P2-4 | 浮动按钮无 tooltip | 浮动按钮组件 | shadcn/ui Tooltip |
| **Batch 2** | P3-8 | 用例卡片截断不一致 | `/explore` 组件 | Tailwind class |
| **Batch 2** | P3-9 | 操作类型徽章无按类型着色 | `/changes` 组件 | 条件 className |
| **Batch 2** | P3-5 | 代理未找到页面空旷 | `/agents/[key]` | JSX + i18n |
| **后续** | P1-1 | 技能列表虚拟化 | `AgentsSkillsSection.tsx` + API | 架构级改动 |
| **后续** | P3-6 | 帮助页面悬浮目录 | `/help` | 新组件 |
| **后续** | P3-7 | Echo 侧边栏利用不足 | `/echo` | 设计决策 |

### 各问题详细修复方案

#### P2-2: 琥珀色文字对比度

**根因**：`--amber`（`#c8873a`）在浅色背景（`#f8f6f1`）上对比度约 3.2:1，不满足 WCAG AA 正文标准 4.5:1。

**方案**：
1. 在 `globals.css` 中新增 `--amber-text` token，比 `--amber` 加深约 15%
2. 所有小字号（< 18px）琥珀色文字改用 `--amber-text`
3. 大字号标题和图标保留 `--amber`（满足 3:1 大字标准）
4. 暗色模式下同步调整

**需验证的文件**（grep `text-[var(--amber)]` 和 `text-amber`）：
- 状态徽章（"Connected" / "Detected"）
- 筛选胶囊
- 用户自定义 skill 标签（`bg-[var(--amber-dim)] text-[var(--amber)]`）

#### P2-3: 通知横幅自动消失

**根因**：通知横幅（"N content changes unread"）无自动消失逻辑，每个页面持续显示。

**方案**：
1. 添加 `useEffect` + `setTimeout(10000)` 自动隐藏
2. 隐藏后设 `sessionStorage` 标记，同一会话内不再重复显示
3. 点击横幅跳转 `/changes` 后也标记为已读
4. 保留手动关闭按钮（X）

#### P2-4: 浮动按钮 tooltip

**根因**：右下角 MindOS Agent 按钮（琥珀色齿轮）无任何文字提示。

**方案**：
1. 使用项目已有的 shadcn/ui `Tooltip` 组件包裹
2. Tooltip 内容：`"Ask AI"` / `"AI 助手"`（跟随 i18n）
3. 添加 `aria-label` 属性
4. 移动端用 `title` 属性兜底

#### P3-5: 代理未找到页面空旷

**方案**：
1. 添加"可能的操作"区块：链接到 `/agents` 总览
2. 显示已有代理列表前 3 个作为建议
3. 添加排查步骤提示（"代理可能已断开连接或被移除"）

#### P3-8: 用例卡片截断不一致

**方案**：统一使用 `line-clamp-2` Tailwind class，确保所有卡片描述截断在 2 行。

#### P3-9: 操作类型徽章着色

**方案**：
```
create_file  → bg-success/10 text-success   (绿色)
update_lines → bg-[var(--amber-dim)] text-[var(--amber)]  (琥珀色，保持现有)
delete_file  → bg-destructive/10 text-destructive  (红色)
rename_file  → bg-muted text-muted-foreground  (灰色)
```
使用已有的语义色 token，不引入新颜色。

## 影响范围

- **变更文件**（预估）：
  - `app/app/globals.css` — 新增 `--amber-text` token
  - 通知横幅组件 — 自动消失逻辑
  - 浮动按钮组件 — Tooltip 包裹
  - `/agents/[key]` 页面 — 空状态增强
  - `/explore` 用例卡片 — line-clamp 统一
  - `/changes` 徽章组件 — 条件着色
  - i18n 文件 — 新增 tooltip / 空状态文案
- **不受影响的模块**：API 层、MCP 层、核心 lib、测试基础设施
- **无破坏性变更**：所有改动向后兼容

## 边界 case 与风险

1. **`--amber-text` 在暗色模式下可能过亮** → 需同时定义 `.dark` 变体，亮色加深、暗色适度调亮
2. **通知横幅 10s 消失后用户想看** → sessionStorage 只阻止自动弹出，用户仍可通过 `/changes` 手动查看
3. **Tooltip 在触摸设备上不触发** → 使用 `title` 属性兜底 + 按钮本身可点击进入 AI 面板
4. **操作类型着色与现有语义色冲突** → 复用 `--success` / `--destructive` token，不引入新颜色
5. **line-clamp-2 对超短描述无效果** → 无害，短文本本身不截断

## 验收标准

- [ ] P2-2: 所有小字号琥珀色文字在亮/暗模式下对比度 ≥ 4.5:1（使用浏览器开发工具验证）
- [ ] P2-3: 通知横幅在 10s 后自动消失；同一会话内不重复显示；点击后跳转 `/changes`
- [ ] P2-4: 浮动按钮 hover 显示 tooltip（中英文）；有 `aria-label`
- [ ] P3-5: `/agents/<不存在的key>` 页面显示建议代理列表 + 返回总览链接
- [ ] P3-8: `/explore` 所有卡片描述截断在 2 行，高度一致
- [ ] P3-9: `/changes` 徽章按操作类型着色（create=绿/delete=红/update=琥珀/rename=灰）
- [ ] 全量测试通过（`npx vitest run`）
- [ ] 无新增硬编码 hex 色值
- [ ] 无新增 inline style

## 执行步骤（供下次 `/fix-review` 使用）

```bash
# 1. 启动开发服务器
cd app && npm run dev

# 2. 按 Batch 顺序修复，每条完成后微提交
# Batch 1: P2-2 → P2-3 → P2-4
# Batch 2: P3-8 → P3-9 → P3-5

# 3. 跑测试
npx vitest run

# 4. Playwright 截图对比
# npx playwright test --project=chromium

# 5. Squash + commit
```
