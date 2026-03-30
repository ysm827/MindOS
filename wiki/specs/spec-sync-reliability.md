# Spec: Git Sync 可靠性修复

**Status**: Draft
**Priority**: Bug（影响首次 Sync 配置成功率）
**文件**: `bin/lib/sync.js`

---

## 问题

`sync.js` 存在 4 个可靠性问题，其中问题 1 直接导致用户报告的 "Remote not reachable" 错误。

### Bug 1（P0）：credential approve 假成功 → ls-remote 认证失败

**根因**：`git credential approve`（第 235 行）即使 keychain/credential-store 实际没有存住 credential 也不会报错。后续 `ls-remote` 用不带 token 的 URL 去连 → 401 → "Remote not reachable"。

**触发条件**：
- macOS：Keychain Access 权限受限（CI、沙箱环境、首次运行无 Keychain 条目）
- Linux：`credential.helper=store` 但 `~/.git-credentials` 所在目录不可写
- 所有平台：用户已有同 host 的旧 credential，approve 不会覆盖

**复现路径**：GUI Settings → Sync → 填 HTTPS repo + PAT → Connect & Start Sync → 报错

### Bug 2（P1）：首次 push 缺少 remote/branch 参数

`autoCommitAndPush()`（第 93 行）执行 `git push` 不带参数。新仓库无 upstream tracking 时，push 静默失败。

**影响**：initSync 第 7 步"初始推送"失败，用户以为配置成功但远端是空的。

### Bug 3（P2）：冲突文件写入失败时信息矛盾

`autoPull()` 第 116-118 行：`git show :3:file` 失败（二进制文件、特殊路径）时，`.sync-conflict` 不会创建，但 `state.conflicts` 里仍然记录了这个文件。用户看到"有冲突"但找不到冲突文件。

### Bug 4（P2）：config/state 文件非原子写入

`saveSyncConfig` 和 `saveSyncState` 直接 `writeFileSync`。auto-sync 定时器和 GUI 操作并发时可能写竞争导致 JSON 损坏。

---

## 修复方案

### Bug 1：credential 验证 + 双重 fallback

```javascript
// 现有代码（第 233-243 行）改为：

// Store the credential via git credential approve
let credentialStored = false;
try {
  const credInput = `protocol=${urlObj.protocol.replace(':', '')}\nhost=${urlObj.host}\nusername=oauth2\npassword=${token}\n\n`;
  execFileSync('git', ['credential', 'approve'], { cwd: mindRoot, input: credInput, stdio: 'pipe' });

  // Verify: try to fill back — if the credential was actually stored, fill returns it
  try {
    const fillInput = `protocol=${urlObj.protocol.replace(':', '')}\nhost=${urlObj.host}\nusername=oauth2\n\n`;
    const fillResult = execFileSync('git', ['credential', 'fill'], {
      cwd: mindRoot, input: fillInput, encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },  // suppress GUI prompts
    });
    credentialStored = fillResult.includes('password=');
  } catch {
    credentialStored = false;
  }
} catch (e) {
  console.error(`[sync] credential approve failed: ${e.message}`);
}

// If credential not actually stored, embed token in URL
if (!credentialStored) {
  if (!nonInteractive) console.log(dim('Credential helper unavailable, using inline token'));
  const fallbackUrl = new URL(remoteUrl);
  fallbackUrl.username = 'oauth2';
  fallbackUrl.password = token;
  remoteUrl = fallbackUrl.toString();
}
```

**改动要点**：
- approve 后立即 `credential fill` 验证是否真的存进去
- fill 超时 5 秒防止交互式 prompt 阻塞
- 验证失败则无条件走 URL 内嵌 token 的 fallback
- 非 interactive 模式也能正确 fallback（当前 catch 里的 console.error 在 nonInteractive 下不该输出）

### Bug 2：push 指定 upstream

```javascript
// 第 93 行改为：
execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: mindRoot, stdio: 'pipe' });
```

**改动要点**：
- `-u` 设置 upstream tracking，后续 push/pull 不再需要指定 remote/branch
- `HEAD` 自动指向当前分支，无需读 config

### Bug 3：冲突文件写入失败时记录 warning

```javascript
// 第 116-118 行改为：
try {
  const theirs = execFileSync('git', ['show', `:3:${file}`], { cwd: mindRoot, encoding: 'utf-8' });
  writeFileSync(resolve(mindRoot, file + '.sync-conflict'), theirs, 'utf-8');
} catch {
  // Binary or inaccessible — mark in conflict record so user knows
  conflictWarnings.push(file);
}

// 第 123-127 行，conflicts 记录加 warning 标记：
conflicts: conflicts.map(f => ({
  file: f,
  time: new Date().toISOString(),
  noBackup: conflictWarnings.includes(f),
})),
```

### Bug 4：原子写入

```javascript
// 提取公共函数：
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

// saveSyncConfig 和 saveSyncState 改用 atomicWrite
```

**改动要点**：先写 `.tmp` 再 `rename`，`rename` 在 POSIX 上是原子操作。

---

## 影响面

| 维度 | 影响 |
|------|------|
| 改动文件 | `bin/lib/sync.js` 唯一文件 |
| 新增 import | `renameSync`（from `node:fs`，已有 `writeFileSync` 等） |
| 行为变更 | Bug 1：credential 不可用时 URL 内嵌 token（之前静默失败）；Bug 2：push 带 `-u`（之前不带）|
| 向后兼容 | 完全兼容，已有同步配置不受影响 |
| 测试 | 补 `tests/unit/sync-credential.test.js`：mock `execFileSync` 验证 4 条路径 |

---

## 验收标准

1. **Bug 1**：macOS 上 `osxkeychain` 不可用时，initSync 仍能成功连接（fallback 到 URL token）
2. **Bug 1**：Linux 上 `~/.git-credentials` 不可写时，initSync 仍能成功连接
3. **Bug 2**：新建空 repo → initSync → 远端有 commit
4. **Bug 3**：二进制文件冲突时，conflicts 列表标记 `noBackup: true`
5. **Bug 4**：并发写 config 不产生损坏 JSON

---

## 分阶段

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| **P0** | Bug 1 credential 验证 + fallback | ~30min |
| **P0** | Bug 2 push -u | ~10min |
| P1 | Bug 4 原子写入 | ~15min |
| P1 | Bug 3 冲突 warning | ~15min |
| P1 | 补测试 | ~30min |
