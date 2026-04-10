# Spec: 知识库 GitHub 云同步

## 概览

MindOS 支持将本地知识库（`mindRoot` 目录）通过 Git 自动同步到远程仓库（GitHub/GitLab/任意 Git 服务），实现跨设备同步。

**核心思路**：把知识库目录本身作为一个 Git 仓库，后台自动 commit + push/pull，用户无需懂 Git。

```
设备 A (mindRoot/)           GitHub 仓库             设备 B (mindRoot/)
    │                      ┌────────────┐                │
    ├─ chokidar 监听文件变化 ─►│            │◄─ 定时 pull ───┤
    ├─ 30s 防抖 auto-commit ─►│  my-mind   │◄─ 30s auto-commit ─┤
    └─ git push ─────────────►│   (main)   │◄─ git push ───────┘
                              └────────────┘
```

---

## 架构分层

| 层 | 文件 | 职责 |
|---|---|---|
| **CLI** | `bin/cli.js` | `mindos sync` 命令族（init/now/on/off/conflicts/status） |
| **Core** | `bin/lib/sync.js` | Git 操作封装、auto-commit/pull、daemon、冲突处理 |
| **API** | `app/app/api/sync/route.ts` | Web API — GET 状态、POST 操作 |
| **UI: 配置** | `app/components/settings/SyncTab.tsx` | Settings 面板的 Sync tab，初始化表单 + 状态面板 |
| **UI: 状态** | `app/components/SyncStatusBar.tsx` | 侧边栏底部实时状态指示器 |
| **Config** | `~/.mindos/config.json` → `sync` 字段 | 持久化同步配置 |
| **State** | `~/.mindos/sync-state.json` | 运行时状态（lastSync、conflicts、errors） |

---

## 初始化流程

### 方式一：Web UI（Settings → Sync）

`SyncEmptyState` 组件提供表单：

| 字段 | 必填 | 说明 |
|---|---|---|
| Git Remote URL | ✅ | HTTPS (`https://github.com/...`) 或 SSH (`git@github.com:...`) |
| Access Token | 可选 | 仅 HTTPS，GitHub PAT / GitLab PAT，用于私有仓库 |
| Branch | 可选 | 默认 `main` |

点击 "Connect & Start Sync" 后：

```
SyncTab → POST /api/sync { action: 'init', remote, token, branch }
  → API route 层（route.ts）：
      1. 校验 URL 格式（HTTPS 或 SSH）
      2. 调用 CLI: node bin/cli.js sync init --non-interactive --remote <clean URL> --branch <branch> [--token <token>]
         （token 作为独立参数传递，不嵌入 URL）
  → initSync() in bin/lib/sync.js：
      1. git init (如果 mindRoot 不是 git repo)
      1b. 自动创建 .gitignore（如果不存在）
      2. 若 opts.token 存在：按平台选 credential helper + git credential approve 持久化
         （CLI 和 Web UI 路径统一，均由 initSync 处理 token）
      3. git remote add/set-url origin（clean URL，不含 token）
      4. git ls-remote --exit-code origin (测试连接，15s 超时)
      5. 保存 config.sync = { enabled: true, provider: 'git', ... }
      6. 首次同步：
         - 远程有内容 → git pull --allow-unrelated-histories
         - 远程为空 → autoCommitAndPush()
```

### 方式二：CLI

```bash
# 交互式
mindos sync init

# 非交互式（CI/脚本）
mindos sync init --non-interactive --remote <url> --token <pat> --branch main
```

---

## 自动同步 Daemon

`startSyncDaemon(mindRoot)` — 在 MindOS 服务启动时调用（`mindos dev` 和 `mindos start` 均会启动；`npm run dev` 通过 `instrumentation.ts` 自动启动）：

- **幂等保护**：多次调用不会重复启动（`activeWatcher` guard）
- **Graceful shutdown**：SIGTERM/SIGINT 时 flush 防抖中的变更再退出

### Auto-commit（文件变更 → 推送）

```
chokidar 监听 mindRoot/
  忽略: .git/, node_modules/, *.sync-conflict
  ↓ 文件变更
30s 防抖（configurable: autoCommitInterval）
  ↓
autoCommitAndPush():
  git add -A
  git status --porcelain (无变更则跳过)
  git commit -m "auto-sync: 2026-03-17 14:30:00"
  git push
  → 更新 sync-state.json { lastSync }
```

### Auto-pull（定时拉取远程变更）

```
每 300s (configurable: autoPullInterval) 执行一次
启动时立即执行一次
  ↓
autoPull():
  git pull --rebase --autostash  (优先 rebase)
  → 成功：更新 { lastPull }
  → rebase 冲突：
    git rebase --abort
    git pull --no-rebase  (降级为 merge)
    → 成功：更新 { lastPull }
    → merge 冲突：进入冲突处理
  最后：检查 unpushed commits，有则重试 push（覆盖之前 push 失败的场景）
```

---

## 冲突处理

当 merge 也产生冲突时：

```
1. git diff --name-only --diff-filter=U  → 获取冲突文件列表
2. 对每个冲突文件：
   a. git show :3:<file>  → 提取远程版本内容
   b. 写入 <file>.sync-conflict  → 保存远程版本供用户对比
   c. git checkout --ours "<file>"  → 保留本地版本
3. git add -A && git commit -m "auto-sync: resolved conflicts (kept both versions)"
4. 更新 sync-state.json:
   { conflicts: [{ file: "notes.md", time: "2026-03-17T..." }] }
```

**用户视角**：
- 本地版本保留不变（作为当前文件）
- 远程版本保存为 `<file>.sync-conflict`
- UI 中 SyncTab 显示冲突列表，可点击查看两个版本
- SyncStatusBar 变为红色脉冲 + 显示冲突数量

---

## 状态体系

### sync-state.json 结构

```json
{
  "lastSync": "2026-03-17T14:30:00.000Z",
  "lastPull": "2026-03-17T14:25:00.000Z",
  "conflicts": [],
  "lastError": null,
  "lastErrorTime": null
}
```

### config.json → sync 字段

```json
{
  "sync": {
    "enabled": true,
    "provider": "git",
    "remote": "origin",
    "branch": "main",
    "autoCommitInterval": 30,
    "autoPullInterval": 300
  }
}
```

### StatusLevel 状态机

`getStatusLevel(status, syncing)` 按优先级：

```
syncing (正在同步)  →  蓝色 pulse
  ↓ not syncing
off (未启用)        →  灰色
  ↓ enabled
error (lastError)   →  红色（SyncDot/MobileSyncDot 脉冲，主 StatusBar 不脉冲）
  ↓ no error
conflicts (有冲突)  →  红色 pulse
  ↓ no conflicts
unpushed (> 0)      →  黄色
  ↓ unpushed = 0
synced              →  绿色
```

### UI 状态展示

**SyncStatusBar**（侧边栏底部）：
- 30s 轮询 `GET /api/sync` 刷新状态
- 页面不可见时暂停轮询（`visibilitychange`）
- 60s 刷新 `timeAgo` 显示
- 状态变更 toast（如 error → synced 时显示 "Sync restored"）
- 手动 Sync Now 按钮（旋转动画 + 成功/失败闪烁）
- 未配置时显示可关闭的 "Enable sync →" 提示

**SyncDot**（侧边栏折叠时）：右上角小圆点

**MobileSyncDot**（移动端 header）：仅在需要关注时显示（error/conflicts/unpushed）

---

## API 接口

### `GET /api/sync`

返回当前同步状态。

**Response** (sync enabled):
```json
{
  "enabled": true,
  "provider": "git",
  "remote": "https://github.com/user/my-mind.git",
  "branch": "main",
  "lastSync": "2026-03-17T14:30:00.000Z",
  "lastPull": "2026-03-17T14:25:00.000Z",
  "unpushed": "0",
  "conflicts": [],
  "lastError": null,
  "autoCommitInterval": 30,
  "autoPullInterval": 300
}
```

**Response** (sync disabled):
```json
{ "enabled": false }
```

### `POST /api/sync`

| action | 参数 | 说明 |
|---|---|---|
| `init` | `remote`, `token?`, `branch?` | 初始化同步 |
| `now` | — | 手动触发 pull + commit + push（委托给 CLI `manualSync()`，冲突处理与 daemon 一致） |
| `on` | — | 启用 auto-sync |
| `off` | — | 禁用 auto-sync |

---

## CLI 命令

```bash
mindos sync              # 显示状态摘要
mindos sync init         # 交互式配置远程仓库
mindos sync now          # 手动触发同步（pull + commit + push）
mindos sync conflicts    # 列出冲突文件
mindos sync on           # 启用 auto-sync
mindos sync off          # 禁用 auto-sync
```

---

## 认证方式

| 方式 | 格式 | Token 处理 |
|---|---|---|
| HTTPS + Token | `https://github.com/user/repo.git` + token | CLI 和 Web UI 路径统一：`initSync()` 按平台选 credential helper（macOS: osxkeychain, Windows: manager, Linux: store），通过 `git credential approve` 持久化；remote URL 保持干净，不含 token |
| HTTPS 无 Token | 同上 | 仅适用于公开仓库 |
| SSH | `git@github.com:user/repo.git` | 依赖系统 SSH key 配置 |

---

## 测试覆盖

| 测试文件 | 覆盖范围 |
|---|---|
| `__tests__/core/sync.test.ts` | Git 操作（init、branch、status、auto-commit、空仓库跳过）、冲突文件创建、state/config 读写 |
| `__tests__/core/sync-status.test.ts` | `timeAgo()` 格式化、`getStatusLevel()` 优先级逻辑（17 个用例） |

---

## 设计决策

| 决策 | 理由 |
|---|---|
| 用 Git 而非自建同步协议 | 用户已有 GitHub 账号；Git 成熟可靠；支持任意 Git 服务 |
| 知识库目录 = Git 仓库 | 零额外结构；用户可以在其他 Git 客户端操作 |
| rebase 优先，merge 降级 | rebase 保持线性历史更干净；冲突时 merge 更安全 |
| 冲突保留双版本 | 不自动合并内容（容易出错），让用户手动选择 |
| API route 调用 CLI 做 init | 避免 Turbopack 下 Node.js 模块解析问题 |
| chokidar 文件监听 + 防抖 | 避免每次保存都立即 push；30s 是批量化效率和实时性的平衡 |
| commit message 用时间戳 | `auto-sync: 2026-03-17 14:30:00` — 简单、可追溯、无歧义 |

---

## 已知限制

| # | 限制 | 严重度 | 说明 |
|---|---|---|---|
| 1 | 不支持多分支 | Low | 固定使用一个 branch，不支持切换 |
| 2 | Token 明文存储（Linux） | Low | Linux 使用 `credential-store`（`~/.git-credentials` 明文，`chmod 600` 保护）；macOS/Windows 使用系统钥匙串/凭证管理器，已加密。✅ CLI 和 Web UI 路径已统一 |
| 3 | 大文件无优化 | Low | 无 Git LFS 支持，大附件会膨胀仓库 |
| 4 | ~~Daemon 依赖 CLI 启动~~ | ~~Medium~~ | ✅ 已修复：`instrumentation.ts` 在 Next.js 启动时自动启动 daemon，无需经过 CLI |
| 5 | 冲突解决无合并编辑器 | Low | 只能查看双版本，手动复制粘贴 |
| 6 | auto-commit 间隔不可在 UI 配置 | Low | 需手动编辑 config.json |
| 7 | ~~`now` action 冲突处理不完整~~ | ~~Medium~~ | ✅ 已修复：`now` action 委托给 CLI `manualSync()` → `autoPull()`，冲突处理与 daemon 一致 |

---

## 优化路线图

### P0：可靠性与数据安全 ✅ 已全部实现

#### O1. ✅ 绕过 CLI 启动时无 daemon（已修复）

新建 `app/instrumentation.ts`，Next.js 启动时自动检测并启动 daemon。`startSyncDaemon()` 加入幂等保护（`activeWatcher` guard）。使用 `/* webpackIgnore: true */` + 绝对路径 + `serverExternalPackages: ['chokidar']` 解决 Turbopack 兼容问题。

**影响文件**：`app/instrumentation.ts`（新建）、`bin/lib/sync.js`、`app/next.config.ts`

---

#### O2. ✅ 进程退出前 flush 变更（已修复）

`startSyncDaemon()` 注册 SIGTERM/SIGINT handler，退出前 flush 防抖中的变更。`stopSyncDaemon()` 清理信号监听器。

**影响文件**：`bin/lib/sync.js`

---

#### O3. ✅ push 失败自动重试（已修复）

`autoPull()` 末尾追加 unpushed commits 检查，有则重试 push。无 upstream 时静默忽略（避免首次 init 时的误报）。

**影响文件**：`bin/lib/sync.js` → `autoPull()`

---

#### O4. ✅ Token 安全性（已修复）

- `initSync()` 按平台选 credential helper（osxkeychain/manager/store）
- `git credential approve` 后再 `chmod 600`（顺序修正）
- API route 不再将 token 嵌入 URL，改为独立 `--token` 参数
- CLI 和 Web UI 路径统一

**影响文件**：`bin/lib/sync.js` → `initSync()`、`app/app/api/sync/route.ts`

---

#### O5. ✅ 自动生成 .gitignore（已修复）

`initSync()` 在 git init 后自动创建 `.gitignore`（不覆盖已有文件）。

**影响文件**：`bin/lib/sync.js` → `initSync()`

---

#### Bonus: ✅ `now` action 冲突处理统一（已修复）

- API route `now` case 委托给 CLI `manualSync()`
- `manualSync()` 改为 throw 而非 `process.exit(1)`
- CLI `sync now` 包裹 try/catch 处理异常

**影响文件**：`app/app/api/sync/route.ts`、`bin/lib/sync.js`、`bin/cli.js`

---

### P1：用户体验

#### O6. 冲突解决 — side-by-side diff 视图

**问题**：当前冲突处理只是把两个版本放在那里（`file` + `file.sync-conflict`），用户需要手动打开两个文件复制粘贴。

**方案**：在 SyncTab 冲突列表中，点击冲突文件后打开一个 diff 视图：

```
┌─────────────────────┬─────────────────────┐
│   Local (yours)     │   Remote (theirs)   │
│                     │                     │
│   line 1            │   line 1            │
│ - local change      │ + remote change     │
│   line 3            │   line 3            │
└─────────────────────┴─────────────────────┘
        [ Keep Local ]  [ Accept Remote ]  [ Edit Manually ]
```

不需要完整的 merge editor，只需：
1. 读取 `<file>` 和 `<file>.sync-conflict` 的内容
2. 用现有的 diff 库（如 `diff-match-patch`）高亮差异
3. 提供三个按钮：保留本地 / 采用远程 / 在编辑器中打开手动合并
4. 解决后删除 `.sync-conflict` 文件并清除 `sync-state.json` 中的冲突记录

**新增文件**：`app/components/SyncConflictResolver.tsx`
**修改文件**：`app/components/settings/SyncTab.tsx`

---

#### O7. auto-commit / auto-pull 间隔可在 UI 配置

**问题**：SyncTab 显示了 `commit: 30s, pull: 5min` 但不能修改。

**方案**：在 SyncTab 的状态面板中，把 auto-commit 和 auto-pull 间隔改为可编辑的 input：

```tsx
<div className="flex items-center gap-2">
  <span className="text-muted-foreground w-24">Auto-commit</span>
  <input type="number" min={10} max={300} value={autoCommitInterval}
    onChange={...} className="w-20 ..." />
  <span className="text-xs text-muted-foreground">seconds</span>
</div>
```

保存时写回 `config.json` 的 `sync.autoCommitInterval` / `sync.autoPullInterval`，并通知 daemon 重启定时器。

新增 API action：`POST /api/sync { action: 'update-config', autoCommitInterval, autoPullInterval }`

**影响文件**：`app/components/settings/SyncTab.tsx`、`app/app/api/sync/route.ts`、`bin/lib/sync.js`

---

#### O8. 断开同步（Disconnect）入口

**问题**：只有 "Disable Auto-sync"（暂停），没有"断开连接"。用户想换仓库或彻底移除同步需要手动操作。

**方案**：新增 "Disconnect" 按钮和对应 API action：

```
POST /api/sync { action: 'disconnect' }
  → git remote remove origin
  → config.sync = { enabled: false }
  → 清空 sync-state.json
  → 不删除 .git 目录（保留本地历史）
```

UI 中用红色文字 + 确认弹窗，防止误操作。

**影响文件**：`app/app/api/sync/route.ts`、`app/components/settings/SyncTab.tsx`、`bin/lib/sync.js`（新增 `disconnectSync()`）

---

#### O9. commit message 增加语义信息

**问题**：`auto-sync: 2026-03-17 14:30:00` 看不出改了什么。

**方案**：从 `git status --porcelain` 统计变更文件数，生成更有信息量的 message：

```js
function buildCommitMessage(mindRoot) {
  const status = gitExec('git status --porcelain', mindRoot);
  const lines = status.split('\n').filter(Boolean);
  let added = 0, modified = 0, deleted = 0;
  for (const line of lines) {
    const code = line.slice(0, 2);
    // git status --porcelain codes: '??' = untracked, 'A ' = added, ' D'/'D ' = deleted, 'M '/' M' = modified
    if (code === '??' || code.trimEnd() === 'A') added++;
    else if (code.includes('D')) deleted++;
    else modified++;
  }
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const parts = [];
  if (added) parts.push(`+${added}`);
  if (modified) parts.push(`~${modified}`);
  if (deleted) parts.push(`-${deleted}`);
  return `auto-sync: ${parts.join(' ')} (${timestamp})`;
  // 例：auto-sync: +3 ~2 -1 (2026-03-17 14:30)
}
```

**影响文件**：`bin/lib/sync.js` → `autoCommitAndPush()`

---

### P2：锦上添花

#### O10. 同步活动日志

**问题**：用户看不到历史同步记录，不知道什么时候同步过、同步了什么。

**方案**：在 SyncTab 底部新增 "Recent Activity" 折叠面板，从 git log 取最近 N 条 auto-sync commits：

```
POST /api/sync { action: 'history', limit: 10 }
  → git log --oneline -10 --grep='auto-sync'
  → [{ hash, message, time }, ...]
```

UI 展示为简洁的时间线列表。

**影响文件**：`app/app/api/sync/route.ts`、`app/components/settings/SyncTab.tsx`

---

#### O11. 首次同步进度反馈

**问题**：大知识库首次 `git pull` 可能很慢（几十秒到几分钟），但 UI 只显示 "Connecting..."，用户不知道在等什么。

**方案**：
- 短期：在 SyncEmptyState 的 "Connecting..." 状态下增加阶段提示文字（"Testing connection..." → "Pulling remote content..." → "Almost done..."）
- 长期：用 SSE 或轮询 `/api/sync?action=init-progress` 实时反馈 git clone/pull 进度

短期方案只需修改 `SyncTab.tsx` 的 `connecting` 状态文字，按超时时间切换：

```tsx
const [connectPhase, setConnectPhase] = useState(0);
useEffect(() => {
  if (!connecting) { setConnectPhase(0); return; }
  const t1 = setTimeout(() => setConnectPhase(1), 3000);  // 3s: "Pulling..."
  const t2 = setTimeout(() => setConnectPhase(2), 10000); // 10s: "Large repo, please wait..."
  return () => { clearTimeout(t1); clearTimeout(t2); };
}, [connecting]);
```

**影响文件**：`app/components/settings/SyncTab.tsx`

---

### 优先级总览

| 优先级 | ID | 标题 | 复杂度 | 状态 |
|---|---|---|---|---|
| **P0** | O1 | 绕过 CLI 启动时自动启动 daemon | 中 | ✅ 已完成 |
| **P0** | O2 | 进程退出前 flush 变更 | 低 | ✅ 已完成 |
| **P0** | O3 | push 失败自动重试 | 低 | ✅ 已完成 |
| **P0** | O4 | Token 安全性 | 低 | ✅ 已完成 |
| **P0** | O5 | 自动生成 .gitignore | 低 | ✅ 已完成 |
| **P0** | — | `now` action 冲突处理统一 (bonus) | 低 | ✅ 已完成 |
| **P1** | O6 | 冲突 diff 视图 | 高 | 体验 — 当前冲突解决方式太原始 |
| **P1** | O7 | 同步间隔 UI 配置 | 低 | 体验 — 用户可控 |
| **P1** | O8 | Disconnect 入口 | 低 | 体验 — 完整的生命周期管理 |
| **P1** | O9 | 语义化 commit message | 低 | 体验 — 同步历史可读性 |
| **P2** | O10 | 同步活动日志 | 中 | 体验 — 可观测性 |
| **P2** | O11 | 首次同步进度反馈 | 低 | 体验 — 减少等待焦虑 |
