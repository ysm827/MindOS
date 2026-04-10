# Spec: Core Updater Download Failure Fix (Windows)

## 目标

修复 Windows 平台上 MindOS Desktop 核心更新下载失败的 bug，具体表现为：
1. "All download URLs failed" — 所有 CDN URL 都失败
2. "ENOENT: no such file or directory, open 'C:\Users\naverl\.mindos\runtime-download.tar.gz'" — 文件不存在或被锁定

## 现状分析

### 错误现象

用户在 Windows 平台点击"检查更新"后进行下载时，出现两类错误：
1. 第一次下载时所有 URL 都超时/失败，返回 "All download URLs failed"
2. 用户点"重试"后，下载过程中出现 ENOENT 错误

### 根因

在 `desktop/src/core-updater.ts` 的 `downloadFile()` 和 `download()` 函数中存在两个相关的 bug：

#### Bug #1: 错误信息丢失（第 103-175 行）

```typescript
const tryNext = () => {
  if (urlIdx >= urlQueue.length) { 
    settled = true; 
    return reject(new Error('All download URLs failed'));  // ← 没有记录最后的错误
  }
  req.on('error', (err) => {
    tryNext();  // ← 继续尝试，但错误信息未保存
  });
};
```

所有 URL 失败时，最后一个错误信息被丢弃，用户只看到泛泛的 "All download URLs failed"。

#### Bug #2: Windows 文件锁定导致的清理失败（第 250-252 行）

```typescript
if (existsSync(DOWNLOAD_DIR)) rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
if (existsSync(TARBALL_PATH)) try { unlinkSync(TARBALL_PATH); } catch { /* may not exist */ }
```

问题：
1. 第一次下载失败，`TARBALL_PATH` 可能只是创建了空文件或部分下载
2. `unlinkSync()` 在 Windows 上可能因为文件被某个进程锁定而失败（即使 catch 了）
3. 第二次下载开始时，旧文件仍然存在，可能导致部分覆盖
4. 后续操作（SHA256 校验、文件验证）失败时，尝试清理 TARBALL_PATH 时出现 ENOENT

### 时间线

```
第一次下载尝试：
  downloadFile() → urls[0] 超时 → urls[1] 超时 → ... → 所有 URL 耗尽
  → reject('All download URLs failed')
  → catch 块执行清理，但 TARBALL_PATH 可能只是部分删除

用户点"重试"：
  download() 再次调用 → downloadFile()
  → 尝试写入 TARBALL_PATH（但可能仍被前一个进程锁定）
  → 部分覆盖成功
  → 后续校验或解压失败
  → catch 块清理时 ENOENT

结果：用户看到"ENOENT: no such file or directory"
```

## 数据流 / 状态流

### 下载流程的文件操作

```
before download:
  DOWNLOAD_DIR 检查 → 删除
  TARBALL_PATH 检查 → 删除（可能失败）

during download:
  createWriteStream(TARBALL_PATH) → 创建新文件

after download:
  readFileSync(TARBALL_PATH) → SHA256 校验
  extractTarGz(TARBALL_PATH, DOWNLOAD_DIR) → 解压
  unlinkSync(TARBALL_PATH) → 删除临时 tarball

on error:
  rmSync(DOWNLOAD_DIR, ...) → 删除解压目录
  unlinkSync(TARBALL_PATH) → 删除 tarball（可能因文件锁定失败）
```

### Windows 特定的行为

在 Windows 上，被 Node.js 进程打开过的文件可能短暂被锁定，即使 `file.close()` 已调用。这导致：
- 同一个文件路径无法被立即覆写
- 同一个文件无法被立即删除
- 导致 "file in use" 或 "access denied" 错误

## 方案

### 1. 改进错误信息收集（Bug #1 fix）

在 `downloadFile()` 中添加 `lastErr` 变量，跟踪最后一个错误：

```typescript
let lastErr: Error | undefined;

const tryNext = () => {
  // ...
  if (urlIdx >= urlQueue.length) { 
    settled = true; 
    const msg = lastErr 
      ? `All download URLs failed: ${lastErr.message}` 
      : 'All download URLs failed';
    return reject(new Error(msg));  // ← 包含具体错误信息
  }
  req.on('error', (err) => {
    lastErr = err instanceof Error ? err : new Error(String(err));  // ← 保存错误
    console.warn(`[CoreUpdater] ${url} → ${lastErr.message}, trying next`);
    tryNext();
  });
};
```

**改进**：
- 错误消息从 "All download URLs failed" → "All download URLs failed: timeout"
- 帮助用户和调试者理解真实的失败原因

### 2. 改进预下载清理（Bug #2 fix）

在 `download()` 中添加重试逻辑清理旧 tarball：

```typescript
// Delete tarball with retry — Windows may hold file lock momentarily
if (existsSync(TARBALL_PATH)) {
  let deleted = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      unlinkSync(TARBALL_PATH);
      deleted = true;
      console.info('[CoreUpdater] Deleted previous tarball');
      break;
    } catch (err) {
      if (attempt < 2) {
        console.warn(`[CoreUpdater] Failed to delete tarball (attempt ${attempt + 1}/3), retrying: ${err instanceof Error ? err.message : err}`);
        // Brief delay before retry (let any file locks release)
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
  if (!deleted) {
    console.warn('[CoreUpdater] WARNING: Could not clean up old tarball — may cause issues if download is partial');
  }
}
```

**改进**：
- 最多重试 3 次（总延迟 200ms），等待 Windows 文件锁释放
- 即使无法删除也继续执行（downloadFile 会覆写）
- 添加详细日志便于诊断

### 3. 改进下载后的错误处理（防御性）

在 catch 块中分别处理两个文件的清理失败：

```typescript
catch (err) {
  // ...
  if (existsSync(TARBALL_PATH)) {
    try { unlinkSync(TARBALL_PATH); } catch (cleanupErr) { 
      console.warn('[CoreUpdater] Failed to clean up tarball after download error:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
    }
  }
  // ...
}
```

**改进**：
- 清理失败时记录日志，不影响主错误流转
- 下次启动时 `cleanupOnBoot()` 会再次尝试清理

## 影响范围

### 修改文件

| 文件 | 改动 |
|------|------|
| `desktop/src/core-updater.ts` | 1. `downloadFile()` 添加 `lastErr` 追踪 2. `download()` 添加 TARBALL_PATH 重试删除 3. catch 块改进错误处理 |

### 不受影响

- macOS / Linux 平台不受 Windows 文件锁定影响（但代码改进对所有平台有益）
- CLI / 浏览器用户不受影响
- 其他 IPC 处理不受影响

## 边界 case 与风险

| 场景 | 处理方式 |
|------|---------|
| TARBALL_PATH 永远无法删除 | 重试 3 次后放弃，后续 downloadFile 会覆写，影响不大 |
| 所有 URL 都不可达 | 错误信息更清晰（之前："All failed"，现在："All failed: DNS timeout" 等） |
| 下载中途网络断开 | 已有 abort 机制，清理时 TARBALL_PATH 不存在不会报错 |
| 并发下载 | 已有 `abortController` 机制防止并发 |
| SHA256 不匹配后清理 | 改进的清理逻辑确保尽力删除 |

## 验收标准

- [ ] Windows 平台点击"检查更新"检测到更新
- [ ] 点击"下载"，第一次下载失败时显示具体错误（如 "timeout" 或 "HTTP 404"）
- [ ] 点击"重试"，第二次下载成功而不是 ENOENT
- [ ] 多次重试下载不会导致文件混乱
- [ ] 下载完成后能正确校验 SHA256
- [ ] 下载中途取消不会遗留垃圾文件
- [ ] macOS / Linux 平台下载行为不变
- [ ] TypeScript 编译通过无错误
- [ ] 所有既有日志输出保持兼容

## 风险评估

**低风险**：
- 仅改进错误处理和日志，不改变核心逻辑
- 重试延迟极短（3 × 100ms = 300ms 总延迟）
- 向后兼容所有平台

**可能的副作用**：
- 重试导致下载开始前延迟最多 300ms（用户感知不到）
- 增加 4 条日志输出（仅在下载期间）
