# Spec: CLI-First Agent 模式——补齐 CLI 能力，MCP 降级为可选

## 目标

将 CLI 设为 Agent 操作知识库的默认（推荐）路径，MCP 降为可选增强。通过补齐 CLI 缺失的精细编辑子命令，让 CLI Agent 无需 MCP 即可完成所有知识库操作，同时降低 token 成本与部署复杂度。

## 现状分析

### 两种模式的现状

MindOS 提供两条路径让 AI Agent 操作知识库：

| 维度 | CLI (`mindos file ...`) | MCP (`mindos_*` tools) |
|------|------------------------|------------------------|
| 依赖 | 无需 server，直接读写本地文件系统 | 必须 `mindos start`（Web + MCP server） |
| Token 成本 | 极低（shell 命令 + 文本输出） | 高（26 个 tool schema ≈ 8K-12K tokens/会话） |
| Agent 兼容性 | 所有能跑 shell 的 agent | 仅支持 MCP 协议的 agent |
| 写操作粒度 | 粗：create / delete / rename / search | 精细：10 个 CLI 没有的写工具 |
| Setup 成本 | 零配置，装 mindos 就能用 | onboard Step 7 + 重启 agent |

### CLI 的能力缺口

SKILL.md 的操作对照表清楚暴露了 CLI 缺少的操作——Agent 要用 CLI 完成这些任务，只能走 3 步 workaround（read → 计算 → overwrite），既浪费 token 又破坏 git diff：

| 操作 | CLI 当前做法 | MCP 做法 |
|------|-------------|---------|
| 覆写文件 | `create --force`（已有但不直观） | `write_file(path, content)` |
| 追加内容 | `echo >> <full-path>`（需要绝对路径） | `append_to_file(path, content)` |
| 编辑 section | read → 手动定位 heading → overwrite 全文 | `update_section(path, heading, content)` |
| heading 后插入 | read → 手动定位 → overwrite 全文 | `insert_after_heading(path, heading, content)` |
| 追加 CSV 行 | read → append → overwrite 全文 | `append_csv(path, row)` |
| 反向链接 | `mindos api GET /api/backlinks?path=...` | `get_backlinks(path)` |
| 最近修改 | 无 | `get_recent(limit)` |
| Git 历史 | `mindos api GET /api/git?op=log&...` | `get_history(path, limit)` |

### Onboarding Step 7 现状

当前 Step 7 直接展示 Agent 多选列表（18 个 agent），预选已检测到的 agent，安装 MCP config + Skill。没有区分 CLI 与 MCP 模式——所有选中 agent 都装 MCP。

问题：
- Claude Code、Gemini CLI 等 shell-native agent 被装了不需要的 MCP config
- 用户无法感知 CLI vs MCP 的 token 成本差异
- 用户没有"只用 CLI 不用 MCP"的选项

## 数据流 / 状态流

### 改动前：Agent 操作知识库

```
Agent ──MCP tool call──→ MCP Server ──HTTP──→ App API ──fs──→ 知识库
Agent ──shell exec──→ mindos file <sub> ──fs──→ 知识库（仅 6 个操作）
Agent ──shell exec──→ mindos api GET/POST ──HTTP──→ App API ──fs──→ 知识库（补缺口，但笨重）
```

### 改动后：Agent 操作知识库

```
Agent ──shell exec──→ mindos file <sub> ──fs──→ 知识库（全部 14+ 个操作，直接本地）
Agent ──MCP tool call──→ MCP Server ──HTTP──→ App API ──fs──→ 知识库（可选增强，用户 opt-in）
```

关键变化：CLI 路径新增 8 个子命令，覆盖所有 MCP 独有的精细编辑操作。这些操作**全部本地执行**，不经过 HTTP API，不需要 server 运行。

### Onboarding 数据流

```
改动前：
Step 7 → 显示 Agent 多选 → 全部装 MCP config → 装 Skill

改动后：
Step 7a → 模式选择 [x]CLI [ ]MCP → 
Step 7b → 显示 Agent 多选 → 
  CLI 选中 → 仅装 Skill
  MCP 也选中 → 装 MCP config + Skill
```

## 方案

### Part 1: 补齐 CLI 子命令（`bin/commands/file.js`）

在 `mindos file` 下新增以下子命令，全部**本地执行**（直接 fs 操作，不走 API）：

#### 1.1 `mindos file write <path>`

全文覆写。等同 MCP `write_file`。

```bash
mindos file write "notes/meeting.md" --content "# Updated content"
echo "new content" | mindos file write "notes/meeting.md"   # 支持 stdin
```

实现：与 `fileCreate` 类似，但不检查文件是否已存在——直接 `writeFileSync`。
与现有 `create --force` 的区别：语义更清晰（"write" = 覆写已有文件），且 SKILL.md 引用时命名更直觉。

#### 1.2 `mindos file append <path>`

追加内容到文件末尾。等同 MCP `append_to_file`。

```bash
mindos file append "log/journal.md" --content "\n## 2026-04-04\n今天的想法..."
```

实现：`readFileSync` + `writeFileSync(full, existing + content)`。自动确保末尾有换行。

#### 1.3 `mindos file edit-section <path> --heading "..." --content "..."`

替换 Markdown section 内容。等同 MCP `update_section`。

```bash
mindos file edit-section "project/plan.md" --heading "## 进度" --content "Phase 2 已完成"
```

实现：读取文件 → 定位 heading → 替换到下一个同级/更高级 heading 之前 → 写回。
复用 App 已有的 `sectionReplace` 逻辑（`app/lib/file-ops.ts`），提取为 `bin/lib/markdown.js` 纯函数。

#### 1.4 `mindos file insert-heading <path> --heading "..." --content "..."`

在指定 heading 之后插入内容。等同 MCP `insert_after_heading`。

```bash
mindos file insert-heading "notes/idea.md" --heading "## 参考资料" --content "- [新链接](https://...)"
```

实现：与 1.3 类似，但插入而非替换。

#### 1.5 `mindos file append-csv <path> --row "val1,val2,val3"`

追加一行 CSV。等同 MCP `append_csv`。

```bash
mindos file append-csv "tracker/habits.csv" --row "2026-04-04,exercise,30min"
```

实现：RFC 4180 转义，`appendFileSync`。

#### 1.6 `mindos file backlinks <path>`

查找引用指定文件的其他文件。等同 MCP `get_backlinks`。

```bash
mindos file backlinks "concepts/RAG.md"
```

实现：遍历知识库所有 `.md` 文件，`grep` 目标路径的各种引用形式（`[text](path)`、`[[path]]` 等）。

#### 1.7 `mindos file recent [--limit N]`

最近修改的文件。等同 MCP `get_recent`。

```bash
mindos file recent --limit 10
```

实现：遍历知识库文件，按 `mtime` 排序，取前 N 个。

#### 1.8 `mindos file history <path> [--limit N]`

Git 提交历史。等同 MCP `get_history`。

```bash
mindos file history "notes/meeting.md" --limit 5
```

实现：`execSync('git log --format=...' + path)`，在知识库目录执行。

#### 所有新子命令共同规范

- 支持 `--json` 输出（agent 消费用）
- 遵循 `resolvePath()` 安全边界（禁止越过 mindRoot）
- 失败时 `process.exit(EXIT.ERROR)` + 有意义的错误信息
- Remote mode 下走 `apiCall()` 委托给 HTTP API（保持现有模式）

### Part 2: 提取 Markdown 操作纯函数

从 `app/lib/file-ops.ts` 中提取以下逻辑为独立的 `bin/lib/markdown.js`（纯 Node.js，无 Next.js 依赖）：

- `findSection(content, heading)` → `{ start, end, body }`
- `replaceSection(content, heading, newBody)` → `string`
- `insertAfterHeading(content, heading, insertion)` → `string`
- `parseCSVRow(row)` → `string`（RFC 4180 转义）

这些函数同时被 CLI（`file.js`）和 App（`file-ops.ts`）使用，确保行为一致。

### Part 3: Onboarding Step 7 改造

#### 3.1 新增模式选择（Step 7a）

在 Agent 多选之前，增加一个双选项：

```
Step 7/7 — Agent 连接

  连接方式：（空格切换，Enter 确认）

  ❯ ✔ CLI    通过命令行工具操作知识库（推荐，更省 token）
    ○ MCP    通过 MCP 协议连接（可选，可能消耗更多 token）
```

- **CLI 默认选中**（空格 toggle）
- **MCP 默认未选中**，带提示"可能消耗更多 token"
- 两个都可以选（不互斥），至少选一个
- 实现：复用现有 `runMcpInstallStep` 的 raw mode 多选 UI

#### 3.2 根据模式执行不同安装逻辑

```javascript
const modes = await selectModes();  // { cli: true, mcp: false }
const selectedAgents = await selectAgents(); // 复用现有 Agent 多选

if (modes.cli) {
  runSkillInstallStep(template, selectedAgents);  // 安装 SKILL.md
}
if (modes.mcp) {
  runMcpConfigInstall(mcpPort, authToken, selectedAgents);  // 安装 MCP config
}
```

当仅选 CLI 时：
- 不装 MCP config → agent 不会看到 MCP tools
- 只装 Skill → agent 通过 SKILL.md 学习使用 `mindos file ...` 命令
- 不需要配 MCP 端口 → Step 3（端口配置）可以只问 Web 端口

当也选 MCP 时：
- 安装 MCP config + Skill（与当前行为一致）
- 需要 MCP 端口

#### 3.3 端口配置简化

如果用户只选了 CLI 模式，Step 3 只需问 Web 端口（用于 `mindos agent/ask` 和 Web UI）。MCP 端口使用默认值 8781，不展示。

### Part 4: SKILL.md 更新

#### 为什么移除 MCP 对照列

当前 SKILL.md 用双列表（CLI column / MCP column）列出每个操作的两种调用方式。CLI 能力补齐后，MCP 列应该移除：

1. **MCP tool 是自描述的**——agent 通过 MCP 协议连接时，server 在 session 初始化时已推送全部 tool 的 name + description + parameter schema，agent 已经知道怎么调，SKILL.md 再写一遍是纯冗余。
2. **SKILL.md 的价值在操作规则**——Bootstrap first、Read before write、NEVER 清单、Space 结构约定——这些是 MCP tool description 装不下的。操作表（"要做 X 用 Y tool"）对 MCP agent 没有增量信息。
3. **减少 token**——移除双列后 SKILL.md 体积缩小，每次对话都省 token。

#### 新操作表（单列 CLI）

```markdown
## Operations

| What | Command |
|------|---------|
| Bootstrap | `mindos file list` |
| List spaces | `mindos space list` |
| Read file | `mindos file read <path>` |
| Write file | `mindos file write <path> --content "..."` |
| Edit section | `mindos file edit-section <path> -H "heading" -c "..."` |
| Insert after heading | `mindos file insert-heading <path> -H "heading" -c "..."` |
| Append | `mindos file append <path> --content "..."` |
| Append CSV row | `mindos file append-csv <path> --row "a,b,c"` |
| Create file | `mindos file create <path> --content "..."` |
| Delete file | `mindos file delete <path>` |
| Rename/move | `mindos file rename <old> <new>` |
| Search | `mindos search "query"` 或 `mindos file search "query"` |
| Backlinks | `mindos file backlinks <path>` |
| Recent files | `mindos file recent` |
| Git history | `mindos file history <path>` |
| Create space | `mindos space create "name"` |

> If your agent connects via MCP, the corresponding tools are named `mindos_<operation>` —
> refer to the MCP tool descriptions for parameters.
```

## 影响范围

### 变更文件列表

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `bin/commands/file.js` | 修改 | 新增 8 个子命令 + 更新 help |
| `bin/lib/markdown.js` | 新增 | Markdown section 操作纯函数 |
| `bin/lib/csv.js` | 新增 | CSV RFC 4180 格式化纯函数 |
| `scripts/setup.js` | 修改 | Step 7 增加模式选择，条件化 MCP 安装 |
| `skills/mindos/SKILL.md` | 修改 | 统一为 CLI 命令表 |
| `app/data/skills/mindos/SKILL.md` | 修改 | 同步 SKILL.md |
| `skills/mindos-zh/SKILL.md` | 修改 | 中文版同步 |
| `app/data/skills/mindos-zh/SKILL.md` | 修改 | 中文版同步 |

### 不受影响的模块

- **MCP server（`mcp/src/index.ts`）**：不改动。26 个 tool 全部保留，MCP 仍然是完整功能的替代路径。
- **App API routes**：不改动。CLI 新子命令全部本地执行，不走 API。
- **Web UI**：不改动。
- **`bin/commands/agent.js` / `ask.js`**：不改动。这两个命令仍需 server。

### 是否有破坏性变更

无。所有改动为新增或向后兼容的修改：
- 新增的 CLI 子命令不影响现有子命令
- 现有 `create --force` 仍然可用
- Onboarding 行为变化：MCP 从默认安装变为 opt-in，但用户可以主动勾选

## 边界 case 与风险

### 边界 case

1. **content 含特殊字符（引号、换行、shell 元字符）**
   - 处理：优先支持 `--content-file <path>` 或 stdin 输入（`echo ... | mindos file write`）
   - `--content` 参数中的换行用 `\n` 转义，shell 引号由调用方处理

2. **edit-section 找不到 heading**
   - 处理：报错 `Heading "## xxx" not found in <path>`，列出文件中存在的 heading 供参考
   - 不静默失败（SKILL.md 已有 "NEVER" 规则禁止静默失败）

3. **并发写入（Agent A edit-section + Agent B append）**
   - 处理：read-modify-write 是非原子操作，存在竞态。CLI 模式下这是已知局限。
   - 缓解：SKILL.md 指导 Agent "multi-file edits require a plan first"（规则 4）
   - 长期：可考虑 file lock 或 optimistic concurrency（不在本 spec 范围）

4. **知识库在网络挂载/同步目录（iCloud/Dropbox）**
   - 处理：本地 fs 操作在同步目录上可能有延迟，但不影响正确性
   - 与现有 CLI 行为一致，无新增风险

5. **超大文件（>1MB markdown）**
   - 处理：`edit-section` 和 `insert-heading` 需要解析全文。对 >1MB 文件，打印警告但仍执行。
   - `--json` 输出不截断（agent 需要完整内容）

6. **CSV append-csv 文件不存在**
   - 处理：自动创建文件（与 MCP `append_csv` 行为一致）

### 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| Markdown 解析与 App 不一致 | 中 | 提取共享纯函数（`bin/lib/markdown.js`），CLI 和 App 使用相同逻辑 |
| 现有 Agent 的 SKILL.md 缓存 | 低 | Agent 每次对话都会重新读取 SKILL.md；`npx skills add` 更新也会覆盖 |
| MCP 默认 opt-out 导致部分用户困惑 | 低 | Cursor/Windsurf 等 MCP-native agent 的 SKILL.md 会提示 "如需更丰富的 tool 支持，运行 `mindos mcp install`" |

## 验收标准

### Part 1: CLI 子命令

- [ ] `mindos file write <path> --content "..."` 覆写文件成功，`--json` 输出正确
- [ ] `mindos file write <path>` 从 stdin 读取内容并覆写
- [ ] `mindos file append <path> --content "..."` 追加成功，末尾自动补换行
- [ ] `mindos file edit-section <path> -H "## heading" --content "new"` 正确替换 section
- [ ] `mindos file edit-section` heading 不存在时报错并列出可用 heading
- [ ] `mindos file insert-heading <path> -H "## heading" --content "new"` 在 heading 后插入
- [ ] `mindos file append-csv <path> --row "a,b,c"` 正确 RFC 4180 追加
- [ ] `mindos file append-csv` 含逗号/引号/换行的值正确转义
- [ ] `mindos file backlinks <path>` 返回引用该文件的文件列表
- [ ] `mindos file recent --limit 5` 返回最近修改的 5 个文件
- [ ] `mindos file history <path> --limit 3` 返回最近 3 条 git commit
- [ ] 所有新子命令在路径越界时报 "Access denied" 并退出
- [ ] 所有新子命令支持 `--json` 输出
- [ ] 所有新子命令在文件不存在时给出有意义的错误信息
- [ ] `mindos file --help` 展示所有子命令（含新增）

### Part 2: Onboarding

- [ ] Step 7 先展示模式选择（CLI 默认选中，MCP 未选中）
- [ ] 用户空格切换 CLI/MCP 选中状态
- [ ] CLI + MCP 至少选一个，否则提示
- [ ] 仅选 CLI 时：不写 MCP config，只装 Skill
- [ ] CLI + MCP 都选时：写 MCP config + 装 Skill（与当前行为一致）
- [ ] 仅选 CLI 时：Step 3 不展示 MCP 端口选项
- [ ] MCP 选项旁有 "(may use more tokens)" 提示

### Part 3: SKILL.md

- [ ] 操作表简化为单列 CLI 命令
- [ ] 所有 4 个 SKILL.md 副本内容一致
- [ ] MCP 用户有明确的 fallback 说明

### Part 4: 测试

- [ ] 新增子命令的单元测试覆盖正常路径 + 边界 case + 错误路径
- [ ] `bin/lib/markdown.js` 的 section 解析测试（多级 heading、空 section、末尾 section、无匹配 heading）
- [ ] `bin/lib/csv.js` 的 RFC 4180 转义测试
- [ ] 全量测试通过（`npm test`）
