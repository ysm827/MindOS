# Spec: Obsidian Compat Spike 实施规约

> **状态**：📋 实施 Spec 完成
> **日期**：2026-04-10
> **范围**：骨架 + 最小 P0 API shim 第一阶段实现与验收

---

## 1. 实施方向澄清

### 1.1 这个 Spike 要做什么

实现最小可运行的 Obsidian 插件加载与运行时，验证 Shim 路线是否可行。

**不是要**：完整兼容、支持高级插件、生产级稳定。

**是要**：
1. 插件能从 `${mindRoot}/.plugins/<id>/` 加载
2. `onload()` / `onunload()` 能执行
3. `app.vault.read()` / `loadData()` / `addCommand()` 能工作
4. QuickAdd / Tag Wrangler / Style Settings 三个样例能跑通
5. 清晰诊断"哪些 API 缺" vs "宿主没实现"

### 1.2 判断标准

**成功** ← 所有验收标准通过 + 找到 ≥2 个"下一步必做"的缺口

**失败** ← 前 3 个样例中任何一个无法在合理复杂度内跑通（定义：不超过 500 行 shim 代码）

### 1.3 成本控制

不许超过 3000 行实现代码（包括所有 shims/tests）

---

## 2. 代码落点

| 模块 | 路径 | 职责 |
|---|---|---|
| **Loader** | `app/lib/obsidian-compat/loader.ts` | 扫描、manifest 校验、执行 main.js |
| **Plugin Manager** | `app/lib/obsidian-compat/plugin-manager.ts` | enabled/disabled 状态持久化、批量加载、错误摘要 |
| **Runtime** | `app/lib/obsidian-compat/runtime.ts` | 插件生命周期、Component/Events 基类 |
| **Plugin Shim** | `app/lib/obsidian-compat/shims/plugin.ts` | Plugin 基类 + onload/onunload 钩子 |
| **Vault Shim** | `app/lib/obsidian-compat/shims/vault.ts` | 文件读写、事件发射 |
| **Metadata Shim** | `app/lib/obsidian-compat/shims/metadata-cache.ts` | frontmatter/tags/links 最小提取 |
| **App Shim** | `app/lib/obsidian-compat/shims/app.ts` | app.vault / app.metadataCache / app.workspace 代理 |
| **UI Shim** | `app/lib/obsidian-compat/shims/ui.ts` | Notice / Modal 最小实现 |
| **obsidian 导出面** | `app/lib/obsidian-compat/shims/obsidian.ts` | `require('obsidian')` 的模块导出 |
| **Manifest** | `app/lib/obsidian-compat/manifest.ts` | manifest 类型 + 校验 |
| **Types** | `app/lib/obsidian-compat/types.ts` | 所有 Shim 公开类型 |
| **Errors** | `app/lib/obsidian-compat/errors.ts` | compat 专用错误 |
| **测试** | `app/__tests__/obsidian-compat/*.test.ts` | 按 vitest 规范，mirror 模块结构 |

---

## 3. 数据流与状态

### 3.1 插件生命周期

```
┌─ 扫描 .plugins/ 目录
│   └─ 读取 manifest.json
│   └─ 校验 required fields
│
├─ 加载 main.js（注入 obsidian shim）
│   └─ new Plugin(app, manifest)
│   └─ 实例化 Plugin
│
├─ 调用 onload()
│   ├─ addCommand()
│   ├─ loadData()
│   ├─ this.registerEvent()
│   └─ 返回
│
├─ 运行中（事件驱动）
│   ├─ 用户操作 → Command 执行
│   ├─ 文件变更 → Vault 事件
│   └─ 插件 → loadData / saveData
│
└─ 卸载
    ├─ 调用 onunload()
    ├─ 清理所有事件、定时器
    ├─ 删除命令注册
    └─ 返回
```

### 3.2 数据存储

```
${mindRoot}/
├── .plugins/
│   └── <plugin-id>/
│       ├── manifest.json        (readonly, 插件声明)
│       ├── main.js              (readonly, 编译产物)
│       ├── styles.css           (optional, 样式)
│       └── data.json            (plugin loadData/saveData 映射)
```

### 3.3 Shim 依赖链

```
User Code (Plugin)
    ↓ require('obsidian')
    ↓
obsidian Shim (导出面)
    ├─ Plugin
    ├─ App
    ├─ Vault
    ├─ MetadataCache
    ├─ Command
    └─ Events
    ↓ (依赖)
PluginRuntime (单例管理)
    ├─ 命令注册表
    ├─ 事件总线
    ├─ 生命周期
    └─ 宿主适配器
    ↓
MindOS Adapters
    ├─ fs-ops（readFile/writeFile）
    ├─ search-index（MetadataCache）
    ├─ link-index（backlinks）
    └─ 命令注册到 MindOS 命令面板
```

---

## 4. 实现约束

### 4.1 必须支持的 API （P0 必做）

| API | 使用广度 | 映射目标 |
|---|---|---|
| `Plugin.onload()` | 100% | plugin.ts:onload lifecycle |
| `Plugin.onunload()` | 100% | plugin.ts:onunload lifecycle |
| `Plugin.loadData()` | 80% | `${mindRoot}/.plugins/<id>/data.json` read |
| `Plugin.saveData(data)` | 80% | `${mindRoot}/.plugins/<id>/data.json` write |
| `Plugin.addCommand(cmd)` | 85% | MindOS 命令面板注册 |
| `app.vault.read(file)` | 95% | fs-ops.readFile() |
| `app.vault.getFiles()` | 70% | mindRoot 下所有 .md 文件列表 |
| `app.vault.getFileByPath(path)` | 70% | 文件对象（TFile 壳） |
| `app.metadataCache.getFileCache(file)` | 60% | frontmatter/tags/links 基础提取 |
| `Notice(msg)` | 70% | 控制台 log / toast 回调 |
| `Modal` 基础类 | 70% | 可继承、可 open/close |

### 4.2 明确不做（P3 排除）

| API | 理由 |
|---|---|
| registerView / ItemView | Workspace 深度依赖，第二阶段 |
| registerEditorExtension | CM6 集成，第二阶段 |
| MarkdownPostProcessor | 渲染管线，第二阶段 |
| Electron / Node 原生 API | Web 运行时不支持 |
| 完整 Workspace 模型 | 复杂度太高 |

### 4.3 部分支持（P1 可选）

- `PluginSettingTab` / `Setting`：基础渲染，内容收集后交宿主 UI
- `app.workspace.getActiveFile()` ：读取当前打开文件
- `app.metadataCache.resolvedLinks` ：从 link-index 构建

---

## 5. 验收标准

### 5.1 最低必须（绿灯通过）

```
测试覆盖：
- [ ] Loader: manifest 校验失败正确报错
- [ ] Loader: 能加载和执行有效插件
- [ ] Plugin: onload/onunload 生命周期执行
- [ ] Vault: read() / getFiles() / getFileByPath() 工作
- [ ] Command: addCommand() 注册到命令表
- [ ] Data: loadData/saveData 读写 data.json
- [ ] Events: registerEvent() 自动清理

样例插件（三选二成功即可继续）：
- [ ] Hello World 插件（最小：onload 输出 log）
- [ ] QuickAdd 兼容样例（Command + Modal）
- [ ] Tag Wrangler 兼容样例（MetadataCache + Vault）
```

### 5.2 质量关（不能妥协）

```
代码：
- [ ] TypeScript 严格模式，0 any
- [ ] 所有 exports 有 JSDoc
- [ ] 函数 ≤50 行，文件 ≤200 行
- [ ] 0 console.log（除 test）
- [ ] 0 重复逻辑（>3 行复用）

错误处理：
- [ ] 所有外部调用（fs/require）有 try-catch
- [ ] 错误消息含"是什么"+"应怎样"
- [ ] 插件运行时异常被捕获不拖垮主线程

性能：
- [ ] 插件加载 <500ms
- [ ] addCommand 注册 <10ms
- [ ] Vault.getFiles() 单次 <100ms

测试质量：
- [ ] 测试名描述行为（不是"test case"）
- [ ] 每个测试独立，可单独运行
- [ ] 边界 case ≥3 个
- [ ] 覆盖率 ≥80%
```

### 5.3 宿主对接（最后确认）

```
- [ ] 命令正确出现在 MindOS 命令面板
- [ ] 插件 loadData/saveData 能通过测试宿主访问
- [ ] 插件样式（如有）能注入到页面
- [ ] 插件停用后命令被清理
- [ ] 无任何全局污染（window/global 变量）
```

---

## 6. 测试策略

### 6.1 分层覆盖

| 层 | 测试类型 | 文件位置 | 优先级 |
|---|---|---|---|
| Manifest | Unit | `obsidian-compat.manifest.test.ts` | P0 |
| Loader | Unit | `obsidian-compat.loader.test.ts` | P0 |
| Plugin Runtime | Unit | `obsidian-compat.runtime.test.ts` | P0 |
| Vault Shim | Unit | `obsidian-compat.vault.test.ts` | P0 |
| Command Shim | Unit | `obsidian-compat.command.test.ts` | P0 |
| Integration (3 样例) | Integration | `obsidian-compat.samples.test.ts` | P0 |
| UI (Settings/Modal) | Manual | (用浏览器验证) | P1 |

### 6.2 边界 case 清单

**Manifest 校验**：
- 缺 `id` / `name` / `version` → 报错
- `id` 含非字母数字 → 报错
- `version` 非 semver → 报错

**Loader**：
- `main.js` 不存在 → 报错
- `require('obsidian')` 成功 → obsidian shim
- `require('fs')` → 报"不支持的模块"
- `require()` 抛异常 → 捕获且包装

**Vault**：
- 文件不存在 → 报 FILE_NOT_FOUND
- 路径穿出 mindRoot → 报 PATH_OUTSIDE_ROOT
- 并发读写同一文件 → 使用 atomics 保护

**Data JSON**：
- `data.json` 不存在 → 返回 null（不报错）
- `data.json` 损坏 → 报"JSON parse error"
- saveData 时 disk 满 → 捕获异常不崩溃

---

## 7. 风险与 Mitigation

| 风险 | 影响 | Mitigation |
|---|---|---|
| 插件 `require()` 原生模块 | 运行时失败 | 检查 require list，列入黑名单 |
| 插件无限循环 / OOM | 进程卡死 | 第一阶段不做超时保护，记为"后续必做" |
| 插件修改全局对象 | 污染 MindOS | 第一阶段运行在主线程，后续用 VM/Worker |
| manifest 恶意字段 | 注入攻击 | schema 校验 + 类型检查 |
| 命令 ID 冲突 | 覆盖已有命令 | 前缀命名 `obsidian:<pluginId>:<cmdId>` |

---

## 8. 交付物清单

### 8.1 代码

- [ ] `app/lib/obsidian-compat/` 完整骨架（7 个模块）
- [ ] `app/__tests__/obsidian-compat/` 完整测试
- [ ] 三个样例插件代码（或使用真实 GitHub 项目编译产物）

### 8.2 文档

- [ ] 本 spec
- [ ] 代码注释（JSDoc for all exports）
- [ ] `wiki/specs/spec-obsidian-spike-impl.md`（实施日志与结果）

### 8.3 诊断输出

- [ ] 插件加载日志（扫描结果、manifest 校验结果）
- [ ] 三个样例运行结果与问题诊断
- [ ] "下一步必做"清单（至少 3 项）

---

## 8.1 当前实现进展（2026-04-10）

本轮已经落地并通过测试的能力：

- `obsidian` 导出面最小壳：`Plugin` / `Component` / `Events` / `Notice` / `Modal` / `PluginSettingTab` / `Setting` / `TFile` / `TFolder` / `TAbstractFile`
- `PluginLoader` 支持：插件发现、manifest 校验、模块注入、路径逃逸拦截、异步 `onload()` / `onunload()` 等待
- `PluginManager` 支持：enabled/disabled 状态持久化、批量加载、错误摘要
- `Vault` 支持：create/read/modify/append/delete/rename/copy、事件发射、路径安全、跳过 `.plugins/` 私有文件
- `MetadataCache` 支持：frontmatter / tags / headings / wikilinks / 相对 markdown links 的最小提取
- `Plugin` 支持：`loadData/saveData`、命令委托、setting tab 收集、非浏览器环境安全的 UI stub

当前 compat 测试覆盖：

- manifest
- loader
- vault
- component + plugin
- command-registry
- integration（导出面 + metadata + async lifecycle）

当前状态：

- `npx tsc --noEmit` 通过
- `__tests__/obsidian-compat/*.test.ts` 全部通过
- 全仓 `npx vitest run` 回归通过

## 9. 不是本 Spike 的工作

- ❌ 支持更多 API
- ❌ UI 美化（Setting 页面、插件管理面板）
- ❌ 沙箱隔离（Web Worker / iframe）
- ❌ 插件市场或一键安装
- ❌ 性能优化（缓存、预加载）
- ❌ 测试覆盖完整所有分支（80% 目标即可）

---

## 10. 总体时间节点（参考）

不给具体时间，只给相对顺序：

1. **Type 定义 + Manifest 校验** ← 最快、最小依赖
2. **Loader + Runtime 骨架** ← 基础，后面都依赖这个
3. **Vault Shim** ← 最高频使用
4. **Plugin + Command Shim** ← 生命周期关键
5. **综合测试与样例验证** ← 最后整合
6. **问题诊断与下一步规划** ← 最后输出

