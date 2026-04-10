# Spec: Desktop Core Hot Update

## 目标

Desktop 用户无需退出应用、无需重装安装包，即可将 MindOS Core（Web UI + MCP Server）更新到最新版本。壳（Electron 主进程）和 Core 独立更新，Core 更新频率高（周级），壳更新频率低（月级）。

## 现状分析

当前 Desktop 的 Core 版本**冻结在打包时刻**。v0.1.2 内置 Core v0.6.37，此后无论 Core 发了多少版本，Desktop 用户看到的始终是 v0.6.37 的 UI，除非：

- 用户手动 `npm i -g @geminilight/mindos`（桌面端用户不会做）
- 发新版 Desktop（需要退出重启，下载 150MB，CI 要 macOS 公证签名 12 分钟）

CLI / 浏览器用户可以通过 Settings → Update 一键热更新，体验远优于 Desktop 用户。这不合理。

### 当前版本选择逻辑（`prefer-newer` 策略）

```
候选来源：
  1. override（env / config，调试用）
  2. user（npm global install）
  3. bundled（app 内 Resources/mindos-runtime/）

两两 semver 比较，取版本最高且 runnable 的。
```

### 壳对 Core 的依赖（版本契约）

壳调用的 Core API 极少且稳定：

| 调用 | 用途 | 变化可能性 |
|------|------|-----------|
| `GET /api/health` | 启动探活 | 极低 |
| `GET /api/setup` | 读配置回填 Setup Wizard | 低（字段只增不减） |
| `POST /api/setup` | 写配置 | 低 |
| `POST /api/restart` | 重启服务 | 极低 |

壳还读 `config.json` 的 `mindRoot`、`port`、`mcpPort`、`authToken`、`webPassword` 等字段——这些是 MindOS 的核心 schema，向后兼容是产品基本要求。

**结论：壳和 Core 之间的耦合点少且稳定，独立更新是可行的。**

## 数据流 / 状态流

### 更新流程

```
┌─ 主进程 (core-updater.ts) ────────────────────────────────────────┐
│                                                                    │
│  ① check(currentCoreVersion)                                      │
│     请求 manifest (latest.json) → 最新版本 + 下载 URLs             │
│     对比 当前运行的 Core 版本                                       │
│     → CoreUpdateInfo { available, current, latest, urls, size }    │
│                                                                    │
│  ② download(urls[], expectedVersion, expectedSize, expectedSha256) │
│     清理残留 runtime-downloading/（如有）                            │
│     尝试 urls[0] 下载 → 超时/失败 → urls[1] → ...                  │
│     流式写入 + 计算 SHA256                                          │
│     解压到 runtime-downloading/（--strip-components=1 去掉外层目录） │
│     校验：version 匹配 + 关键文件存在 + SHA256 匹配                  │
│     → 'core-update-progress' 事件 (percent)                        │
│     → 下载完成返回，不做替换                                         │
│                                                                    │
│  ③ applyAndRestart()  ← 一个不可分割的操作                          │
│     注入 overlay "Updating..."                                     │
│     processManager.stop()                // 先停进程，释放文件锁     │
│     原子替换 runtime/ 目录                // 进程已停，文件不被锁定   │
│     startLocalMode()                     // 重新 resolve → 选中新版 │
│     mainWindow.loadURL(...)              // 刷新页面，移除 overlay   │
│     → 'core-update-applied' 事件                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

原子替换策略（跨平台安全）：
  存在旧 runtime/ → rename runtime/ → runtime-old/
  rename runtime-downloading/ → runtime/
  rm -rf runtime-old/     （异步，失败不影响）

  如果第二步 rename 失败 → rename runtime-old/ → runtime/（回滚）
```

### Runtime 包目录结构

runtime 包**必须保持和原始项目完全一致的目录结构**，因为 ProcessManager 依赖固定路径：

```
~/.mindos/runtime/              ← 等同于一个 MindOS projectRoot
├── package.json                ← 版本号 + name
├── app/
│   └── .next/
│       ├── standalone/
│       │   ├── server.js       ← ProcessManager 启动入口
│       │   └── node_modules/   ← Next.js tree-shake 后的精简依赖
│       ├── server/             ← SSR 页面 + API routes
│       └── static/             ← 客户端 JS/CSS
├── mcp/
│   └── dist/
│       └── index.cjs           ← MCP server bundle
├── bin/                        ← CLI scripts
├── templates/                  ← 初始化模板
└── skills/                     ← AI skill 定义
```

实测大小（v0.6.37）：未压缩 ~125MB，tar.gz 压缩后 **~32MB**。

### 版本选择逻辑变化

```
现有 3 路 → 新增 1 路，变成 4 路：

候选来源：
  1. override     — env / config 强制指定
  2. cached       — ~/.mindos/runtime/   ← 新增
  3. user         — npm global install
  4. bundled      — app 内置

策略不变：prefer-newer 取 semver 最高的 runnable 候选。
版本相同时优先级：override > cached > user > bundled

"当前运行版本"的来源：
  startLocalMode() 调用 resolveLocalMindOsProjectRoot() 时返回 pick.version，
  存入模块级变量 currentCoreVersion，供 CoreUpdater.check() 对比。
```

### 启动时清理逻辑

```
app ready 后，在 startLocalMode 之前执行：

1. runtime-old/ 存在 → rm -rf（上次 apply 的残留）
2. cached 版本 <= bundled 版本 → rm -rf runtime/（过期，bundled 更新）
3. runtime-downloading/ 存在且 runnable：
   → 记录 pendingVersion，启动后通知 UI 显示 "v0.6.42 ready"
   → 跳过下载步骤，用户直接点 "Restart Services" 即可
4. runtime-downloading/ 存在但不 runnable → rm -rf（损坏/中断的下载）
```

### 状态流转

```
                     ┌──── 启动时有 pending ────┐
                     ↓                          │
[idle] ──检查──→ [checking]                     │
                   │                            │
            无更新 ↓         有更新              │
          [up-to-date]    [available]           │
                            │                   │
                     用户点击 ↓               用户取消
                       [downloading] ──────────→ [available]
                            │
                  网络失败 ↓          完成
                       [error]     [ready] ←────┘
                            │          │
                     用户重试 ↓   用户点击 ↓
                       [downloading]  [applying]
                                        │
                                   成功 ↓       失败
                                 [applied]    [error]
                                   → 页面刷新    → 服务用旧版恢复
```

## 方案

### 1. Runtime 包的制作与分发

**CI 侧**（`scripts/build-runtime-archive.sh`，新增）：

```bash
#!/bin/bash
# 从已构建的 standalone 产物组装精简 runtime 包。
# 目录结构必须和原始项目一致，因为 ProcessManager 依赖固定路径。
set -euo pipefail
VERSION=$(node -p "require('./package.json').version")
WORK=/tmp/mindos-runtime
rm -rf "$WORK"

# ── 核心运行时 ──
mkdir -p "$WORK/app/.next/standalone"
cp app/.next/standalone/server.js "$WORK/app/.next/standalone/"
cp -r app/.next/standalone/node_modules "$WORK/app/.next/standalone/node_modules"
cp -r app/.next/standalone/.next/server "$WORK/app/.next/server"  # SSR
cp -r app/.next/static "$WORK/app/.next/static"                   # Client assets

# ── MCP ──
mkdir -p "$WORK/mcp/dist"
cp mcp/dist/index.cjs "$WORK/mcp/dist/"

# ── 元数据 + 辅助 ──
cp package.json "$WORK/"
cp -r bin "$WORK/"
cp -r templates "$WORK/"
cp -r skills "$WORK/"

# ── 打包（不包含外层目录名，解压即平铺） ──
ARCHIVE="mindos-runtime-${VERSION}.tar.gz"
tar czf "/tmp/${ARCHIVE}" -C "$WORK" .

# ── 自校验 ──
VERIFY=/tmp/verify-$$
mkdir -p "$VERIFY" && tar xzf "/tmp/${ARCHIVE}" -C "$VERIFY"
for f in app/.next/standalone/server.js app/.next/standalone/node_modules \
         app/.next/server package.json mcp/dist/index.cjs; do
  [ -e "$VERIFY/$f" ] || { echo "❌ MISSING: $f"; exit 1; }
done
rm -rf "$VERIFY" "$WORK"

SIZE=$(stat -c%s "/tmp/${ARCHIVE}" 2>/dev/null || stat -f%z "/tmp/${ARCHIVE}")
SHA256=$(sha256sum "/tmp/${ARCHIVE}" 2>/dev/null || shasum -a 256 "/tmp/${ARCHIVE}" | cut -d' ' -f1)
echo "✅ ${ARCHIVE} ($(numfmt --to=iec ${SIZE})) sha256=${SHA256}"
```

关键点：`tar czf ... -C "$WORK" .` — 打包内容不带外层目录名，解压直接平铺到目标目录。

**Manifest（`runtime/latest.json`）**：

```json
{
  "version": "0.6.42",
  "minDesktopVersion": "0.1.2",
  "size": 33554432,
  "sha256": "a1b2c3d4...",
  "urls": [
    "https://releases.mindos.com/runtime/mindos-runtime-0.6.42.tar.gz",
    "https://mindos-releases.oss-cn-shanghai.aliyuncs.com/runtime/mindos-runtime-0.6.42.tar.gz"
  ]
}
```

CDN 选择策略：**不检测地区。** `urls` 按优先级排列，下载时尝试第一个，5 秒无响应 fallback 到下一个。manifest 和 tarball 下载都用同一逻辑。

`latest.json` 请求时加 `?t={timestamp}` 防缓存；CDN 上传时设 `Cache-Control: no-cache, max-age=60`。

### 2. Desktop 侧新增文件

#### `desktop/src/core-updater.ts`（新文件）

```typescript
import { EventEmitter } from 'events';
import { app } from 'electron';
import path from 'path';
import {
  existsSync, mkdirSync, renameSync, rmSync,
  createWriteStream, readFileSync, statSync,
} from 'fs';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import https from 'https';
import { extract } from 'tar';
import { analyzeMindOsLayout } from './mindos-runtime-layout';

const MANIFEST_URLS = [
  'https://releases.mindos.com/runtime/latest.json',
  'https://mindos-releases.oss-cn-shanghai.aliyuncs.com/runtime/latest.json',
];
const CONFIG_DIR = path.join(app.getPath('home'), '.mindos');
const RUNTIME_DIR = path.join(CONFIG_DIR, 'runtime');
const DOWNLOAD_DIR = path.join(CONFIG_DIR, 'runtime-downloading');
const OLD_DIR = path.join(CONFIG_DIR, 'runtime-old');
const URL_TIMEOUT = 5_000;   // 单个 URL 超时

export interface CoreUpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  urls: string[];             // tarball URLs（按优先级）
  size: number;
  sha256: string;
  minDesktopVersion: string;
  desktopTooOld: boolean;     // true = 需要先更新 Desktop
}

export class CoreUpdater extends EventEmitter {
  private abortController: AbortController | null = null;

  /** 请求 manifest，对比当前版本 */
  async check(currentVersion: string): Promise<CoreUpdateInfo> {
    const manifest = await this.fetchWithFallback(
      MANIFEST_URLS.map(u => `${u}?t=${Date.now()}`),
    );
    const data = JSON.parse(manifest);
    const available = !!data.version && data.version !== currentVersion
      && semver.gt(data.version, currentVersion);
    return {
      available,
      currentVersion,
      latestVersion: data.version,
      urls: data.urls || [],
      size: data.size || 0,
      sha256: data.sha256 || '',
      minDesktopVersion: data.minDesktopVersion || '0.0.0',
      desktopTooOld: semver.gt(data.minDesktopVersion || '0.0.0', app.getVersion()),
    };
  }

  /**
   * 下载并解压到 DOWNLOAD_DIR。不做替换。
   * 发射 'progress' 事件 { percent, transferred, total }。
   * urls 数组支持自动 fallback。
   */
  async download(
    urls: string[],
    expectedVersion: string,
    expectedSize: number,
    expectedSha256: string,
  ): Promise<void> {
    // 清理上次残留
    if (existsSync(DOWNLOAD_DIR)) rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
    mkdirSync(DOWNLOAD_DIR, { recursive: true });

    this.abortController = new AbortController();
    const tarballPath = path.join(CONFIG_DIR, 'runtime-download.tar.gz');

    // 下载（带 CDN fallback）
    await this.downloadWithFallback(urls, tarballPath, expectedSize);

    // SHA256 校验
    if (expectedSha256) {
      const hash = createHash('sha256');
      const data = readFileSync(tarballPath);
      hash.update(data);
      const actual = hash.digest('hex');
      if (actual !== expectedSha256) {
        rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
        rmSync(tarballPath, { force: true });
        throw new Error(`SHA256 mismatch: expected ${expectedSha256}, got ${actual}`);
      }
    }

    // 解压（直接平铺到 DOWNLOAD_DIR，无外层目录）
    await extract({ file: tarballPath, cwd: DOWNLOAD_DIR });
    rmSync(tarballPath, { force: true });

    // 校验关键文件
    const layout = analyzeMindOsLayout(DOWNLOAD_DIR);
    if (!layout.runnable) {
      rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
      throw new Error('Downloaded runtime is incomplete (missing server.js or mcp)');
    }
    if (layout.version !== expectedVersion) {
      rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
      throw new Error(`Version mismatch: expected ${expectedVersion}, got ${layout.version}`);
    }

    this.abortController = null;
  }

  /** 取消正在进行的下载 */
  cancelDownload(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * 原子替换 runtime-downloading → runtime。
   * 调用方必须先 processManager.stop() 再调此方法。
   */
  apply(): string {
    // 旧版 → old
    if (existsSync(RUNTIME_DIR)) {
      if (existsSync(OLD_DIR)) rmSync(OLD_DIR, { recursive: true, force: true });
      renameSync(RUNTIME_DIR, OLD_DIR);
    }
    // 新版 → current
    try {
      renameSync(DOWNLOAD_DIR, RUNTIME_DIR);
    } catch (err) {
      // 回滚：恢复旧版
      if (existsSync(OLD_DIR)) renameSync(OLD_DIR, RUNTIME_DIR);
      throw err;
    }
    // 清理旧版（异步，失败不影响）
    if (existsSync(OLD_DIR)) {
      rmSync(OLD_DIR, { recursive: true, force: true });
    }
    return RUNTIME_DIR;
  }

  /** 读取缓存版本 */
  getCachedVersion(): string | null {
    try {
      const pkg = JSON.parse(readFileSync(path.join(RUNTIME_DIR, 'package.json'), 'utf-8'));
      return pkg.version || null;
    } catch { return null; }
  }

  /** 检查 runtime-downloading/ 是否有完整可用的 runtime（上次下载完但未 apply） */
  getPendingVersion(): string | null {
    if (!existsSync(DOWNLOAD_DIR)) return null;
    const layout = analyzeMindOsLayout(DOWNLOAD_DIR);
    return layout.runnable ? layout.version : null;
  }

  /** 启动时清理过期/残留文件 */
  cleanupOnBoot(bundledVersion: string | null): void {
    // 1. 清理 runtime-old/（上次 apply 的残留）
    if (existsSync(OLD_DIR)) {
      rmSync(OLD_DIR, { recursive: true, force: true });
    }
    // 2. cached <= bundled → 删除过期 cached
    if (bundledVersion && existsSync(RUNTIME_DIR)) {
      const cached = this.getCachedVersion();
      if (cached && bundledVersion && semver.gte(bundledVersion, cached)) {
        rmSync(RUNTIME_DIR, { recursive: true, force: true });
      }
    }
    // 3. runtime-downloading/ 存在但不 runnable → 清理
    if (existsSync(DOWNLOAD_DIR)) {
      const layout = analyzeMindOsLayout(DOWNLOAD_DIR);
      if (!layout.runnable) {
        rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
      }
      // runnable 的留着，UI 会显示 "ready"
    }
  }

  // ... fetchWithFallback / downloadWithFallback 内部实现 ...
}
```

#### `desktop/src/preload.ts`（新增 IPC）

```typescript
// Core 更新 (Desktop 独有)
checkCoreUpdate: () => ipcRenderer.invoke('check-core-update'),
downloadCoreUpdate: (urls: string[], version: string, size: number, sha256: string) =>
  ipcRenderer.invoke('download-core-update', urls, version, size, sha256),
cancelCoreDownload: () => ipcRenderer.invoke('cancel-core-download'),
applyCoreUpdate: () => ipcRenderer.invoke('apply-core-update'),
getCoreUpdatePending: () => ipcRenderer.invoke('get-core-update-pending'),
onCoreUpdateProgress: (cb) => onChannel('core-update-progress', cb),
onCoreUpdateAvailable: (cb) => onChannel('core-update-available', cb),
```

#### `desktop/src/main.ts`（新增 IPC handler + 启动集成）

```typescript
let currentCoreVersion: string | null = null;
const coreUpdater = new CoreUpdater();

// ── 启动时集成 ──

// 在 startLocalMode 中，resolve 完成后：
// 1. 先执行清理
coreUpdater.cleanupOnBoot(bundledAnalysis.version);
// 2. resolve（此时 cached 已被清理或保留）
const result = await resolveLocalMindOsProjectRoot(config, nodePath);
// 3. 记录当前版本
currentCoreVersion = result.pick.version;

// ── IPC handlers ──

ipcMain.handle('check-core-update', async () => {
  if (currentMode !== 'local' || !currentCoreVersion) {
    return { available: false, currentVersion: '', latestVersion: '' };
  }
  return coreUpdater.check(currentCoreVersion);
});

ipcMain.handle('download-core-update', async (_e, urls, version, size, sha256) => {
  await coreUpdater.download(urls, version, size, sha256);
});

ipcMain.handle('cancel-core-download', () => {
  coreUpdater.cancelDownload();
});

ipcMain.handle('get-core-update-pending', () => {
  return { version: coreUpdater.getPendingVersion() };
});

ipcMain.handle('apply-core-update', async () => {
  if (isQuitting || isUpdating) throw new Error('App is shutting down');

  // 不可分割：overlay → stop → replace → restart → load
  if (mainWindow && !mainWindow.isDestroyed()) {
    await injectOverlay('mindos-update-overlay', `
      <div style="...">Updating MindOS...</div>
    `);
  }

  try {
    // 1. 停进程（释放文件锁，Windows 必须先停）
    if (processManager) await processManager.stop();

    // 2. 原子替换文件
    coreUpdater.apply();

    // 3. 用新路径重启（内部 resolve 会选中新 runtime）
    invalidateConfig();
    const url = await startLocalMode();
    if (url && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(resolveLocalMindOsBrowseUrl(url));
    }
    return { ok: true, version: coreUpdater.getCachedVersion() };
  } catch (err) {
    // 恢复：旧服务重新启动
    try {
      invalidateConfig();
      const url = await startLocalMode();
      if (url && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(resolveLocalMindOsBrowseUrl(url));
      }
    } catch { /* 最坏情况用户需要重启 Desktop */ }
    throw err;
  }
});

// ── 静默检查（启动 30s 后） ──

setTimeout(async () => {
  if (currentMode !== 'local' || !currentCoreVersion) return;
  try {
    // 先检查有没有上次下载完但未 apply 的
    const pending = coreUpdater.getPendingVersion();
    if (pending) {
      mainWindow?.webContents.send('core-update-available', {
        current: currentCoreVersion,
        latest: pending,
        ready: true,  // 已下载，可以直接 apply
      });
      return;
    }
    // 否则检查远程
    const info = await coreUpdater.check(currentCoreVersion);
    if (info.available && !info.desktopTooOld && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('core-update-available', {
        current: info.currentVersion,
        latest: info.latestVersion,
        ready: false,
      });
    }
  } catch { /* 静默失败 */ }
}, 30_000);
```

### 3. Runtime 选择逻辑扩展

**`mindos-runtime-resolve.ts`** — 新增 cached 候选：

```typescript
// 在 user 和 bundled 之间插入 cached
const cachedDir = path.join(app.getPath('home'), '.mindos', 'runtime');
const cachedExists = existsSync(cachedDir);
const cachedAnalysis = cachedExists ? analyzeMindOsLayout(cachedDir) : { version: null, runnable: false };
```

**`mindos-runtime-pick.ts`** — input 新增 3 个字段：

```typescript
interface MindOsRuntimePickInput {
  // ...existing...
  cachedRoot: string | null;
  cachedVersion: string | null;
  cachedRunnable: boolean;
}
```

`pickMindOsRuntime` 的 `prefer-newer` 分支：从 `[cached, user, bundled]` 中取 semver 最高且 runnable 的（override 仍然最高优先级）。版本相同时 cached > user > bundled。

### 4. UI 改动

**`app/components/settings/UpdateTab.tsx`** — Desktop 模式分两张卡片：

```
┌─ MindOS Core ─────────────────────────────────────┐
│ v0.6.37                                            │
│                                                    │
│ [available]                                        │
│ ⬆️ v0.6.42 available (32 MB)                       │
│ [ Update ]                                         │
│                                                    │
│ [downloading]                                      │
│ ⏳ Downloading v0.6.42...   [ Cancel ]             │
│ ━━━━━━━━━━━━━━░░░░ 70%                             │
│                                                    │
│ [ready] （下载完成 或 启动时检测到 pending）          │
│ ✅ v0.6.42 ready                                   │
│ [ Restart Services ]                               │
│                                                    │
│ [applying]                                         │
│ ⏳ Applying update...                               │
│ （overlay 覆盖整个窗口）                              │
│                                                    │
│ [desktopTooOld]                                    │
│ ⚠️ v0.7.0 requires Desktop v0.2.0+                │
│ Please update Desktop first.                       │
│                                                    │
│ [error]                                            │
│ ✗ Download failed: network timeout                 │
│ [ Retry ]                                          │
└────────────────────────────────────────────────────┘

┌─ MindOS Desktop ──────────────────────────────────┐
│ v0.1.2  ✅ Up to date                              │
│ [ Check for Updates ]                              │
└────────────────────────────────────────────────────┘
```

**注意**：
- Remote 模式下隐藏 Core 卡片（远端服务器管理自己的 Core）
- 取消下载后 UI 回到 [available] 状态，等 download() Promise reject 完成后才允许重试
- 启动时如果有 pending version，直接进入 [ready] 状态，跳过下载

### 5. 版本兼容性契约

`latest.json` 中的 `minDesktopVersion` 字段：

- 正常 Core 发版（patch/minor，API 不变）→ `minDesktopVersion: "0.1.2"`
- Core 有 breaking API change → bump `minDesktopVersion`
- Desktop 检查到 `desktopTooOld` → UI 显示提示，禁用下载按钮
- **约定**：Core 的 `/api/health`、`/api/setup`、`/api/restart` 接口保持向后兼容，breaking change 必须同时 bump minDesktopVersion

### 6. CI 工作流

**`.github/workflows/publish-runtime.yml`**（新增）：

```yaml
name: Publish Runtime
on:
  workflow_run:
    workflows: ["Publish to npm"]
    types: [completed]

jobs:
  build-runtime:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
      - run: bash scripts/build-runtime-archive.sh
      - name: Generate manifest
        run: |
          VERSION=$(node -p "require('./package.json').version")
          SHA=$(sha256sum /tmp/mindos-runtime-${VERSION}.tar.gz | cut -d' ' -f1)
          SIZE=$(stat -c%s /tmp/mindos-runtime-${VERSION}.tar.gz)
          cat > /tmp/latest.json << EOF
          {
            "version": "${VERSION}",
            "minDesktopVersion": "0.1.2",
            "size": ${SIZE},
            "sha256": "${SHA}",
            "urls": [
              "https://releases.mindos.com/runtime/mindos-runtime-${VERSION}.tar.gz",
              "https://mindos-releases.oss-cn-shanghai.aliyuncs.com/runtime/mindos-runtime-${VERSION}.tar.gz"
            ]
          }
          EOF
      - name: Upload to R2 + OSS
        run: |
          # tarball → 版本化路径 + latest/
          # latest.json → 固定路径，Cache-Control: no-cache, max-age=60
```

## 影响范围

### 新增文件

| 文件 | 说明 |
|------|------|
| `desktop/src/core-updater.ts` | Core 更新：检查、下载（带 CDN fallback）、校验、替换、启动清理 |
| `scripts/build-runtime-archive.sh` | CI 打 runtime 精简包 + 自校验 |
| `.github/workflows/publish-runtime.yml` | npm 发版后自动打 runtime 包上传 CDN |

### 修改文件

| 文件 | 改动 |
|------|------|
| `desktop/src/mindos-runtime-resolve.ts` | 新增 cached 候选路径（`~/.mindos/runtime/`） |
| `desktop/src/mindos-runtime-pick.ts` | 4 路比较（新增 cached），新增 3 个 input 字段 |
| `desktop/src/main.ts` | 初始化 CoreUpdater，启动清理，记录 currentCoreVersion，注册 IPC，静默检查 |
| `desktop/src/preload.ts` | 暴露 6 个 core-update IPC |
| `app/components/settings/UpdateTab.tsx` | Desktop local 模式 Core + Desktop 双卡片；remote 模式隐藏 Core 卡片 |

### 不受影响

- CLI / 浏览器用户的更新流程不变（仍走 `/api/update`）
- `electron-updater` 壳更新不变
- `config.json` schema 不变
- MCP 工具集不变

## 边界 case 与风险

### 边界 case

| 场景 | 处理方式 |
|------|---------|
| 下载中断（网络断开 / 用户取消） | abort 后等 Promise reject 完成；runtime-downloading/ 保留残留；下次下载前先 rm -rf 清理 |
| 下载完成但 SHA256 不匹配 | 删除 runtime-downloading/ + tarball，提示"校验失败，请重试" |
| 下载完成但关键文件缺失 | analyzeMindOsLayout 判定 not runnable → 删除 runtime-downloading/，提示重试 |
| `runtime/` 被用户手动删除 | prefer-newer fallback 到 bundled，正常运行 |
| `runtime/` 内容损坏 | analyzeMindOsLayout not runnable → fallback 到 bundled |
| apply 时 rename 失败（Windows 文件锁） | 前置 processManager.stop()；仍失败 → 回滚 runtime-old/ → runtime/ |
| Core 新版需要更高 Desktop 版本 | desktopTooOld: true → UI 禁用下载，提示 "更新 Desktop" |
| 磁盘空间不足 | download() catch ENOSPC → 清理临时文件 → 提示释放空间 |
| R2 CDN 不可用 | 5 秒超时 → 自动 fallback 到 urls 数组中下一个 |
| 所有 CDN 不可用 | 全部超时 → 提示"无法连接更新服务器"；最坏 = 现状不更新 |
| apply 时 app 正在退出/更新 | isQuitting / isUpdating 守卫拒绝 |
| Remote 模式 | check() 返回 available: false；UI 隐藏 Core 卡片 |
| latest.json CDN 缓存 | 请求加 ?t=timestamp；上传设 Cache-Control: no-cache |
| 下载完成但未 apply → 重启 | 启动时 getPendingVersion() 检测到 → UI 直接进入 [ready]，跳过下载 |
| Desktop 更新后 bundled > cached | 启动时 cleanupOnBoot() 删除过期 cached |
| apply 中途断电 | runtime-old/ 和 runtime-downloading/ 可能残留；下次启动时 cleanupOnBoot() 清理；runtime/ 如不完整 fallback 到 bundled |
| apply 失败 | catch 内恢复旧服务（retry startLocalMode），UI 显示错误 |

### 风险

| 风险 | 缓解 |
|------|------|
| 壳/Core API 不兼容 | minDesktopVersion 机制 + Core API 保持向后兼容 |
| runtime 包缺文件 | CI 打包脚本自带校验（解压后检查 5 个关键路径） |
| CDN 全部不可用 | 最坏 = 当前现状（不更新），用户继续用旧版工作 |
| SHA256 bug | 只有匹配时才替换；不匹配 → 不动现有文件 |
| apply 断电后状态混乱 | cleanupOnBoot() 启动时兜底 + bundled 永远可用 |

## 验收标准

- [ ] Desktop local 模式打开 Settings → Update，显示 Core 和 Desktop 两张独立卡片
- [ ] Remote 模式下只显示 Desktop 卡片
- [ ] Core 有更新时，显示版本号、包大小和 Update 按钮
- [ ] 点击 Update，显示下载进度条和 Cancel 按钮
- [ ] Cancel 后回到 [available] 状态，可重新下载
- [ ] 下载完成后显示 "Restart Services" 按钮
- [ ] 下载完成但未 apply → 重启 Desktop → 直接显示 [ready]，无需重新下载
- [ ] 点击 Restart Services，注入 overlay → 服务 5 秒内重启 → 页面刷新到新版
- [ ] 全程不退出 Electron，不关闭窗口
- [ ] MCP Agent 短暂断连后自动恢复（< 10 秒）
- [ ] 删除 `~/.mindos/runtime/` 后重启，自动 fallback 到 bundled
- [ ] Desktop 更新后 bundled 比 cached 新 → 自动清理过期 cached
- [ ] minDesktopVersion 高于当前壳版本 → 禁用下载，显示提示
- [ ] R2 不可用 → 自动 fallback 到 OSS
- [ ] SHA256 校验失败 → 不替换现有 runtime，提示重试
- [ ] Windows 上 apply 不因文件锁失败（进程已停止）
- [ ] CI 发 npm 后自动构建 runtime 包 + 上传 R2 + OSS + latest.json
- [ ] runtime 包目录结构与 ProcessManager 期望一致（app/.next/standalone/server.js 在正确位置）
- [ ] runtime-downloading/ 残留不影响正常启动（不 runnable 的启动时清理，runnable 的保留）
