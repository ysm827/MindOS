# Spec: 文件导入与一键整理至空间 (File Import & Smart Organize)

## 目标

让用户能够上传外部文件（.md / .txt / .pdf / .csv / .json / .yaml 等），一键将其内容整理到知识库的合适空间中，并自动关联更新受影响的文件（README 索引、反向链接、相关笔记）。

核心价值：**把"粘贴→手动归档→手动更新索引"的 3 步操作压缩为 1 步**。

## 现状分析

### 当前能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 上传文件到 AI 对话 | ✅ 已有 | `useFileUpload` hook：支持 .txt/.md/.pdf 等 10 种格式，但仅作为聊天附件，不写入知识库 |
| 单文件创建 | ✅ 已有 | `POST /api/file { op: "create_file" }`，Agent 工具 `create_file` |
| 批量创建文件 | ✅ 已有 | Agent 工具 `batch_create_files`，但需要 Agent 自行决定路径和内容 |
| 文件移动 + 反向链接检测 | ✅ 已有 | `moveFile()` 返回 `affectedFiles` 但不自动修复链接 |
| 空间自动创建 | ✅ 已有 | `scaffoldIfNewSpace()` — 在新目录中创建文件时自动生成 INSTRUCTION.md |
| PDF 文本提取 | ✅ 已有 | `POST /api/extract-pdf` — pdfjs-dist 提取文本 |
| 文件直接导入知识库 | ❌ 缺失 | 没有"上传 → 写入 MIND_ROOT"的端到端流程 |
| 智能归档（自动选择空间） | ❌ 缺失 | 没有基于内容推断目标空间的逻辑 |
| 关联式多文件更新 | ❌ 缺失 | 导入后不会自动更新 README / 反向链接文件 |

### 为什么不满足需求

1. `useFileUpload` 只把文件读进内存交给 AI 对话，不持久化到知识库
2. `create_file` 需要用户/Agent 手动指定路径，无"智能路由"
3. 创建文件后，关联文件（README 索引、引用该主题的笔记）不会自动更新
4. 不支持非 `.md` 文件直接入库（.txt/.pdf 需要先转换格式）

## 数据流 / 状态流

### 核心流程

```
用户选择/拖拽文件
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  Frontend: ImportDropZone / ImportModal              │
│  1. 读取文件内容（File API / FileReader）            │
│  2. 文件类型检测 + 格式转换（PDF→text, txt→md 等）   │
│  3. 展示预览 + 目标空间选择（可选：AI 推荐）         │
└─────────────────────┬───────────────────────────────┘
                      │ POST /api/file/import
                      ▼
┌─────────────────────────────────────────────────────┐
│  API Route: /api/file/import                        │
│  1. 验证文件大小 / 类型 / 路径安全                   │
│  2. 格式转换（如需）                                 │
│  3. 确定目标路径（用户指定 或 AI 推荐）              │
│  4. 调用 core 层写入                                 │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────┼────────────────┐
         ▼            ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ coreCreateFile│ │ updateReadme │ │ updateBacklinks  │
│ (写入文件)    │ │ (更新空间    │ │ (扫描并更新      │
│              │ │  README索引) │ │  引用该主题的文件)│
└──────────────┘ └──────────────┘ └──────────────────┘
                      │
                      ▼
              invalidateCache()
              revalidatePath('/')
              dispatch('mindos:files-changed')
```

### 状态流（前端）

```
idle → selecting → previewing → [space_choosing] → importing → success / error
                                     ↑ optional: AI suggestion
```

### 多文件批量导入

```
files[] → for each file:
            ├─ convert format if needed
            ├─ resolve target path (user-chosen space + sanitized filename)
            ├─ coreCreateFile()
            └─ collect affected files
         → batch update READMEs (deduplicate by space)
         → report: { created[], skipped[], errors[], updatedFiles[] }
```

## 方案

### Phase 1: 文件导入基础设施

#### 1.1 格式转换层 `app/lib/core/file-convert.ts`

```typescript
interface ConvertResult {
  content: string;       // 转换后的 markdown 内容
  originalName: string;  // 原始文件名
  targetName: string;    // 建议的 .md 文件名
  metadata?: Record<string, string>; // 提取的元数据（标题、日期等）
}

function convertToMarkdown(fileName: string, rawContent: string): ConvertResult;
```

支持的转换：

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

#### 1.2 API 端点 `POST /api/file/import`

```typescript
// Request
interface ImportRequest {
  files: Array<{
    name: string;           // 原始文件名
    content: string;        // 文件内容（text）或 base64（binary）
    encoding?: 'text' | 'base64'; // 默认 text
  }>;
  targetSpace?: string;     // 目标空间路径（如 "Notes"），空则放根目录
  organize?: boolean;       // 是否执行关联更新（默认 true）
  conflict?: 'skip' | 'rename' | 'overwrite'; // 冲突策略，默认 rename
}

// Response
interface ImportResponse {
  created: Array<{ original: string; path: string }>;
  skipped: Array<{ name: string; reason: string }>;
  errors: Array<{ name: string; error: string }>;
  updatedFiles: string[];   // 被关联更新的文件列表
}
```

#### 1.3 关联更新逻辑 `app/lib/core/organize.ts`

导入文件后，自动执行：

1. **更新空间 README**：在目标空间的 `README.md` 中追加新文件条目（如果 README 有文件索引段落）
2. **反向链接扫描**：扫描 KB 中是否有文件提到了新导入文件的主题关键词（文件名去扩展名），在 `updatedFiles` 中报告但不自动修改（留给用户/Agent 决定）
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

### Phase 2: 前端交互

#### 2.1 导入入口

| 入口 | 位置 | 触发方式 |
|------|------|---------|
| 文件树顶部工具栏 | `FileTreeHeader` | "导入" 按钮（`Import` icon） |
| 空间右键菜单 | `FileTreeContextMenu` | "导入文件到此空间" |
| 拖拽放置 | 文件树区域 | 拖文件到空间目录上 |
| 快捷键 | 全局 | `⌘I` / `Ctrl+I` |

#### 2.2 导入弹窗 `ImportModal`

```
┌─────────────────────────────────────────────┐
│  导入文件                              [×]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │        拖拽文件到这里                  │  │
│  │        或 点击选择文件                 │  │
│  │                                       │  │
│  │  支持 .md .txt .pdf .csv .json .yaml  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ── 已选文件 ──────────────────────────────  │
│  📄 meeting-notes.txt       → Notes/        │
│  📄 research-paper.pdf      → Resources/    │
│  📄 tasks.csv               → Workflows/    │
│                                             │
│  目标空间: [▼ Notes        ]  (可切换)      │
│                                             │
│  ☑ 自动更新关联文件（README 索引等）        │
│                                             │
│          [取消]      [导入 3 个文件]         │
└─────────────────────────────────────────────┘
```

**交互细节：**
- 文件列表显示原始文件名 + 转换后目标路径预览
- 空间选择器下拉列出所有已有空间 + "根目录" 选项
- 支持单个文件独立切换目标空间
- 冲突时（同名文件已存在）高亮提示，提供 skip/rename 选项
- 导入按钮显示文件计数，导入中显示进度

#### 2.3 导入结果反馈

导入完成后显示 toast：
- 成功：`"已导入 3 个文件到 Notes/，更新了 2 个关联文件"`
- 部分失败：`"导入 2/3 个文件成功，1 个跳过（同名文件已存在）"`
- 点击 toast 可查看详细结果

### Phase 3: MCP 工具 + Agent 工具

#### 3.1 MCP 工具 `mindos_import_files`

```typescript
{
  name: "mindos_import_files",
  description: "Import external file contents into the knowledge base, optionally organizing into a target space with related file updates",
  inputSchema: {
    files: [{ name: string, content: string }],
    target_space?: string,
    organize?: boolean,
    conflict?: "skip" | "rename" | "overwrite"
  }
}
```

#### 3.2 Agent 工具 `import_and_organize`

内置 Agent 可使用的工具，在用户说"帮我把这个文件整理到知识库"时调用。与 MCP 工具走相同的 API。

### Phase 4: AI 智能推荐空间（可选增强）

利用内置 Agent 能力：
1. 读取文件内容前 500 字
2. 读取 `listMindSpaces()` 获取所有空间名 + description
3. 推荐最匹配的空间（基于语义相似度或关键词匹配）
4. 在 ImportModal 中显示 AI 推荐标签

此阶段可延后，先用手动选择空间满足核心需求。

## 影响范围

### 变更文件列表

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/lib/core/file-convert.ts` | **新增** | 文件格式转换层 |
| `app/lib/core/organize.ts` | **新增** | 导入后关联更新逻辑 |
| `app/app/api/file/import/route.ts` | **新增** | 导入 API 端点 |
| `app/components/ImportModal.tsx` | **新增** | 导入弹窗 UI |
| `app/components/ImportDropZone.tsx` | **新增** | 拖拽放置区域 |
| `app/hooks/useFileImport.ts` | **新增** | 导入状态管理 hook |
| `app/lib/fs.ts` | **修改** | 添加 `ALLOWED_EXTENSIONS` 扩展 + 导入相关 wrapper |
| `app/lib/i18n-en.ts` / `i18n-zh.ts` | **修改** | 添加导入相关 i18n 文案 |
| `app/components/FileTreeHeader.tsx` | **修改** | 添加"导入"按钮入口 |
| `app/lib/agent/tools.ts` | **修改** | 添加 `import_and_organize` Agent 工具 |
| `mcp/src/index.ts` | **修改** | 添加 `mindos_import_files` MCP 工具 |

### 受影响但不修改的模块

| 模块 | 原因 |
|------|------|
| `app/lib/core/fs-ops.ts` | 导入底层调用 `createFile()`，fs-ops 本身无需改动 |
| `app/lib/core/backlinks.ts` | 导入后的关联扫描调用 `findBacklinks()`，backlinks 本身无需改动 |
| `app/lib/core/space-scaffold.ts` | 导入到新目录时触发自动 scaffold，无需改动 |
| `useFileUpload.ts` | 现有聊天附件功能不变，导入是独立功能 |

### 破坏性变更

无。所有新功能为增量添加，不修改现有 API 接口或行为。

## 边界 case 与风险

### 边界 case

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | 文件名冲突：目标空间已存在同名文件 | 按 `conflict` 策略处理：skip（跳过）、rename（自动加后缀 `-1`）、overwrite（覆盖） |
| 2 | 超大文件（>5MB 文本 / >12MB PDF） | 前端拦截 + API 校验，返回清晰错误提示 |
| 3 | 不支持的文件类型 | 前端 `accept` 属性限制 + API 白名单校验，拒绝并提示支持格式 |
| 4 | 空文件 | 跳过，返回 `skipped` 中标注原因 |
| 5 | 文件名含特殊字符（emoji、空格、`/`、`..`） | `sanitizeFileName()` 清洗，保留可读性，防路径穿越 |
| 6 | 目标空间不存在 | 自动创建空间目录（触发 `scaffoldIfNewSpace`） |
| 7 | 批量导入部分失败 | 已成功的文件保留，返回详细的 `created` / `errors` 列表 |
| 8 | PDF 无法提取文本（扫描件 / 加密） | `extract-pdf` 返回空文本 → 跳过，提示用户 |
| 9 | 导入过程中浏览器关闭 | 已发送到服务端的请求正常完成；前端重新打开后文件树刷新可见 |
| 10 | 并发导入（多窗口同时操作） | 文件级原子写入（`createFile` 用 temp+rename），不会出现半写入 |
| 11 | MIND_ROOT 未配置 | API 层检查 `getMindRoot()` 返回 null 时返回 400 |
| 12 | 同一文件被拖拽多次 | 前端去重（按 name + size + lastModified） |

### 风险与 Mitigation

| 风险 | 概率 | 影响 | Mitigation |
|------|------|------|-----------|
| PDF 提取质量不稳定 | 中 | 导入内容不完整 | 提取后展示预览，让用户确认再导入 |
| HTML 转 markdown 丢失格式 | 中 | 内容可读性下降 | 使用 turndown 库，保留基本格式；复杂 HTML 降级为 code block |
| 大量文件导入阻塞 UI | 低 | 用户体验差 | 限制单次最多 20 个文件；服务端逐个处理不阻塞其他请求 |
| 关联更新误修改 | 低 | 用户文件被意外修改 | Phase 1 只更新 README 索引（追加条目），不修改正文内容；正文关联更新仅报告 |

## 验收标准

### Phase 1: 基础导入

- [ ] 用户可通过文件树工具栏"导入"按钮打开 ImportModal
- [ ] 支持拖拽或点击选择文件，支持 `.md / .txt / .pdf / .csv / .json / .yaml / .yml / .html` 格式
- [ ] 导入前展示文件列表预览（文件名 + 大小 + 目标路径）
- [ ] 可选择目标空间（下拉列表包含所有已有空间）
- [ ] 文件名冲突时提示并支持 skip/rename 选择
- [ ] 导入成功后文件出现在文件树中，可正常阅读
- [ ] `.txt` 文件自动转换为 `.md` 格式
- [ ] `.pdf` 文件自动提取文本并转为 `.md`
- [ ] 导入完成后显示结果 toast（成功数 / 跳过数 / 错误数）
- [ ] 单次导入限制 20 个文件，单文件限制 5MB（PDF 12MB）
- [ ] 不支持的文件类型在前端阶段就被拒绝并提示

### Phase 2: 关联更新

- [ ] 导入后自动在目标空间 README.md 中追加新文件条目
- [ ] 导入结果报告中列出"检测到 N 个相关文件可能需要更新"
- [ ] README 更新为追加模式，不删除已有内容
- [ ] 关联更新失败不影响文件导入本身（graceful degradation）

### Phase 3: MCP + Agent

- [ ] MCP 工具 `mindos_import_files` 可被外部 Agent 调用
- [ ] 内置 Agent 支持"帮我把这个文件整理到知识库"的自然语言指令
- [ ] Agent 能自动推荐目标空间

### 通用

- [ ] 全部 i18n 文案覆盖中英文
- [ ] 文件名特殊字符安全清洗
- [ ] 路径穿越防护（`resolveSafe()` 覆盖）
- [ ] 单元测试覆盖：格式转换（所有类型）、冲突处理（skip/rename/overwrite）、文件名清洗、空文件/超大文件拒绝
- [ ] 集成测试覆盖：完整导入流程 → 文件可读 → README 更新 → 缓存刷新
