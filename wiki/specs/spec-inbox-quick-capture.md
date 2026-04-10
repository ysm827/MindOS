# Spec: Inbox 快速捕获与一键整理

## 目标

让 MindOS 的知识捕获达到"拖即存"级别的零摩擦，同时让"整理"成为一个可延迟、可批量、可一键完成的独立动作。

## 现状分析

当前用户导入文件的流程：拖拽/⌘I → Import Modal → 选意图（Archive / AI Organize）→ 配置目标目录 → 提交。至少 3 步决策。对于"赶紧把东西丢进来"的场景摩擦过高。

模板系统中 `Notes/Inbox/` 的概念已存在，但仅作为文档约定，没有产品级支持。

## 数据流 / 状态流

```
  用户拖拽文件
       │
       ▼
  SidebarLayout (dragOverlay)
       │
       ├── [旧路径] 松手 → ImportModal → 选意图 → ...
       │
       └── [新路径] 松手 → POST /api/inbox/save
                              │
                              ├── 验证文件格式/大小
                              ├── PDF → /api/extract-pdf → 文本
                              ├── 其他 → 直接写入
                              ├── 写入 {mindRoot}/Inbox/{filename}
                              ├── 自动创建 Inbox/ Space（如不存在）
                              ├── 处理重名（追加 -1/-2）
                              └── 返回 { saved: string[], skipped: string[] }
                                        │
                                        ▼
                                  Toast 确认
                                  FileTree 刷新

  首页 InboxSection
       │
       ├── GET /api/inbox/list → 文件列表 + 元数据（大小、时间）
       │
       └── 点击 [AI 整理]
              │
              ▼
         useAiOrganize.start(inboxFiles, organizePrompt)
              │
              ├── POST /api/ask (mode: 'organize')
              │     工具集包含 move_file, create_file, write_file 等
              │
              └── OrganizeToast 显示进度 → 完成/错误
```

**读写组件：**
- **写数据：** SidebarLayout（拖拽 → API）、ImportModal（Inbox 意图 → API）
- **读数据：** HomeContent（InboxSection）、FileTree（Inbox 节点）
- **缓存：** `invalidateCache()` 在写入后调用；FileTree 通过 `mindos:files-changed` 事件刷新

## 方案

### 1. Inbox Space 管理（Core 层）

新增 `app/lib/core/inbox.ts`：
- `ensureInboxSpace(mindRoot)` — 如果 `Inbox/` 不存在则创建（含 INSTRUCTION.md + README.md）
- `listInboxFiles(mindRoot)` — 列出 Inbox 下所有文件及元数据
- `saveToInbox(mindRoot, files)` — 验证、转换、写入文件到 Inbox
- `INBOX_DIR = 'Inbox'` — 常量

Inbox INSTRUCTION.md 内容：告知 AI 这是暂存区，整理时应将文件分类到知识库的正确位置。

### 2. API 路由

新增 `app/app/api/inbox/route.ts`：
- `GET ?op=list` — 返回 Inbox 文件列表
- `POST op=save` — 保存文件到 Inbox（接受 `{ files: { name, content }[] }`）

### 3. 前端 — Quick Drop

修改 `SidebarLayout.tsx` 的 drag-drop 逻辑：
- 拖拽松手后不再打开 ImportModal
- 而是：读取文件内容 → POST /api/inbox/save → toast 确认
- Toast 包含 [整理] 按钮链接到 AI 整理流程
- 拖拽叠加层文案改为"拖放到 Inbox 快速保存"

### 4. 前端 — InboxSection

新增 `app/components/home/InboxSection.tsx`：
- 在首页 PinnedFiles 和 Spaces 之间渲染
- 空状态：引导文案
- 有文件：列表（最多 5 个）+ [AI 整理] 按钮 + [查看全部]
- 文件行：文件名 + 相对时间 + 7天+ 提示

### 5. 前端 — Import Modal 补充

修改 ImportModal 新增第三个意图 "存入 Inbox"：
- 选择后直接保存到 Inbox，关闭 Modal
- 与 Quick Drop 共用相同 API

### 6. FileTree Inbox 特殊渲染

修改 FileTree：
- Inbox Space 使用 `Inbox` 图标（lucide-react）替代 `Layers`
- 保持 amber 色

### 7. i18n

在 `knowledge.ts` 中新增 `inbox` 命名空间：
- 所有 Inbox 相关的 UI 文案（EN + ZH）

## 影响范围

### 变更文件列表

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/lib/core/inbox.ts` | 新增 | Inbox Space 管理逻辑 |
| `app/lib/core/index.ts` | 修改 | 导出 inbox 模块 |
| `app/app/api/inbox/route.ts` | 新增 | Inbox API 路由 |
| `app/components/home/InboxSection.tsx` | 新增 | 首页 Inbox 区块 |
| `app/components/HomeContent.tsx` | 修改 | 引入 InboxSection |
| `app/components/SidebarLayout.tsx` | 修改 | 拖拽改为 Quick Drop |
| `app/components/ImportModal.tsx` | 修改 | 新增 Inbox 意图 |
| `app/components/FileTree.tsx` | 修改 | Inbox 特殊图标 |
| `app/lib/i18n/modules/knowledge.ts` | 修改 | Inbox i18n 键 |
| `app/__tests__/core/inbox.test.ts` | 新增 | 核心逻辑测试 |
| `app/__tests__/home/inbox-section.test.tsx` | 新增 | UI 测试 |

### 受影响但不修改的模块

- **OrganizeToast** — 无需改动，AI 整理复用现有 `useAiOrganize`
- **useFileImport** — Inbox 路径不走 Import hook，独立 API
- **FileTree 右键菜单** — Inbox 作为 Space 已有"Edit Rules"等菜单，无需特殊处理

### 破坏性变更

无。拖拽行为从"打开 Modal"变为"直接存 Inbox"，但 ⌘I 仍可打开 Modal 做精细导入。

## 边界 case 与风险

| # | 边界 case | 处理方式 |
|---|-----------|---------|
| 1 | Inbox 目录被用户手动删除 | `ensureInboxSpace()` 在每次写入前检查并自动重建 |
| 2 | 重名文件 | 追加 `-1`、`-2` 后缀（与 Import 现有行为一致） |
| 3 | PDF 文件（二进制） | 调用 `/api/extract-pdf` 提取文本后存为 `.md` |
| 4 | 不支持的文件格式 | 跳过并在 toast 中提示 |
| 5 | 文件 >5MB | 保存但截断内容到 CLIENT_TRUNCATE_CHARS |
| 6 | 拖入 20+ 文件 | 全部处理，无数量上限（与 FS 写入能力一致） |
| 7 | AI 整理后文件仍在 Inbox | 正常——AI 可能决定某些文件留在 Inbox 或创建新文件 |
| 8 | 知识库路径未配置 | API 返回 400，toast 显示"请先配置知识库" |
| 9 | 并发拖拽（多次快速拖放） | 每次独立调用 API，重名自动去重 |

### 已知风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 拖拽行为变更可能让习惯 Modal 的用户困惑 | 中 | Import Modal 仍可通过 ⌘I 访问；首次使用 toast 文案引导 |
| Inbox 成为永久垃圾场 | 中 | 7天+ 文件显示 amber 提示；未来可加 Echo 面板联动 |
| 大量文件批量 AI 整理 token 消耗高 | 低 | 客户端截断 20k 字符/文件；maxSteps=15 |

## 验收标准

- [ ] 拖拽文件到 MindOS 窗口 → 文件保存到 Inbox/ → toast 确认（<500ms 反馈）
- [ ] 首页显示 InboxSection，列出 Inbox 文件 + 计数 + 时间
- [ ] Inbox 为空时显示引导文案
- [ ] 7天+ 的文件显示 amber 提示标记
- [ ] 点击 [AI 整理] 触发批量 organize → OrganizeToast 显示进度和结果
- [ ] Import Modal 新增 "存入 Inbox" 意图，功能与 Quick Drop 一致
- [ ] FileTree 中 Inbox 使用特殊图标
- [ ] Inbox 不存在时自动创建（含 INSTRUCTION.md）
- [ ] 重名文件自动追加后缀
- [ ] 不支持格式的文件被跳过并提示
- [ ] i18n 完整（EN + ZH）
- [ ] 核心逻辑测试覆盖正常/边界/错误路径
- [ ] 全量测试通过（`npx vitest run`）
