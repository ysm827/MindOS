# Spec: 文件导入 — 归档 & AI 整理双路径 (File Import: Archive & AI Digest)

## 目标

让用户通过一个统一入口上传外部文件，然后根据意图选择两条路径：

- **归档**：把文件原样存入知识库的指定空间，自动更新关联索引
- **AI 整理**：让 Agent 阅读文件内容，提取要点并沉淀到已有文档中

核心价值：**一次拖拽，两种归宿——快速归档不用想，深度整理交给 AI**。

## 现状分析

### 当前能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 上传文件到 AI 对话 | ✅ 已有 | `useFileUpload` hook：支持 .txt/.md/.pdf 等 10 种格式，作为聊天附件注入 Agent context |
| Agent 理解文件并写入 KB | ✅ 已有 | Agent 可调用 `create_file` / `insert_after_heading` 等工具，但需要用户手动附件 + 手动写 prompt |
| 单文件创建 | ✅ 已有 | `POST /api/file { op: "create_file" }`，Agent 工具 `create_file` |
| 批量创建文件 | ✅ 已有 | Agent 工具 `batch_create_files` |
| 文件移动 + 反向链接检测 | ✅ 已有 | `moveFile()` 返回 `affectedFiles` |
| 空间自动创建 | ✅ 已有 | `scaffoldIfNewSpace()` |
| PDF 文本提取 | ✅ 已有 | `POST /api/extract-pdf` — pdfjs-dist |
| 文件直接导入知识库 | ❌ 缺失 | 没有"上传 → 写入 MIND_ROOT"的确定性 UI 流程 |
| 一键"让 AI 帮我整理" | ❌ 缺失 | 能力存在（Agent + 工具），但缺少产品化入口——用户需要手动走 3 步：打开 Ask → 附件 → 写 prompt |
| 智能归档（自动选择空间） | ❌ 缺失 | 没有基于内容推断目标空间的逻辑 |
| 导入后关联式多文件更新 | ❌ 缺失 | 归档后不会自动更新 README / 反向链接 |

### 两种用户意图对比

| 维度 | 归档（Archive） | AI 整理（Digest） |
|------|----------------|-------------------|
| 一句话描述 | "把这个文件放到合适的地方" | "读懂里面的内容，更新我的知识" |
| 操作结果 | KB 多 1 个文件 | KB 中 N 个已有文件被更新/新增 |
| 需要 AI？ | 不需要（确定性 UI） | 必须（需要理解内容 + 判断写哪里） |
| 确定性 | 高——用户选空间，所见即所得 | 低——AI 决策，用户需确认 |
| 典型场景 | 会议纪要存档、文章收藏、CSV 数据导入 | 读论文提取方法论、对话沉淀为 SOP、简历拆解为身份信息 |

### 为什么需要产品化

1. **归档路径**：`useFileUpload` 只作为聊天附件，不持久化；`create_file` 需要手动指定路径。用户缺一个"拖进来 → 选空间 → 完成"的确定性流程。
2. **AI 整理路径**：能力已有（Agent + 工具），但入口埋太深——需要用户知道 Ask 面板 → 手动附件 → 手动写 prompt。应该把这 3 步压缩为 1 步。
3. 两种意图混在一起会互相干扰——强制用户事先区分又增加认知负担。需要一个统一入口 + 分叉点。

## 数据流 / 状态流

### 核心流程（双路径）

```
用户拖拽 / 选择 / 粘贴文件
          │
          ▼
┌──────────────────────────────────────────────────────┐
│  ImportModal (Step 1: 选文件)                         │
│  1. 读取文件内容（File API / FileReader）              │
│  2. 文件类型检测 + 预览                               │
│  3. 展示意图选择：                                     │
│     ┌─────────────────┐  ┌──────────────────────┐     │
│     │  📥 存入空间      │  │  🤖 让 AI 帮我整理    │     │
│     │  原样归档到知识库  │  │  提取要点沉淀到文档   │     │
│     └────────┬────────┘  └──────────┬───────────┘     │
└──────────────┼──────────────────────┼─────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌────────▼─────────────┐
    │  Path A: 归档        │  │  Path B: AI 整理      │
    │                      │  │                       │
    │  Step 2a:            │  │  关闭 Modal            │
    │  · 选择目标空间       │  │  打开 Ask 面板          │
    │  · 预览目标路径       │  │  自动附上文件           │
    │  · 冲突策略选择       │  │  预填 prompt：          │
    │                      │  │  "请阅读这些文件，      │
    │  Step 3a:            │  │   提取要点整理到        │
    │  POST /api/file/import│  │   知识库中"            │
    │  · 写入文件           │  │                       │
    │  · 更新 README 索引   │  │  用户可编辑 prompt     │
    │  · 扫描关联文件       │  │  → 发送 → Agent 执行   │
    │                      │  │                       │
    │  Step 4a:            │  │  （复用现有 Agent 流）  │
    │  Toast 反馈结果       │  │                       │
    └──────────────────────┘  └───────────────────────┘
```

### 状态流（前端）

```
                          ┌→ archive_config → importing → done / error
idle → file_selected → ──┤
                          └→ redirect_to_ask (Modal 关闭, Ask 面板打开)
```

### Path A: 归档——服务端数据流

```
POST /api/file/import
  │
  ├─ validate (size, type, path safety)
  ├─ convert format if needed (txt→md, pdf→md, etc.)
  ├─ resolve target path (space + sanitized filename)
  ├─ check conflict → skip / rename / overwrite
  ├─ coreCreateFile() (atomic: temp + rename)
  ├─ organizeAfterImport():
  │    ├─ updateSpaceReadme() — 追加条目到 README.md
  │    └─ scanRelatedFiles() — 报告（不自动修改）
  │
  └─ invalidateCache() + revalidatePath('/') + dispatch('mindos:files-changed')
```

### Path B: AI 整理——数据流（复用现有架构）

```
ImportModal → close
  │
  ├─ 打开 Ask 面板 (setAskOpen(true))
  ├─ 注入文件到 upload.localAttachments
  ├─ 预填 input（suggestedPrompt）
  │
  └─ 用户发送 → POST /api/ask
       └─ Agent context 中包含 "⚠️ USER-UPLOADED FILES"
       └─ Agent 自行决定调用 create_file / insert_after_heading / write_file 等
```

## 方案

### Phase 1: 归档基础设施 + 双路径前端

一次性交付完整的用户体验：拖文件 → 选意图 → 归档 or AI 整理。

#### 1.1 格式转换层 `app/lib/core/file-convert.ts`

```typescript
interface ConvertResult {
  content: string;       // 转换后的 markdown 内容
  originalName: string;  // 原始文件名
  targetName: string;    // 建议的目标文件名（.md 或保留原格式）
  metadata?: Record<string, string>; // 提取的元数据（标题、日期等）
}

function convertToMarkdown(fileName: string, rawContent: string): ConvertResult;
```

| 源格式 | 转换策略 | 备注 |
|--------|---------|------|
| `.md` | 直接使用 | 无需转换 |
| `.txt` | 包裹为 markdown（添加 `# 标题` 从文件名推断） | |
| `.pdf` | 复用 `extract-pdf` 提取文本 → markdown | 已有基础设施 |
| `.csv` | 直接拷贝（KB 原生支持 .csv） | 不转 md |
| `.json` | 直接拷贝（KB 原生支持 .json） | 不转 md |
| `.yaml/.yml` | 转为 frontmatter + code block | |
| `.html` | 提取正文文本，转为 markdown（turndown / 简单 regex） | |
| `.xml` | 包裹为 code block | |

#### 1.2 API 端点 `POST /api/file/import`（归档路径专用）

```typescript
// Request
interface ImportRequest {
  files: Array<{
    name: string;           // 原始文件名
    content: string;        // 文件内容（text）或 base64（binary）
    encoding?: 'text' | 'base64';
  }>;
  targetSpace?: string;     // 目标空间路径（如 "Notes"），空则放根目录
  organize?: boolean;       // 是否执行关联更新（默认 true）
  conflict?: 'skip' | 'rename' | 'overwrite'; // 默认 rename
}

// Response
interface ImportResponse {
  created: Array<{ original: string; path: string }>;
  skipped: Array<{ name: string; reason: string }>;
  errors: Array<{ name: string; error: string }>;
  updatedFiles: string[];   // 被关联更新的文件列表（如 README）
}
```

#### 1.3 关联更新逻辑 `app/lib/core/organize.ts`

归档完成后自动执行：

1. **更新空间 README**：在目标空间的 `README.md` 中追加新文件条目
2. **关联文件扫描**：扫描 KB 中是否有文件提到了新导入文件的主题关键词，在 `updatedFiles` 中报告（不自动修改正文）
3. **内容变更日志**：调用 `appendContentChange()` 记录导入事件

```typescript
interface OrganizeResult {
  readmeUpdated: boolean;
  relatedFiles: Array<{ path: string; matchType: 'backlink' | 'keyword' }>;
}

function organizeAfterImport(
  mindRoot: string,
  createdFiles: string[],
  targetSpace: string,
): Promise<OrganizeResult>;
```

#### 1.4 前端交互

##### 设计原则

1. **不新增 chrome**：不在 Sidebar 头部加按钮。导入入口融入已有交互模式（`+` 按钮、右键菜单、拖拽）。
2. **上下文优先**：用户在哪个空间操作，就默认导入到那个空间。
3. **Progressive Disclosure**：先选文件，再选意图，再配置细节——每一步只暴露当前需要的信息。
4. **安全默认**："存入知识库"（确定性、可预测）为默认高亮选项，AI 整理为次要选项。

##### 入口设计

**入口 1：空间/文件夹 `+` 按钮扩展为下拉菜单**（主入口）

当前每个目录 hover 时右侧显示 `[+]`（新建文件）。改为点击后弹出轻量 Popover：

```
hover 空间 →  右侧出现 [+] [📜]
               点击 [+]
                 ↓
  ┌─────────────────────────┐
  │  📄 新建文件             │
  │  📥 导入文件到此空间      │
  └─────────────────────────┘
```

实现细节：
- 复用 `ContextMenuShell` 组件（已有），锚点在 `+` 按钮位置
- 选 "新建文件" → 沿用现有 `NewFileInline` 行为（内联输入框）
- 选 "导入文件" → 打开 `ImportModal`，`targetSpace` 预填为当前空间路径
- Popover 出现用 `opacity 0→1 + translateY(-4→0)`，150ms ease-out
- 点击外部或选择后自动关闭

文件变更：`FileTree.tsx` — `DirNode` 组件内 `+` 按钮的 `onClick` 改为 toggle Popover state

**入口 2：空间右键菜单**

在 `SpaceContextMenu` 中追加 "导入文件" 菜单项（在 "编辑规则" 下方）：

```
右键空间 →
  ┌──────────────────────────┐
  │  📜 编辑规则              │
  │  📥 导入文件              │  ← 新增，Lucide: FolderInput
  │  ✏️ 重命名                │
  │  ───────────────────────  │
  │  🗑 删除空间              │
  └──────────────────────────┘
```

实现细节：
- 使用 `FolderInput` 图标（Lucide），14px，与其他项一致
- 点击后关闭 ContextMenu → 打开 `ImportModal`（`targetSpace` = 该空间路径）
- 文件变更：`FileTree.tsx` — `SpaceContextMenu` 函数组件内新增按钮

**入口 3：全局拖拽（Drop Zone overlay）**

从桌面拖文件到 MindOS 窗口任意位置时，显示全屏半透明蒙层提示放置：

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │                                              │  │
│  │        松开鼠标，导入文件到知识库              │  │
│  │                                              │  │
│  │        ┌──────────────────┐                  │  │
│  │        │   FolderInput    │                  │  │
│  │        │    (icon 48px)   │                  │  │
│  │        └──────────────────┘                  │  │
│  │                                              │  │
│  │   支持 .md .txt .pdf .csv .json .yaml .html  │  │
│  │                                              │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

实现细节：
- 在 `SidebarLayout.tsx` 的根容器上监听 `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop`
- `dragEnter` 时显示 overlay（`fixed inset-0 z-50`），背景 `bg-background/80 backdrop-blur-sm`
- 中心区域使用虚线边框 `border-2 border-dashed border-[var(--amber)]/50 rounded-xl`
- `dragLeave`（离开窗口）或 `drop` 时隐藏 overlay
- `drop` 时读取 `e.dataTransfer.files` → 打开 `ImportModal`，文件预填充
- 过渡动画：overlay 出现 `opacity 0→1`，200ms ease-out
- 仅在拖拽的文件类型命中白名单时显示 overlay（`e.dataTransfer.types.includes('Files')`）

**入口 4：快捷键 `Ctrl+I` / `⌘I`**

在 `SidebarLayout.tsx` 的全局 `keydown` handler 中注册（与 `⌘K`/`⌘/`/`⌘,` 同级）：

```typescript
if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
  e.preventDefault();
  setImportModalOpen(v => !v);
}
```

- 打开 ImportModal（无预选空间，无预填文件——用户在 Modal 内选择）

**入口 5：Onboarding 空状态引导**（新用户发现路径）

在 `OnboardingView`（KB 为空时的首页）中，现有模板选择区域下方或旁边，添加一行引导：

```
── 或者 ──────────────────────────

已有笔记？ [导入文件到知识库 →]
```

- 轻量文字链接样式（`text-[var(--amber)] hover:underline`），不抢模板卡片的视觉权重
- 点击 → 打开 ImportModal

##### ImportModal 设计

**总体规格**
- 宽度：`max-w-lg`（32rem / 512px），居中弹出
- 背景：`bg-card`，圆角 `rounded-xl`，阴影 `shadow-xl`
- 遮罩：`bg-black/60 backdrop-blur-sm`
- 出场动画：overlay `opacity 0→1` 200ms + modal `opacity 0→1, scale(0.98)→scale(1)` 200ms ease-out
- 离场动画：反向 150ms（exit-faster-than-enter）
- 关闭方式：`×` 按钮、`Escape` 键、点击遮罩

**Step 1：选择文件 + 选择意图**

用户打开 ImportModal 后看到的首屏。如果是从拖拽进入，文件列表已填充。

```
┌──────────────────────────────────────────────────┐
│                                             [×]  │
│                                                  │
│  导入文件                                        │
│  将外部文件存入知识库或让 AI 帮你整理              │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │                                          │    │
│  │      (FolderInput icon, 32px, amber/30)  │    │
│  │                                          │    │
│  │    拖拽文件到这里，或 [点击选择]           │    │
│  │                                          │    │
│  │    .md  .txt  .pdf  .csv  .json  .yaml   │    │
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ── 这是无文件时的初始状态 ──                     │
│  ── 选择文件后，下方区域展开 ──                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

选择文件后，DropZone 收缩，文件列表 + 意图选择区展开：

```
┌──────────────────────────────────────────────────┐
│                                             [×]  │
│                                                  │
│  导入文件                                        │
│  将外部文件存入知识库或让 AI 帮你整理              │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  拖拽更多文件，或 [点击添加]              │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  2 个文件                            [清空全部]  │
│  ┌──────────────────────────────────────────┐    │
│  │  FileText  meeting-notes.txt    2.1 KB  ×│    │
│  │  FileText  research-paper.pdf  840 KB   ×│    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─────────────────────┐ ┌────────────────────┐  │
│  │                     │ │                    │  │
│  │  FolderInput (icon) │ │  Sparkles (icon)   │  │
│  │                     │ │                    │  │
│  │  存入知识库          │ │  AI 帮我整理       │  │
│  │                     │ │                    │  │
│  │  原样保存到指定空间  │ │  阅读内容，提取    │  │
│  │  适合归档、收藏     │ │  要点沉淀到已有    │  │
│  │                     │ │  笔记中            │  │
│  └─────────────────────┘ └────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**意图卡片设计细节**：
- 两张卡片等宽，水平排列，`gap-3`
- 卡片样式：`border border-border rounded-lg p-4 cursor-pointer transition-all duration-150`
- 默认状态：`bg-card hover:border-[var(--amber)]/50 hover:shadow-sm`
- "存入知识库" 卡片默认有微弱的 amber 边框高亮（`border-[var(--amber)]/30`）表示推荐
- 图标：`FolderInput`（存入）/ `Sparkles`（AI 整理），24px，`text-[var(--amber)]`
- 标题：`text-sm font-medium text-foreground`
- 描述：`text-xs text-muted-foreground mt-1`
- 点击反馈：`active:scale-[0.98]` 150ms

**文件列表项设计**：
- 每行：`flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50`
- 图标：`FileText` 14px `text-muted-foreground`
- 文件名：`text-sm text-foreground truncate`
- 大小：`text-xs text-muted-foreground tabular-nums`
- 删除：`×` 按钮，`text-muted-foreground hover:text-foreground`，14px
- 错误文件（类型不支持）：行背景 `bg-error/5`，文件名后显示 `text-xs text-error` 提示

**Step 2a：归档配置**（选择 "存入知识库" 后）

卡片区域 slide-out，配置区域 slide-in（共享容器高度过渡，200ms ease-out）：

```
┌──────────────────────────────────────────────────┐
│                                             [×]  │
│                                                  │
│  存入知识库                            ← 返回    │
│                                                  │
│  2 个文件                                        │
│  ┌──────────────────────────────────────────┐    │
│  │  FileText  meeting-notes.txt             │    │
│  │            → Notes/meeting-notes.md      │    │
│  │  FileText  research-paper.pdf            │    │
│  │            → Notes/research-paper.md     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  目标空间                                        │
│  ┌──────────────────────────────────────────┐    │
│  │  ▼  Notes                                │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  同名文件已存在时                                 │
│  ○ 自动重命名（添加序号后缀）                     │
│  ○ 跳过不导入                                    │
│  ○ 覆盖已有文件                                  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  [取消]                    [存入 2 个文件] │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

配置区设计细节：

- **← 返回**：文字按钮（`text-sm text-muted-foreground hover:text-foreground`），点击回到 Step 1 卡片选择
- **文件列表**：每行两行——文件名 + 目标路径预览（`text-xs text-muted-foreground`，箭头用 `→`）
- **空间选择器**：原生 `<select>` 或自定义下拉。列出所有已有空间（从 `listMindSpaces()` 获取），+ "根目录" 选项。如果 Modal 打开时有 `targetSpace`（从右键菜单进入），则预选
- **冲突策略**：Radio group，默认选 "自动重命名"。`text-sm`，每项 `py-1`
- **CTA 按钮**：`bg-[var(--amber)] text-[var(--amber-foreground)] rounded-lg px-4 py-2 text-sm font-medium`
  - 显示文件计数："存入 2 个文件"
  - 导入中：文字变为 "正在存入..."，按钮 `disabled`，显示 `Loader2 animate-spin`
  - 成功：按钮短暂变绿 `bg-success` + `Check` 图标，300ms 后 Modal 自动关闭
- **取消**：`text-sm text-muted-foreground hover:text-foreground`，ghost 样式

**Step 2b：AI 整理路径——Ask 面板注入**

选择 "AI 帮我整理" 后的流程（约 400ms 内完成）：

```
1. ImportModal 执行离场动画（150ms fade-out + scale(0.98)）
2. 触发 Ask 面板打开：
   - 调用 useFileUpload.injectFiles(files) → localAttachments 更新
   - 调用 openAskModal(suggestedPrompt) → Ask 面板打开 + input 预填
3. Ask 面板出场动画完成后，用户看到：
   - 附件区域已显示导入的文件（FileChip 组件）
   - 输入框已预填 prompt，光标在末尾，可编辑
   - 用户按 Enter 或点击发送即可
```

Ask 面板注入细节：

- `useFileUpload` 新增 `injectFiles(files: LocalAttachment[])` 方法：
  ```typescript
  const injectFiles = useCallback((files: LocalAttachment[]) => {
    setLocalAttachments(prev => {
      const merged = [...prev];
      for (const item of files) {
        if (!merged.some(m => m.name === item.name)) merged.push(item);
      }
      return merged;
    });
  }, []);
  ```
- 预填 prompt 文案（i18n）：
  - 单文件 zh：`请阅读 {filename}，提取关键信息整理到知识库中合适的位置。`
  - 单文件 en：`Please read {filename}, extract key information and organize it into the appropriate place in my knowledge base.`
  - 多文件 zh：`请阅读这 {n} 个文件，提取关键信息分别整理到知识库中合适的位置。`
  - 多文件 en：`Please read these {n} files, extract key information and organize each into the appropriate place in my knowledge base.`

- 通信机制：ImportModal 通过 `openAskModal()` store（已有）触发 Ask 面板打开 + 预填消息。文件注入通过新的全局 event `mindos:inject-ask-files` 传递给 `AskContent`，`AskContent` 监听此事件并调用内部 `upload.injectFiles()`

##### 结果反馈

**归档路径——Toast**：

成功：
```
┌──────────────────────────────────────────┐
│  ✓  已存入 2 个文件到 Notes/              │
│     更新了 1 个索引文件                    │
└──────────────────────────────────────────┘
```

部分失败：
```
┌──────────────────────────────────────────┐
│  ⚠  存入 1/2 个文件                      │
│     1 个跳过（同名文件已存在）             │
└──────────────────────────────────────────┘
```

全部失败：
```
┌──────────────────────────────────────────┐
│  ✗  导入失败                              │
│     知识库根目录未配置                      │
└──────────────────────────────────────────┘
```

- Toast 样式：复用项目已有 Toast 组件
- 自动关闭：成功 4s，失败 6s
- 成功 Toast 可点击跳转到目标空间

**AI 整理路径**——无额外 Toast（Agent 在对话中实时呈现进展和结果）。

##### 动效规范

| 交互 | 动画 | 时长 | 缓动 |
|------|------|------|------|
| Modal 出现 | `opacity 0→1` + `scale(0.98→1)` | 200ms | ease-out |
| Modal 关闭 | `opacity 1→0` + `scale(1→0.98)` | 150ms | ease-in |
| Step 1→2a 切换 | 内容区 crossfade + 高度过渡 | 200ms | ease-out |
| Step 2a→1 返回 | 反向 crossfade | 150ms | ease-out |
| DropZone 收缩 | `max-height` + `padding` 过渡 | 200ms | ease-out |
| 文件列表项出现 | stagger `opacity 0→1` + `translateY(4→0)` | 100ms/item, 30ms stagger | ease-out |
| 文件列表项删除 | `opacity 1→0` + `translateX(0→8)` | 150ms | ease-in |
| 拖拽 overlay 出现 | `opacity 0→1` + `backdrop-blur(0→sm)` | 200ms | ease-out |
| 意图卡片 hover | `border-color` 过渡 | 150ms | ease-out |
| 意图卡片 click | `scale(0.98)` | 100ms | ease-out |
| CTA 按钮成功 | `bg-amber→bg-success` + icon crossfade | 300ms | ease-out |

所有动效遵守 `prefers-reduced-motion`：媒体查询为 reduce 时，所有 `transition-duration` 设为 0ms。

##### 无障碍 & 键盘（Accessibility — CRITICAL）

| 规则 | 实现 |
|------|------|
| **Focus Trap** | Modal 打开后焦点锁定在 Modal 内部，Tab 循环不逃逸到背景 |
| **Initial Focus** | Step 1：初始焦点设在 DropZone 的 "点击选择" 按钮上。Step 2a：初始焦点设在空间选择器上 |
| **Return Focus** | Modal 关闭后焦点返回触发元素（`+` 按钮 / 右键菜单项 / 快捷键最近焦点） |
| **意图卡片键盘** | 两张卡片可通过 `←` `→` 方向键切换焦点，`Enter` / `Space` 选中。使用 `role="radiogroup"` + `role="radio"` + `aria-checked` |
| **文件列表项** | 每项的 `×` 删除按钮可 Tab 到达，`aria-label="移除 {filename}"`。删除后焦点移至下一项（如果最后一项则移至上一项） |
| **DropZone** | `role="button"` + `aria-label="点击选择文件，或拖拽文件到此处"` + `tabindex="0"`，支持 `Enter` / `Space` 触发文件选择 |
| **状态变更播报** | 文件添加/移除后使用 `aria-live="polite"` 区域播报文件计数变化（"已添加 2 个文件"） |
| **错误播报** | 不支持的文件类型使用 `role="alert"` 即时播报错误信息 |
| **Color-not-only** | 错误文件行除红色背景外，还有 `AlertCircle` 图标 + 错误文字说明 |
| **CTA disabled** | 导入中按钮设置 `aria-disabled="true"` + `aria-busy="true"` |
| **Popover 菜单** | `+` 按钮 Popover 使用 `role="menu"` + `role="menuitem"`，`↑` `↓` 方向键导航，`Escape` 关闭 |
| **拖拽替代方案** | 全局拖拽有等价键盘操作（`Ctrl+I` 快捷键 → Modal → "点击选择" 按钮），不依赖拖拽手势 |

##### 移动端适配（Layout & Responsive — HIGH）

**Modal 响应式行为**：

- **桌面（≥768px）**：居中浮层，`max-w-lg`，遮罩 + 圆角
- **移动端（<768px）**：底部 Sheet 样式
  - `fixed bottom-0 left-0 right-0`，`rounded-t-2xl`，`max-h-[85vh]`
  - 顶部显示拖拽手柄（`w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2`）
  - 支持下拉手势关闭（`touchmove` 监听 + 位移阈值 80px 触发关闭）
  - 出场动画：`translateY(100%)→0` 300ms ease-out（代替 scale）
  - 离场动画：`translateY(0→100%)` 200ms ease-in

**意图卡片响应式**：

- 桌面：水平排列 `flex-row gap-3`
- 移动端（<480px）：垂直堆叠 `flex-col gap-2`，每张卡片变为横向布局（图标左 + 文字右）以节省纵向空间：

```
┌──────────────────────────────┐
│  FolderInput  存入知识库      │
│  (icon 20px)  原样保存...    │
├──────────────────────────────┤
│  Sparkles     AI 帮我整理    │
│  (icon 20px)  阅读内容...    │
└──────────────────────────────┘
```

**文件列表项 — 移动端**：
- 删除 `×` 按钮始终可见（不依赖 hover）
- `×` 按钮视觉 14px，但 `hitSlop` / `padding` 扩展到 `min-44×44px` 触摸区域
- 长文件名 `truncate`，单行显示

**DropZone — 移动端**：
- 隐藏 "拖拽文件到这里" 文案（移动端不支持桌面拖拽）
- 只显示 "点击选择文件" + 图标
- 区域最小高度 `min-h-[120px]` 保证足够触摸面积

**空间选择器 — 移动端**：
- 使用原生 `<select>` 以触发系统级选择器（滚轮 / Action Sheet），不用自定义下拉

##### 防误操作 & 错误恢复（Forms & Feedback — MEDIUM）

| 场景 | 处理 |
|------|------|
| **关闭带文件的 Modal** | 已选择文件但未提交时，关闭 Modal 弹出确认："放弃已选的 {n} 个文件？" — [取消] [放弃]。Modal 刚打开且无文件时直接关闭。 |
| **覆盖冲突策略** | "覆盖已有文件" 选项使用 `text-error` 警告色 + 旁边 `AlertTriangle` 图标 + tooltip "将永久替换已有文件内容" |
| **归档失败重试** | 全部失败 Toast 包含 [重试] 按钮，点击重新打开 ImportModal 并恢复之前的文件列表和配置 |
| **归档成功撤销** | 成功 Toast 显示 [撤销] 按钮（5s 内可点），撤销后删除刚创建的文件并恢复 README 变更 |
| **PDF 提取中** | PDF 文件行显示 shimmer / 进度条（文件名旁 `Loader2 animate-spin text-xs`），提取完成后替换为文件大小 |
| **超大文件即时反馈** | 超过 5MB（PDF 12MB）的文件行即时标红 + 错误消息 "文件过大（最大 5MB）"，不等到提交 |

##### 性能（Performance — HIGH）

| 措施 | 说明 |
|------|------|
| **Code Split** | `ImportModal` 使用 `next/dynamic` 懒加载，不计入初始 bundle。只有首次触发入口（`+` 菜单 / 快捷键 / 拖拽）时加载 |
| **文件读取不阻塞** | 多文件选择后，文件列表立即显示文件名 + 大小（从 `File` 对象同步获取），内容读取（`file.text()` / PDF 提取）在后台异步完成。CTA 按钮在所有文件读取完成前显示 "准备中..."（disabled） |
| **列表虚拟化** | 虽然限制 20 个文件不需要虚拟化，但文件列表使用 `overflow-y-auto max-h-[200px]` 防止 Modal 超出视窗 |
| **DropZone 去抖** | `dragEnter` / `dragLeave` 事件使用 `dragCounter` 计数器防止子元素冒泡导致的抖动（dragEnter +1，dragLeave -1，counter=0 时才隐藏 overlay） |
| **拖拽 overlay z-index** | 使用 `z-50`（与项目 z-index 层级表一致），不与 Modal (`z-50`) 冲突（overlay 只在 Modal 未打开时显示） |

### Phase 2: MCP 工具 + Agent 工具增强

#### 2.1 MCP 工具 `mindos_import_files`（归档）

```typescript
{
  name: "mindos_import_files",
  description: "Import external files into the knowledge base. Places files in the specified space and updates related indexes.",
  inputSchema: {
    files: [{ name: string, content: string }],
    target_space?: string,
    organize?: boolean,
    conflict?: "skip" | "rename" | "overwrite"
  }
}
```

#### 2.2 Agent Prompt 增强（AI 整理路径优化）

在 `AGENT_SYSTEM_PROMPT` 的 `## Context Mechanics` 中补充 Agent 处理上传文件的行为引导：

```
- **Uploaded Files — Digest Mode**: When the user uploads files and asks you to "organize",
  "distill", or "save to knowledge base", follow this pattern:
  1. Read the uploaded file content (already in your context, do NOT use read_file)
  2. Identify the relevant spaces by calling list_spaces
  3. Decide: create new file? Or update existing files?
  4. Execute writes (create_file / insert_after_heading / write_file)
  5. Report what was created/updated with file paths
```

### Phase 3: AI 推荐空间（可选增强）

仅增强归档路径的 ImportModal 中的空间选择器：

1. 读取文件内容前 500 字 + 所有空间的 `INSTRUCTION.md` 描述
2. 调用 Agent（轻量）推荐最匹配的空间
3. 在空间选择器中显示 `✦ AI 推荐` 标签

此阶段可延后——手动选空间足够满足 MVP。

## 影响范围

### 变更文件列表

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/lib/core/file-convert.ts` | **新增** | 文件格式转换层 |
| `app/lib/core/organize.ts` | **新增** | 归档后关联更新逻辑 |
| `app/app/api/file/import/route.ts` | **新增** | 归档 API 端点 |
| `app/components/ImportModal.tsx` | **新增** | 双路径导入弹窗 UI（Step 1 意图选择 + Step 2a 归档配置 + 全局 DropZone overlay） |
| `app/hooks/useFileImport.ts` | **新增** | 导入状态管理 hook（文件读取、归档请求、Ask 面板跳转） |
| `app/lib/fs.ts` | **修改** | 添加 `ALLOWED_IMPORT_EXTENSIONS` |
| `app/lib/i18n-en.ts` / `i18n-zh.ts` | **修改** | 添加导入相关 i18n 文案（Modal 标题/描述、意图卡片、配置项、Toast、预填 prompt） |
| `app/components/FileTree.tsx` | **修改** | `DirNode` 的 `+` 按钮改为 Popover 下拉（新建文件 / 导入文件）；`SpaceContextMenu` 新增 "导入文件" 菜单项 |
| `app/components/SidebarLayout.tsx` | **修改** | 添加全局 drag-enter/leave/drop 监听 + ImportModal 状态管理 + `Ctrl+I` 快捷键注册 |
| `app/hooks/useFileUpload.ts` | **修改** | 新增 `injectFiles(files)` 方法，支持外部注入附件到 Ask 面板 |
| `app/components/ask/AskContent.tsx` | **修改** | 监听 `mindos:inject-ask-files` 事件，调用 `upload.injectFiles()` 注入文件附件 |
| `app/components/OnboardingView.tsx` | **修改** | 新增 "已有笔记？导入文件" 引导链接（Phase 1） |
| `app/lib/agent/tools.ts` | **修改** | 添加 `import_and_organize` Agent 工具（Phase 2） |
| `mcp/src/index.ts` | **修改** | 添加 `mindos_import_files` MCP 工具（Phase 2） |
| `app/lib/agent/prompt.ts` | **修改** | 补充 Digest Mode 行为引导（Phase 2） |

### 受影响但不修改的模块

| 模块 | 原因 |
|------|------|
| `app/lib/core/fs-ops.ts` | 归档底层调用 `createFile()`，fs-ops 本身无需改动 |
| `app/lib/core/backlinks.ts` | 关联扫描调用 `findBacklinks()`，backlinks 本身无需改动 |
| `app/lib/core/space-scaffold.ts` | 归档到新目录时触发自动 scaffold，无需改动 |
| `app/hooks/useAskModal.ts` | AI 整理路径通过 `openAskModal()` 触发 Ask 面板，store 本身无需改动 |
| `app/components/RightAskPanel.tsx` | 只是容器，内部 AskContent 处理文件注入 |

### 破坏性变更

无。所有新功能为增量添加：
- `FileTree.tsx` 的 `+` 按钮交互从 "单击新建" 变为 "单击弹出下拉菜单"。用户需多点一步才能新建文件，但换来了导入入口。考虑到新建文件是低频操作（大多数文件由 Agent 创建），这个 trade-off 可接受。
- `useFileUpload` 新增 `injectFiles()` 为向后兼容的扩展。

## 边界 case 与风险

### 边界 case

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | 文件名冲突（归档路径） | 按 `conflict` 策略处理：skip / rename（自动加后缀 `-1`）/ overwrite |
| 2 | 超大文件（>5MB 文本 / >12MB PDF） | 前端拦截 + API 校验，返回清晰错误提示 |
| 3 | 不支持的文件类型 | 前端 `accept` 属性限制 + API 白名单校验，拒绝并提示支持格式 |
| 4 | 空文件 | 归档路径：跳过。AI 整理路径：Agent 提示 "文件为空" |
| 5 | 文件名含特殊字符（emoji、空格、`/`、`..`） | `sanitizeFileName()` 清洗，保留可读性，防路径穿越 |
| 6 | 目标空间不存在（归档路径） | 自动创建空间目录（触发 `scaffoldIfNewSpace`） |
| 7 | 批量导入部分失败 | 已成功的文件保留，返回详细的 `created` / `errors` 列表 |
| 8 | PDF 无法提取文本（扫描件 / 加密） | 归档：跳过并提示。AI 整理：Agent 提示无法读取 |
| 9 | 导入过程中浏览器关闭 | 已发送到服务端的归档请求正常完成；AI 整理路径中断（对话可恢复） |
| 10 | 并发导入（多窗口） | 文件级原子写入（`createFile` 用 temp+rename） |
| 11 | MIND_ROOT 未配置 | API 层检查 `getMindRoot()` 返回 null 时返回 400；前端在 Modal 中提示 |
| 12 | 同一文件被拖拽多次 | 前端去重（按 name + size + lastModified） |
| 13 | AI 整理路径：Agent 决定写入位置不当 | 用户可在对话中纠正，Agent 支持撤销/重写。非阻塞问题 |
| 14 | 用户选了 AI 整理但 Agent 未配置 | 检查 `agentConfig`，未配置时 Toast 提示并引导设置 |
| 15 | 超大文件走 AI 整理路径（超出 Agent context） | 前端提示 "文件较大，建议使用归档模式"；或 Agent 自动截断 |

### 风险与 Mitigation

| 风险 | 概率 | 影响 | Mitigation |
|------|------|------|-----------|
| PDF 提取质量不稳定 | 中 | 导入内容不完整 | 归档路径提取后展示预览；AI 整理路径由 Agent 自行判断质量 |
| HTML 转 markdown 丢失格式 | 中 | 内容可读性下降 | 使用 turndown 库保留基本格式；复杂 HTML 降级为 code block |
| 大量文件阻塞 UI | 低 | 用户体验差 | 单次限 20 个文件；服务端逐个处理 |
| 归档路径关联更新误修改 | 低 | 用户文件意外改动 | 只更新 README 索引（追加条目），正文关联仅报告 |
| AI 整理路径写入不当 | 中 | 用户知识库被错误修改 | Agent 每次写入前报告计划（"我将把要点写入 X 文件"），用户可拒绝 |
| 两条路径选择的认知负担 | 低 | 用户犹豫 | 文案清晰直白，默认高亮 "存入知识库"（更安全的选项） |

## 验收标准

### Phase 1: 归档 + 双路径前端

**入口 — 可发现性**

- [ ] 空间/文件夹的 `+` 按钮点击后弹出 Popover 下拉菜单：新建文件 / 导入文件
- [ ] 选 "新建文件" → 行为与当前一致（内联输入框）
- [ ] 选 "导入文件" → 打开 ImportModal，目标空间预填为当前空间
- [ ] 空间右键菜单包含 "导入文件" 项（Lucide `FolderInput` 图标），预选该空间
- [ ] 从桌面拖文件到窗口 → 显示全屏 amber 虚线 DropZone overlay → 松手打开 ImportModal（文件已填充）
- [ ] 拖非文件内容（如文本选区）不触发 overlay
- [ ] `Ctrl+I` / `⌘I` 快捷键打开 ImportModal（无预选空间）
- [ ] Onboarding 空状态页面有 "已有笔记？导入文件" 引导链接

**ImportModal — Step 1 选文件 + 意图**

- [ ] Modal 居中弹出，`max-w-lg`，出场 scale+opacity 动画 200ms
- [ ] 初始状态显示 DropZone 区域（可拖拽 / 可点击选择）
- [ ] 选择文件后 DropZone 收缩，展示文件列表（文件名 + 大小 + 删除按钮）
- [ ] 文件列表支持逐个删除 + "清空全部" 按钮
- [ ] 不支持的文件类型即时标红提示，不阻塞其他文件
- [ ] 同一文件去重（按 name + size + lastModified）
- [ ] 两张意图卡片水平排列："存入知识库"（默认微高亮）/ "AI 帮我整理"
- [ ] 卡片 hover 有 amber 边框过渡，click 有 scale 反馈
- [ ] `Escape` / 点击遮罩 / `×` 按钮均可关闭 Modal
- [ ] Modal 关闭动画 150ms（exit-faster-than-enter）

**归档路径 (Path A)**

- [ ] 选择 "存入知识库" → Step 1 内容 crossfade 为归档配置区
- [ ] "← 返回" 可回到 Step 1
- [ ] 文件列表显示 原始文件名 → 目标路径预览（含格式转换：.txt→.md 等）
- [ ] 空间选择器下拉列出所有已有空间 + "根目录" 选项
- [ ] 冲突策略 Radio group（自动重命名 / 跳过 / 覆盖），默认 "自动重命名"
- [ ] 支持 `.md / .txt / .pdf / .csv / .json / .yaml / .yml / .html` 格式
- [ ] `.txt` → `.md` 自动转换（添加 `# 标题`），`.pdf` → `.md` 自动提取
- [ ] CTA 按钮显示文件计数 "存入 N 个文件"
- [ ] 导入中：按钮 disabled + spinner
- [ ] 导入成功：按钮短暂变绿 + Check 图标，300ms 后 Modal 自动关闭
- [ ] 归档成功后文件出现在文件树中，可正常阅读
- [ ] 归档后自动在目标空间 README.md 中追加新文件条目
- [ ] 结果 Toast：成功 / 部分失败 / 全部失败 三种状态，含文件计数和原因
- [ ] 成功 Toast 可点击跳转到目标空间
- [ ] 单次限 20 个文件，单文件限 5MB（PDF 12MB）
- [ ] 关联更新失败不影响文件归档本身（graceful degradation）

**AI 整理路径 (Path B)**

- [ ] 选择 "AI 帮我整理" → Modal 执行离场动画关闭
- [ ] Ask 面板自动打开（通过 `openAskModal()` store 触发）
- [ ] 文件通过 `mindos:inject-ask-files` 事件注入到 Ask 面板的 attachments 区域
- [ ] 文件以 `FileChip` 形式显示在 Ask 面板中
- [ ] 输入框预填建议 prompt（中英双语、单/多文件版本），光标在末尾
- [ ] 用户可编辑 prompt 后发送
- [ ] 用户发送后 Agent 能正确读取上传文件内容并执行整理
- [ ] Agent 未配置时 Toast 提示引导设置

**无障碍 & 键盘**

- [ ] Modal 打开后 focus trap 激活（Tab 不逃逸到背景）
- [ ] Step 1 初始焦点在 DropZone "点击选择" 按钮；Step 2a 焦点在空间选择器
- [ ] Modal 关闭后焦点返回触发元素
- [ ] 意图卡片支持 `←` `→` 方向键切换 + `Enter`/`Space` 选中（`role="radiogroup"`）
- [ ] 文件列表 `×` 按钮有 `aria-label="移除 {filename}"`，删除后焦点移至相邻项
- [ ] DropZone 有 `role="button"` + `aria-label`，`Enter`/`Space` 可触发文件选择
- [ ] 文件增删后 `aria-live="polite"` 播报文件计数变化
- [ ] 不支持的文件类型使用 `role="alert"` 播报错误
- [ ] 错误文件行有 `AlertCircle` 图标（颜色不是唯一指示）
- [ ] `+` 按钮 Popover 使用 `role="menu"` + `↑↓` 导航 + `Escape` 关闭

**移动端**

- [ ] <768px：Modal 变为底部 Sheet（`rounded-t-2xl`，`max-h-[85vh]`）
- [ ] Sheet 有拖拽手柄，支持下拉手势关闭
- [ ] <480px：意图卡片垂直堆叠，改为横向布局（图标左 + 文字右）
- [ ] 文件列表 `×` 删除按钮始终可见（不依赖 hover）
- [ ] `×` 按钮触摸区域 ≥44×44px（视觉可小于此，但 hitSlop 扩展）
- [ ] 移动端 DropZone 隐藏 "拖拽" 文案，只显示 "点击选择文件"
- [ ] 空间选择器移动端使用原生 `<select>`

**防误操作 & 错误恢复**

- [ ] 已选文件未提交时关闭 Modal → 确认对话框 "放弃已选的 N 个文件？"
- [ ] "覆盖已有文件" 选项使用 `text-error` + `AlertTriangle` 图标 + 警告提示
- [ ] 全部失败 Toast 包含 [重试] 按钮
- [ ] 归档成功 Toast 包含 [撤销] 按钮（5s 内有效）
- [ ] PDF 文件行在提取中显示 spinner，完成后替换为文件大小
- [ ] 超大文件即时标红 + 错误消息（不等到提交）

**性能**

- [ ] `ImportModal` 使用 `next/dynamic` 懒加载，不计入初始 bundle
- [ ] 文件列表即时显示文件名 + 大小，内容读取在后台异步完成
- [ ] 文件列表 `overflow-y-auto max-h-[200px]` 防止 Modal 超出视窗
- [ ] 拖拽 overlay 使用 `dragCounter` 防抖（防止子元素冒泡导致闪烁）

**通用**

- [ ] 全部 i18n 文案覆盖中英文（Modal 标题、描述、卡片文案、配置项、Toast、预填 prompt）
- [ ] 文件名特殊字符安全清洗（`sanitizeFileName`）
- [ ] 路径穿越防护（`resolveSafe()` 覆盖）
- [ ] 所有动效遵守 `prefers-reduced-motion`（reduce 时 duration 为 0）
- [ ] 单元测试：格式转换（所有类型）、冲突处理（skip/rename/overwrite）、文件名清洗、空文件/超大文件拒绝
- [ ] 集成测试：归档流程 → 文件可读 → README 更新 → 缓存刷新

### Phase 2: MCP + Agent 工具

- [ ] MCP 工具 `mindos_import_files` 可被外部 Agent 调用并正确归档
- [ ] 内置 Agent 支持 "帮我把这个文件整理到知识库" 的自然语言指令（复用 Import API）
- [ ] Agent prompt 包含 Digest Mode 行为引导
- [ ] Agent 在执行 AI 整理时先报告计划再执行

### Phase 3: AI 推荐空间（可选）

- [ ] 归档路径的空间选择器中出现 "✦ AI 推荐" 标签
- [ ] 推荐基于文件内容 + 空间描述匹配
- [ ] 推荐失败时静默降级为无推荐，不阻塞流程
