# Spec: MCP / API — create_space & rename_space

## 目标

为 Mind **Space**（一级或带 parent 的知识分区目录）提供与现有 `mindos_*` 工具一致的通路：业务逻辑集中在 **App**（`lib/core` + `/api/file`），MCP 仅 `POST` 转发。覆盖 **新建空间**（已有 UI `createSpaceAction`）与 **重命名空间目录**（新能力）。

## 现状分析

- 新建：`createSpaceAction`（`app/lib/actions.ts`）写 `{fullPath}/README.md` 并触发 `scaffoldIfNewSpace`；MCP 仅有 `mindos_create_file`，Agent 易误用为普通文件而非「空间」语义。
- 重命名：`rename_file` 只适用于**文件**；`move_file` 只移动文件。重命名顶层目录（Space）需对目录 `renameSync`，规则与文件不同（路径为目录、保留整棵子树）。

## 数据流 / 状态流

```
MCP mindos_create_space
  → POST /api/file { op: "create_space", path: "_", name, description?, parent_path? }
       → createSpaceFilesystem(getMindRoot(), …)  // `lib/core/create-space.ts`，与 UI `createSpaceAction` 同源
       → core createFile → scaffoldIfNewSpace
       → invalidateCache()
  → revalidatePath('/', 'layout')（action 内 + route TREE_CHANGING）

MCP mindos_rename_space
  → POST /api/file { op: "rename_space", path: "<spaceRelDir>", new_name }
       → renameSpace(path, new_name)  // lib/fs → core/fs-ops.renameSpaceDirectory
       → fs.renameSync(目录)
  → invalidateCache + revalidatePath
```

说明：`create_space` 的 `path` 字段可为占位 `_`（与其它 op 的必填 `path` 兼容）；真正参数走 body 的 `name` / `parent_path`。

## 方案

1. **`renameSpaceDirectory`**（`app/lib/core/fs-ops.ts`）：`resolveSafe` 解析目录；校验存在且 `isDirectory`；`new_name` 无分隔符；目标路径不存在；`renameSync`；返回新相对路径。
2. **`renameSpace`** 包装于 `app/lib/fs.ts`：`invalidateCache()`。
3. **`/api/file`**：`create_space` 调用 `createSpaceAction`；`rename_space` 调用 `renameSpace`；`TREE_CHANGING_OPS` 加入二者。
4. **MCP**（`mcp/src/index.ts`）：`mindos_create_space`、`mindos_rename_space`，描述中强调 Space = Agent 上下文目录。
5. **文档**：`mcp/README.md` 表格；SKILL 副本同步 `skills/` 与 `app/data/skills/`。

## 影响范围

- 变更：`app/lib/core/fs-ops.ts`、`app/lib/core/index.ts`、`app/lib/fs.ts`、`app/app/api/file/route.ts`、`app/__tests__/api/file.test.ts`、`app/__tests__/core/fs-ops.test.ts`、`mcp/src/index.ts`、`mcp/README.md`、`skills/mindos/SKILL.md`、`skills/mindos-zh/SKILL.md`、对应 `app/data/skills/` 副本。
- 不受影响：Modal 新建空间 UI（仍用 `createSpaceAction`）；`rename_file` / `move_file` 语义不变。
- 破坏性：无（仅新增 op 与 tool）。

## 边界 case 与风险

| 边界 | 处理 |
|------|------|
| `new_name` 含 `/`、`\` | 拒绝 |
| `path` 不是目录或不存在 | 明确错误 |
| 目标目录名已存在 | `FILE_ALREADY_EXISTS` |
| `path` 为空、`.` | 拒绝（不能重命名根） |
| `parent_path` 非法（`..`、绝对路径） | `createSpaceAction` 已有校验 |
| 重命名后笔记内链接仍指向旧路径 | **不自动批量替换**（与 `move_file` 提示 backlinks 类似，目录级更大 scope；本 spec 不引入批量改写） |

**风险**：陈旧 `mindos.pid` / 监听与本次无关；Electron SW 跳过与本次无关。

## 验收标准

- [ ] `POST /api/file` `create_space` 在临时 mindRoot 下创建 `Foo/README.md` + 脚手架 `INSTRUCTION.md`（若 scaffold 规则满足）。
- [ ] `POST /api/file` `rename_space` 将 `Foo` → `Bar`，相对路径返回 `Bar`；拒绝文件路径、非法 `new_name`。
- [ ] `fs-ops` 单测覆盖：成功重命名、非目录、目标已存在、非法 `new_name`。
- [ ] MCP 注册两工具且 `post` 到上述 op；`npm test` 全绿。
- [ ] SKILL 中英文列出 `mindos_create_space` / `mindos_rename_space`，与 README 一致。
