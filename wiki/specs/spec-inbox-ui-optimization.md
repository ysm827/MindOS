# Spec: 暂存台 (Inbox) UI 优化——一键整理 & 查看历史

## 目标

在暂存台页面中实现"一键整理" (One-Click Organize) 和"查看历史" (View History) 等核心操作功能，设计精美专业，提供卓越的用户体验。用户可以通过直观、高效的界面管理 Inbox 文件，支持快速组织、历史追踪、撤销操作。

## 现状分析

### 当前实现的功能
- **文件列表**：在首页 InboxSection 显示 5 个最近文件
- **AI 整理**："AI Organize" 按钮，一次整理所有 Inbox 文件
- **历史页面**：`/inbox/history` 提供完整历史（局部分页、按日期分组）
- **本地存储**：历史记录存于 localStorage，最多 50 条

### 当前的不足之处
1. **缺乏操作按钮工具栏**：一键整理、清空、选择性操作、导出等按钮分散或缺失
2. **历史查看体验不佳**：需要跳转到专门页面，缺乏内联预览和快速操作
3. **文件管理功能不完整**：
   - 无批量选择
   - 无标签 / 分类
   - 无搜索过滤
   - 无快捷键支持
4. **状态反馈不明确**：文件老化警告、组织中状态、撤销反馈需要更精细设计
5. **美观度不足**：按钮风格未充分利用 Warm Amber 主题，缺少视觉层级

## 数据流 / 状态流

```
┌─────────────────────────────────────────────────────────────┐
│                  InboxSection (Home)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ Header (标题 + 操作栏) ────────────────────────────┐  │
│  │ Icon + 标题 + 文件数  [Upload] [Organize] [⋯More]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 文件列表 (缩小后显示 5 个) ──────────────────────┐  │
│  │ • file1.md     [12m ago]      [delete]              │  │
│  │ • file2.txt    [2h ago] ⚠️     [delete]              │  │
│  │ • file3.csv    [1d ago]       [delete]              │  │
│  │ ⋯ 更多文件                                           │  │
│  │ [> View all files (8 total)]                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Drop Zone (always visible) ──────────────────────┐  │
│  │ [drag files here or] [upload]                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 最近历史 (Recently Processed) ─────────────────┐  │
│  │ ✅ 2 files · inbox · 15s · [> View all 24]       │  │
│  │ ✅ 3 files · import  · 42s                        │  │
│  │ ⚠️ 1 file  · undone                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 数据读写路径

| 组件 | 数据源 | 读/写 | 缓存层 | 说明 |
|------|--------|-------|--------|------|
| FileList | `/api/inbox` GET | 读 | 无（每次 fetch） | 获取 Inbox 文件列表 |
| Organize | `/api/organize` POST | 写 | localStorage (history) | 整理文件到知识库 |
| History | localStorage | 读/写 | localStorage | 本地历史记录 |
| Delete | `/api/inbox` DELETE | 写 | N/A | 归档到 .processed/ |

## 方案

### 1. 操作栏设计 (Action Bar)

在 InboxSection header 中增强操作栏，支持以下操作：

#### 按钮组 (Button Group)
```
[Upload ⬆️] [Organize ✨] [⋯ More] 
                             ├─ View All
                             ├─ Clear All
                             ├─ Select Multiple
                             ├─ Export
                             └─ Settings
```

**设计原则**：
- **主操作**（Organize）用 Amber CTA 按钮：`bg-[var(--amber)] text-[var(--amber-foreground)]`
- **次操作**（Upload）用 Secondary 按钮：icon + text（隐藏式）
- **More 菜单**用 Popover / Dropdown，支持键盘导航

### 2. 一键整理增强 (One-Click Organize)

#### 当前状态转换
```
[空] → [文件有] → [点击 Organize] → [整理中] → [完成] → [归档]
```

#### 新增功能
- **选择模式**：Cmd+A 或多选 Checkbox，整理部分文件
- **优先级排序**：按"最老 / 最新 / 最大"排序，优化整理顺序
- **批量操作**：
  - 整理所有
  - 删除所有
  - 导出所有（为 JSON / CSV）

#### 状态反馈
```
[整理中] → Toast 显示：
  ├─ 实时进度：Stage (analyzing → reading → writing)
  ├─ 每个文件的状态：✅ / ⏳ / ❌
  ├─ 预计剩余时间
  └─ [Undo All] 按钮（可撤销）
```

### 3. 历史查看体验 (History Experience)

#### 内联历史预览 (Inline History Preview)

在 InboxSection 下方保留最近 3 条历史，支持：
- **展开/折叠**：默认折叠，点击展开详情
- **文件链接**：Click 跳转到该文件
- **撤销按钮**：Per-file undo + Undo All
- **源标签**：Badge 显示 inbox / import / web-clip / plugin

#### 完整历史页面 (Full History Page)

增强 `/inbox/history` 页面：
- **搜索过滤**：按文件名、源、日期范围搜索
- **分页**：50 条一页，支持翻页
- **导出**：导出历史为 JSON / CSV
- **批量撤销**：Select + Undo

### 4. 文件管理增强

#### 多选模式 (Multi-Select)
- **Checkbox** 在每行左侧（hover 显示）
- **Cmd+A** 全选 / 取消全选
- **Shift+Click** 范围选择
- **上下文菜单** 支持批量操作

#### 快捷键支持
| 快捷键 | 功能 |
|--------|------|
| `Cmd+O` | 一键整理所有 |
| `Cmd+A` | 全选 / 取消全选 |
| `Delete` | 删除选中 |
| `Cmd+Shift+E` | 导出选中 |

### 5. 视觉设计 (Visual Design)

#### 色彩方案
- **主色**：Warm Amber `var(--amber)` = `#c8873a`
- **成功**：`var(--success)` = `#10b981`
- **警告**：`var(--amber)` (aging warning)
- **文本**：gray-700 (foreground) / gray-500 (secondary)

#### 按钮风格
```
Primary CTA (Organize):
  bg-[var(--amber)] text-[var(--amber-foreground)]
  hover:opacity-90
  disabled:opacity-50

Secondary (Upload):
  border border-border text-foreground
  hover:bg-muted

Ghost (Delete):
  text-destructive hover:bg-destructive/10
```

#### 间距规范 (Design Token)
| Element | Token |
|---------|-------|
| Header padding | 16px |
| File row height | 40px |
| Gap (horizontal) | 12px / 16px |
| Gap (vertical) | 8px / 16px |
| Rounded | rounded-lg |
| Shadow | shadow-sm |

### 6. 技术实现

#### 文件变更
1. **InboxSection.tsx** (component enhancement)
   - Add multi-select state
   - Add action bar with buttons
   - Enhance history preview with inline accordion

2. **新增 InboxActionBar.tsx** (new component)
   - Encapsulate header + buttons
   - Support keyboard shortcuts
   - Menu popover for "More" options

3. **新增 InboxHistoryDrawer.tsx** (new component)
   - Inline history preview with expand/collapse
   - Per-file undo + Undo All

4. **增强 /app/api/inbox 路由**
   - POST: `clear-all` 清空所有 Inbox
   - POST: `export` 导出为 JSON/CSV
   - DELETE: 支持 `names: string[]` 批量删除

5. **增强 organize-history.ts**
   - 支持批量撤销
   - 增加搜索/过滤方法

## 影响范围

### 变更文件列表
- `app/components/home/InboxSection.tsx` (改动)
- `app/components/home/InboxActionBar.tsx` (新增)
- `app/components/home/InboxHistoryDrawer.tsx` (新增)
- `app/lib/organize-history.ts` (增强)
- `app/app/api/inbox/route.ts` (增强 POST/DELETE)
- `app/components/home/index.tsx` (可能导入变更)

### 受影响的其他模块
- **InboxSection 依赖者**：Home 页面 → 无副作用（组件内聚）
- **全局事件**：`mindos:inbox-organize` / `mindos:organize-done` → 保持兼容
- **localStorage**：已用 `organize-history` key → 向下兼容

### 破坏性变更
**无**。所有改动都是增量的，向下兼容。

## 边界 Case 与风险

### 边界 Case 处理

| Case | 描述 | 处理方式 |
|------|------|---------|
| **空 Inbox** | 无文件时 | 显示空状态插图 + "drag files or upload" CTA |
| **文件超长名** | 名字 >100 字符 | `truncate text-ellipsis` + `title` tooltip |
| **并发操作** | 整理中又删除文件 | 锁定 Delete，提示 "organizing in progress" |
| **大量历史** | localStorage 满 (>50) | FIFO 自动删除最旧，提示 "history limit reached" |
| **网络失败** | 整理失败 / 删除失败 | Toast 错误 + Undo 按钮自动可用 |
| **多选边界** | Shift+Click 空范围 | 保持上次选择，无操作 |
| **导出大数据** | 50+ 文件导出 | 分块处理，避免 UI 冻结 |
| **浏览器离线** | 无网络时删除文件 | 文件仍在本地 Inbox，重试机制 |

### 已知风险与 Mitigation

| 风险 | 影响 | Mitigation |
|------|------|-----------|
| **localStorage 容量不足** | 历史记录无法保存 | 主动清理 >30 天旧记录，用户可手动导出备份 |
| **并发网络请求** | 删除 + 整理同时触发 | 添加 debounce，UI 层面锁定并发操作 |
| **性能下降** | >100 文件时列表卡顿 | 虚拟滚动 (virtualization)，暂存 5 + 按需加载 |
| **键盘快捷键冲突** | Cmd+A 与浏览器冲突 | 在 Inbox 区域获得焦点时才激活，其他地方无效 |

## 验收标准

### UI/UX 质量

- [ ] **视觉层级清晰**
  - 眯眼看，最重要元素最突出（Organize 按钮 > Upload > Delete）
  - 灰度下层级成立，不依赖色彩
  - 一切元素遵循 Warm Amber 主题色系

- [ ] **响应式设计**
  - Desktop (1440px)：所有按钮可见
  - Tablet (768px)：文本隐藏，仅图标 + tooltip
  - Mobile (375px)：More 菜单 + Bottom Action Sheet

- [ ] **操作流程符合预期**
  - 一键整理（不选）→ 整理所有
  - 多选 + 整理 → 仅整理选中
  - 撤销 → 文件恢复到 Inbox

- [ ] **性能指标**
  - 页面加载 <1s
  - 文件列表渲染 <200ms
  - 历史展开动画 <300ms

- [ ] **无障碍合规**
  - 所有按钮可用 Tab 导航 + Enter 触发
  - 多选 Checkbox 有 `aria-checked`
  - Toast 有 `role="status"` + `aria-live="polite"`
  - 焦点 ring 使用 `focus-visible:` + `ring-ring` (amber)

### 功能验收

- [ ] 一键整理按钮
  - 无文件时禁用（disabled）
  - 点击触发整理，按钮显示 loading 状态
  - 完成后显示 Toast + Undo 选项

- [ ] 多选模式
  - Checkbox 出现 / 消失正确
  - Cmd+A 全选 / 取消全选
  - Shift+Click 范围选择

- [ ] 历史管理
  - 历史记录正确保存到 localStorage
  - 内联预览显示最近 3 条
  - Undo 正确恢复文件到 Inbox

- [ ] 快捷键
  - Cmd+O → 整理所有
  - Cmd+A → 全选
  - Delete → 删除选中

- [ ] 删除 & 恢复
  - 删除时显示确认对话
  - 已删除文件移到 .processed/ 目录
  - Undo 从 .processed/ 恢复

### 测试覆盖

- [ ] 单元测试
  - `Inbox.test.tsx`：状态管理、事件处理
  - `organize-history.test.ts`：历史记录逻辑、撤销

- [ ] 集成测试
  - 文件上传 → 整理 → 历史 → 撤销 流程
  - 多选 → 删除 → 确认 → 恢复 流程

- [ ] 端到端测试 (E2E)
  - 用户完整操作流：drag → organize → undo
  - 键盘快捷键可用性

- [ ] 视觉回归测试
  - Desktop/Tablet/Mobile 断点截图
  - Dark/Light 主题检查

