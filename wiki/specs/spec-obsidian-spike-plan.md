# Spec: Obsidian 插件兼容 Spike 计划

> **状态**：📋 Spike Spec 完成
> **日期**：2026-04-10
> **关联文档**：
> - `wiki/specs/spec-obsidian-plugin-compat.md`
> - `wiki/specs/spec-obsidian-api-shim.md`
> - `wiki/specs/spec-obsidian-ecosystem-research.md`
> - `wiki/specs/spec-obsidian-compatibility-matrix.md`

---

## 1. 目标

本 Spike 不追求跑通全部 Obsidian 插件，只验证一件事：

> **MindOS 是否能用一层最小 Shim，成功运行一批以 Vault、Command、Setting、MetadataCache 为主的中轻量插件，并明确哪些 API 是真正的阻塞点。**

换句话说，这次 Spike 的目标不是“做完 Obsidian 兼容”，而是回答下面 5 个问题：

1. **最小可行兼容层长什么样**
2. **能跑通哪些插件类型，跑不通哪些插件类型**
3. **MindOS 现有能力中哪些可以直接复用，哪些必须补基础设施**
4. **实现第一批可用插件需要多少新增系统复杂度**
5. **这条路值不值得继续投，还是应该转向“兼容 Vault 格式 + 原生重做高价值能力”**

---

## 2. Spike 要回答的核心结论

### 2.1 需要最终产出的判断

Spike 结束后，必须给出清晰结论，而不是停留在技术探索：

#### 结论 A：兼容范围

把 Obsidian 插件分为三类：

1. **可直接兼容**
   - 主要依赖 `Plugin` 生命周期、`Vault`、`Command`、`loadData/saveData`
   - 示例：QuickAdd、Style Settings、部分标签/导航类插件

2. **可兼容但需要额外宿主能力**
   - 依赖 `MetadataCache`、`Modal`、`SettingTab`、`MarkdownPostProcessor`
   - 示例：Tasks、Dataview、Calendar、Kanban

3. **短期不建议兼容**
   - 深度依赖 CodeMirror 6、Workspace 布局、Electron/Node.js、外部二进制
   - 示例：Git、Advanced Tables、重度编辑器增强类插件

#### 结论 B：宿主缺口

必须明确 MindOS 目前缺的不是“API 名字”，而是哪些**宿主能力**：

- 统一事件总线
- 动态命令注册
- 插件设置页宿主容器
- 插件生命周期管理器
- 样式注入机制
- Markdown 渲染后处理管线
- Editor 抽象层
- 简化版 Workspace/Leaf/View 宿主

#### 结论 C：战略建议

Spike 最终要给出一个明确建议，三选一：

1. **继续推进 Obsidian API Shim**
2. **只做 Vault 格式兼容，不做插件兼容**
3. **做一层有限兼容，同时优先原生实现 Dataview/Calendar/Kanban 级能力**

目前基于调研，我的预判是：

> **最优策略大概率是第 3 条：有限兼容 + 原生增强，而不是追求完整插件兼容。**

但 Spike 需要用可运行样例来验证，而不是只凭推理下结论。

---

## 3. Spike 范围

### 3.1 In Scope

本 Spike 包含以下内容：

#### A. 最小插件加载器
- 从 `${mindRoot}/.plugins/<plugin-id>/` 扫描插件
- 读取 `manifest.json`
- 加载 `main.js`
- 注入 `obsidian` Shim 模块
- 初始化 Plugin 实例
- 调用 `onload()` / `onunload()`

#### B. 最小 API Shim
- `Plugin`
- `Component`
- `Events`
- `App`
- `Vault`
- `MetadataCache`（最小版）
- `Notice`
- `Modal`
- `PluginSettingTab`
- `Setting`
- `addCommand`
- `loadData/saveData`

#### C. 宿主对接
- 命令注册到 MindOS 命令面板
- 设置项显示到 MindOS 设置页面
- 插件样式动态注入
- 文件变更驱动索引更新
- 插件数据写入 `data.json`

#### D. 试运行插件
至少跑通 3 类样例：

1. **最小 Hello World 插件**
2. **命令 + 设置型插件**
3. **MetadataCache + 文件读取型插件**

### 3.2 Out of Scope

本 Spike 不包含：

- 完整 Workspace 布局模拟
- 完整 CodeMirror 6 扩展兼容
- 完整 `MarkdownPostProcessor` 管线
- 自定义 `ItemView` 生态
- Excalidraw 级复杂插件支持
- Dataview 全能力支持
- Electron / Node.js API 兼容
- 社区插件商店与安装市场
- 沙箱权限系统的完整设计

换句话说，本 Spike **不验证“能不能兼容整个 Obsidian”**，只验证：

> **MindOS 能否以合理复杂度，吃下 Obsidian 插件生态里最容易兼容、价值又足够高的那一层。**

---

## 4. Spike 成功标准

### 4.1 最低成功标准

满足以下全部条件，Spike 才算成功：

- [ ] 能从 `.plugins/` 目录发现插件
- [ ] 能读取并校验 `manifest.json`
- [ ] 能执行一个插件的 `onload()`
- [ ] 插件可以调用 `this.addCommand()`
- [ ] 插件可以调用 `this.loadData()` / `this.saveData()`
- [ ] 插件可以通过 `app.vault` 读写文件
- [ ] 插件可以通过 `app.metadataCache` 读取基础元数据
- [ ] 停用插件后，命令 / 事件 / 样式能被清理

### 4.2 较强成功标准

如果还能满足下面这些，说明这条路很值得继续：

- [ ] 插件设置页能稳定渲染
- [ ] 文件 create/modify/delete 后，MetadataCache 可增量更新
- [ ] 2-3 个真实社区插件能在不改源码或仅极少改动下运行
- [ ] 插件运行不会污染 MindOS 全局状态
- [ ] 插件报错能被宿主捕获并展示，不会拖垮主 UI

### 4.3 失败标准 / 退出条件

出现以下任一情况，就应该果断收缩方向：

- 为了跑通简单插件，必须先实现复杂 Workspace/Leaf 模型
- 为了跑通简单插件，必须深改 MindOS 核心编辑器或布局系统
- 真实插件普遍依赖 Node/Electron，而非 Obsidian API 本身
- 插件宿主层带来的复杂度，已经接近再造一个 Obsidian 前端
- 前 3 个样例插件都无法在合理范围内跑通

---

## 5. 现有能力复用清单

Spike 不应该“凭空新建一个宿主系统”，而应尽可能复用 MindOS 现有基础设施。

### 5.1 文件系统层：可直接复用

MindOS 已有稳定的文件操作能力：

- `readFile()`：读取文件 `app/lib/core/fs-ops.ts:10`
- `writeFile()`：原子写入（临时文件 + rename）`app/lib/core/fs-ops.ts:19`
- `createFile()`：独占创建 `app/lib/core/fs-ops.ts:39`
- `deleteFile()`：删除文件 `app/lib/core/fs-ops.ts:56`
- `renameFile()`：重命名文件 `app/lib/core/fs-ops.ts:111`
- `moveFile()`：移动文件 `app/lib/core/fs-ops.ts:169`

这意味着 `Vault` Shim 的大部分 CRUD 能力都不是问题，问题不在文件 API，而在：

1. 事件发射
2. Obsidian 风格对象模型（`TFile` / `TFolder` / `TAbstractFile`）
3. 对上层插件的行为兼容

### 5.2 搜索索引层：可直接复用

MindOS 已有增量搜索索引：

- 全量重建 `SearchIndex.rebuild()` `app/lib/core/search-index.ts:107`
- 删除更新 `removeFile()` `app/lib/core/search-index.ts:182`
- 新增更新 `addFile()` `app/lib/core/search-index.ts:205`
- 修改更新 `updateFile()` `app/lib/core/search-index.ts:247`

这对 Spike 的意义很大：

> MetadataCache 不需要从零做一套“索引系统”，而是可以先做一层映射，把已有搜索和文件内容解析结果暴露成 Obsidian 期待的 `CachedMetadata` 形状。

### 5.3 反链/图谱层：可直接复用

MindOS 已有双向链接索引：

- 全量重建 `LinkIndex.rebuild()` `app/lib/core/link-index.ts:29`
- 获取 backlinks `getBacklinks()` `app/lib/core/link-index.ts:87`
- 文件更新 `updateFile()` `app/lib/core/link-index.ts:136`

这使得下面这些 Obsidian 能力有实现基础：

- `resolvedLinks`
- `unresolvedLinks`（后续可补）
- `getFirstLinkpathDest()`
- `fileToLinktext()`
- 基础 backlinks 查询

### 5.4 Renderer 注册层：可作为 View 宿主雏形

MindOS 已有可扩展的 renderer 注册表：

- `RendererDefinition` `app/lib/renderers/registry.ts:10`
- `registerRenderer()` `app/lib/renderers/registry.ts:67`
- `resolveRenderer()` `app/lib/renderers/registry.ts:71`

虽然它现在还不是 Obsidian 的 `ItemView/WorkspaceLeaf` 模型，但它说明：

> MindOS 已经有“按内容类型注册和装载扩展 UI”的机制，这可以作为后续 `registerView()` 兼容的落脚点。

---

## 6. Spike 要补的最小新能力

Spike 不应该一口气实现完整插件平台，只补最小新能力。

### 6.1 插件管理器

新增一个最小插件管理器，负责：

- 扫描 `.plugins/`
- 读取 `manifest.json`
- 记录 enabled/disabled 状态
- 加载/卸载插件
- 保存插件运行状态

建议新增目录：

```
app/lib/obsidian-compat/
  loader.ts
  manifest.ts
  plugin-manager.ts
  shims/
```

### 6.2 事件总线

MindOS 当前没有为插件暴露统一事件总线，这是最关键缺口之一。

需要新增最小版本：

- `on(name, cb)`
- `offref(ref)`
- `trigger(name, ...args)`

并把它挂到：

- `app.vault`
- `app.workspace`
- `app.metadataCache`
- `plugin.registerEvent()`

### 6.3 Command Registry

需要一个宿主级命令注册表，负责：

- 注册命令
- 去重
- 按 pluginId 命名空间管理
- 提供给命令面板显示
- 卸载插件时批量清理

### 6.4 data.json 持久化

每个插件一个独立目录：

```
.plugins/<plugin-id>/data.json
```

需要实现：

- `loadData()` → 若不存在返回 `null`
- `saveData(data)` → JSON 原子写入
- 未来可加 `onExternalSettingsChange()`，但 Spike 阶段可以不做

### 6.5 CachedMetadata 生成器

需要一个最小 Markdown 元数据提取器，先支持：

- `frontmatter`
- `tags`
- `headings`
- `links`

不需要一开始就完整覆盖：

- blocks
- embeds
- sections
- footnotes
- listItems 全量细节

Spike 阶段目标是：

> 让依赖 MetadataCache 的插件“能拿到合理结果”，不是让结果 100% 与 Obsidian 字节级一致。

### 6.6 宿主 UI 接口

最小 UI 接口需要支持：

- `Notice` → MindOS toast
- `Modal` → MindOS dialog
- `PluginSettingTab` → 设置页里的插件设置区块
- `addRibbonIcon()` → 先可以退化为命令面板入口或侧栏按钮
- `styles.css` 注入 → `<style>` 或 `<link>` 动态挂载

---

## 7. 样例插件选择

Spike 不能一开始就拿 Excalidraw 或 Dataview 开刀。要按梯度验证。

### 7.1 P0：自制最小样例插件

#### 样例 1：Hello Plugin
能力：
- `onload()`
- `new Notice()`
- `addCommand()`

验证：
- 能被加载
- 能注册命令
- 能正确卸载

#### 样例 2：Settings Plugin
能力：
- `loadData()`
- `saveData()`
- `addSettingTab()`
- `Setting.addText()` / `addToggle()`

验证：
- 配置可保存并重新读取
- 设置项能在宿主 UI 中正确渲染

#### 样例 3：Vault + Metadata Plugin
能力：
- `app.vault.getMarkdownFiles()`
- `app.vault.read()`
- `app.metadataCache.getFileCache()`

验证：
- 能遍历文件
- 能读取 frontmatter/tags/headings/links
- 修改文件后缓存可更新

### 7.2 P1：真实社区插件候选

建议按下面顺序试：

1. **Style Settings**
   - 原因：UI/设置型，高价值，Editor 依赖低
2. **Homepage**
   - 原因：命令与启动行为为主，结构简单
3. **Tag Wrangler**
   - 原因：MetadataCache / Vault 型代表
4. **QuickAdd**
   - 原因：命令 + Modal + 文件操作型代表
5. **Tasks**
   - 原因：Metadata + Markdown 渲染型代表

### 7.3 暂不作为 Spike 样例

这些插件暂时不作为首轮 Spike 验证对象：

- **Excalidraw** — 自定义 View 太重
- **Dataview** — 自建查询引擎和代码块处理器太重
- **Git** — Electron/Node 强依赖
- **Advanced Tables / Outliner** — CodeMirror 耦合过深

---

## 8. 分阶段执行步骤

### 阶段 1：最小加载闭环

目标：从磁盘发现插件并成功执行 `onload()`。

交付物：
- plugin loader
- manifest parser
- Plugin/Component 基类 shim
- 简单错误处理

验收：
- Hello Plugin 启动成功
- 卸载成功
- 错误不会影响主界面

### 阶段 2：文件与状态闭环

目标：让插件可读写文件、保存自身配置。

交付物：
- Vault shim
- data.json 读写
- TFile/TFolder/TAbstractFile 最小对象模型

验收：
- Settings Plugin 可保存设置
- Vault + Metadata Plugin 可列出文件并读取内容

### 阶段 3：索引与事件闭环

目标：让插件感知文件变化并读取基础元数据。

交付物：
- 事件总线
- MetadataCache shim
- 文件 create/modify/delete/rename → 索引增量更新

验收：
- 修改文件后 `getFileCache()` 结果可变更
- 基础标签、frontmatter、heading、links 可读

### 阶段 4：宿主 UI 闭环

目标：让插件可以向宿主注册可见 UI。

交付物：
- 命令注册中心
- 设置页插件区块
- Notice/Modal 适配
- 样式注入

验收：
- QuickAdd / Style Settings 至少一个可运行

### 阶段 5：真实插件评估

目标：拿 3-5 个真实社区插件做兼容评测。

交付物：
- 兼容性报告
- 缺失 API 列表
- 继续 / 收缩建议

验收：
- 至少 2 个真实插件跑通主要路径
- 至少 1 个中等复杂插件给出明确阻塞点

---

## 9. 交付物

Spike 结束时，应至少产出以下交付物：

### 9.1 代码交付物

- 最小插件加载器
- `obsidian` Shim 模块最小版
- Vault shim
- MetadataCache shim（基础版）
- Command registry
- plugin data.json persistence
- 插件运行时错误边界

### 9.2 文档交付物

- 兼容 API 清单（已实现 / 未实现 / stub）
- 样例插件运行记录
- 真实插件评测报告
- 宿主缺口清单
- Go / No-Go 建议

### 9.3 Demo 交付物

最少录 1 个演示路径：

1. 安装插件
2. 启用插件
3. 命令出现
4. 设置生效
5. 插件修改/读取一个笔记
6. 停用插件并清理

---

## 10. 技术设计草图

### 10.1 目录结构建议

```
app/lib/obsidian-compat/
├── loader.ts                 # 加载 main.js，注入 require('obsidian')
├── plugin-manager.ts         # 扫描、启用、禁用、卸载
├── manifest.ts               # manifest.json 校验
├── runtime.ts                # 插件运行上下文
├── events.ts                 # 最小 Events 实现
├── types.ts                  # TFile/TFolder/TAbstractFile
├── metadata.ts               # CachedMetadata 生成
└── shims/
    ├── obsidian.ts           # 对外导出的 obsidian 模块
    ├── plugin.ts             # Plugin / Component
    ├── app.ts                # App shim
    ├── vault.ts              # Vault shim
    ├── metadata-cache.ts     # MetadataCache shim
    ├── ui.ts                 # Notice / Modal / SettingTab
    └── command.ts            # addCommand 适配
```

### 10.2 插件运行流

```
scan .plugins/
  → parse manifest.json
  → if enabled
    → load main.js
    → inject obsidian shim
    → new PluginClass(app, manifest)
    → plugin.onload()
      → register commands
      → mount styles
      → register events
      → expose settings tab
```

### 10.3 卸载流

```
disable plugin
  → plugin.onunload()
  → remove commands by pluginId
  → remove mounted styles
  → unregister all events
  → unmount settings panel
  → clear plugin runtime state
```

---

## 11. 复杂度边界

Spike 过程中必须持续守住这条边界：

> **如果为了支持一个插件，需要先重造 Obsidian 的编辑器、布局系统、或者 Electron 宿主，那这个插件就不属于 Spike 阶段。**

具体来说：

### 可以接受的复杂度
- 新增 1 个最小插件 runtime 目录
- 新增 1 套 Events/Command/Data persistence 基础设施
- 新增 1 个最小 Metadata 抽取层
- 在设置页和命令面板上增加插件入口

### 不可接受的复杂度
- 改写整个 Markdown 编辑器抽象
- 改写整个页面布局系统去模拟 WorkspaceLeaf
- 引入 Node/Electron polyfill 试图欺骗插件
- 为单个重量级插件定制特化宿主逻辑

---

## 12. 推荐结论模板

Spike 最后建议用固定模板收口：

### 12.1 如果结果好

> 我们验证了：MindOS 可以以有限复杂度兼容一层高价值 Obsidian 插件。建议继续推进 Phase 1，只覆盖 Vault / Command / Setting / MetadataCache / Notice / Modal 这一层，并把复杂 View / Editor 类插件留到下一阶段再判断。

### 12.2 如果结果一般

> 我们验证了：最小 Shim 可跑通简单插件，但一旦进入 Metadata、Markdown 渲染和 View，就会快速逼近重造 Obsidian 宿主的复杂度。建议转向“兼容 Vault 格式 + 原生补齐 Dataview/Calendar/Kanban 级能力”，仅保留有限插件兼容。

### 12.3 如果结果差

> 我们验证了：即便是中轻量插件，也普遍依赖 Obsidian 深层宿主行为。完整 Shim 路线投入产出比过低。建议停止 Obsidian 插件兼容方向，仅做 Vault 数据格式兼容和导入迁移工具。

---

## 13. 当前建议

基于现有调研，在 Spike 尚未编码前，我的建议是：

1. **值得做 Spike**
   - 因为文件层、索引层、反链层，MindOS 已经有很强基础
   - 真正要验证的是“插件 runtime + 命令 + 设置 + metadata 映射”是否足够顺

2. **不值得直接做大而全的兼容项目**
   - 因为 Obsidian 生态里最重的价值插件，恰恰依赖最深层 API
   - 一开始就冲 Dataview/Excalidraw，很容易把项目拖入错误方向

3. **最合理的 Spike 范围**
   - 只做最小 runtime
   - 只做 L1-L6 API
   - 只选 3 个自制样例 + 3 个真实插件
   - 用结果决定下一步，而不是先承诺完整兼容

最终一句话总结：

> **这个 Spike 值得做，但必须把目标收窄到“验证最小兼容层是否有产品价值”，而不是“证明我们能成为 Web 版 Obsidian”。**
