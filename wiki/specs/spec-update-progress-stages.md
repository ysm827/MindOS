# Spec: Update Progress Stages — GUI 更新进度可视化

## 目标

用户在 GUI Settings > Update 点击更新后，能看到实时的阶段进度（下载 → Skill 更新 → 构建 → 重启），而非黑盒 spinner。失败时能立即看到哪一步失败 + 一句话错误原因。

## 现状分析

当前 `UpdateTab.tsx` 只有两个信号源：
1. `POST /api/update` 的 200 响应（表示 spawn 成功，不代表更新成功）
2. Poll `GET /api/update-check` 等版本号变化

中间 1-4 分钟完全黑盒。失败时只能等 4 分钟超时。用户无法区分"正在构建"和"已经卡死"。

## 数据流 / 状态流

```
cli.js update (detached child process)
  │
  ├── stage: downloading  →  写入 ~/.mindos/update-status.json
  │   npm install -g ...
  │
  ├── stage: skills       →  写入 update-status.json
  │   checkSkillVersions + updateSkill
  │
  ├── stage: rebuilding   →  写入 update-status.json
  │   buildIfNeeded(updatedRoot)
  │
  ├── stage: restarting   →  写入 update-status.json
  │   stopMindos + spawn new cli.js start
  │
  ├── stage: done         →  写入 update-status.json（新服务会覆盖此文件为 idle）
  │
  └── stage: failed       →  写入 update-status.json + error message
      任一步 catch 写入错误

GET /api/update-status (新 API)
  │
  └── 读取 ~/.mindos/update-status.json → 返回 JSON

UpdateTab.tsx (前端)
  │
  ├── handleUpdate() → POST /api/update
  └── poll /api/update-status (替代单纯的版本号 poll)
      ├── stage = done + 版本号变化 → setState('updated') → reload
      ├── stage = failed → 显示错误 + retry 按钮
      └── stage = downloading/skills/rebuilding/restarting → 显示对应进度
```

## 方案

### 1. 状态文件：`~/.mindos/update-status.json`

```json
{
  "stage": "rebuilding",
  "stages": [
    { "id": "downloading", "status": "done" },
    { "id": "skills",      "status": "done" },
    { "id": "rebuilding",  "status": "running" },
    { "id": "restarting",  "status": "pending" }
  ],
  "error": null,
  "version": { "from": "0.5.41", "to": "0.5.42" },
  "startedAt": "2026-03-23T15:00:00Z"
}
```

### 2. 后端：`bin/lib/update-status.js` (新建)

- `writeUpdateStatus(stage, opts?)` — 写入/更新 status JSON
- `clearUpdateStatus()` — 清除（启动时 / 更新完成后）
- 每个 stage 进入时调用 `writeUpdateStatus('downloading')` 等
- catch 块调用 `writeUpdateStatus('failed', { error: message })`

### 3. API：`app/app/api/update-status/route.ts` (新建)

- `GET` — 读 `~/.mindos/update-status.json`，不存在则返回 `{ stage: 'idle' }`
- 无需 auth（更新过程中旧 token 可能失效）— 实际上此 API 从 settings 页面调用，已有 auth。

### 4. 前端：`UpdateTab.tsx` (修改)

- `state === 'updating'` 时，显示 4 个阶段步骤列表 + 进度条
- poll `/api/update-status` 替代 `/api/update-check`
- 同时仍 poll `/api/update-check` 作为 fallback（新服务起来后 status 文件可能被清除）
- `stage === 'failed'` → 立即显示错误 + Retry 按钮
- `stage === 'done'` + 版本变化 → 显示成功 → reload

### 5. cli.js 集成

在 `commands.update` 的每个阶段插入 `writeUpdateStatus()` 调用：
- npm install 前 → `downloading`
- npm install 后 → `skills`
- skill check 后 → `rebuilding`
- build 后 → `restarting`
- 成功 → `done`
- 任何 catch → `failed` + error message

## 影响范围

| 文件 | 改动 |
|------|------|
| `bin/lib/update-status.js` | **新建** — 状态文件读写 |
| `bin/cli.js` | 在 update 命令各阶段插入 writeUpdateStatus |
| `app/app/api/update-status/route.ts` | **新建** — GET API |
| `app/components/settings/UpdateTab.tsx` | 重构 updating 状态为阶段进度 |
| `app/lib/i18n-en.ts` | 新增 stage 文案 |
| `app/lib/i18n-zh.ts` | 新增 stage 文案 |

不影响：
- `bin/lib/startup.js` — 启动流程不变
- `app/app/api/update/route.ts` — spawn 逻辑不变
- `bin/lib/skill-check.js` — 被调用方不变

## 边界 case 与风险

1. **status 文件在更新过程中旧服务被杀后不可读** — 文件在 `~/.mindos/` 下，不随进程生命周期。旧服务被杀后新 API route 读同一个文件。
2. **新服务起来后 status 文件残留** — `mindos start` 启动时清除 status 文件（`clearUpdateStatus()`），避免下次打开 Settings 看到旧状态。
3. **并发更新** — `writeUpdateStatus` 是原子 `writeFileSync`，后写覆盖前写，不会产生损坏文件。
4. **status 文件 JSON 解析失败** — API route 和前端都 try-catch，fallback 到 `{ stage: 'idle' }`。
5. **更新进程被 kill（ctrl-c / OOM）** — status 停留在某个中间 stage。前端 poll timeout 后显示 timeout + 刷新按钮。下次启动时 `clearUpdateStatus()` 清除。

## 验收标准

- [ ] 更新过程中前端显示 4 个阶段步骤（downloading/skills/rebuilding/restarting）
- [ ] 每个阶段完成后 UI 实时更新（✓ 标记）
- [ ] 失败时立即显示错误信息 + Retry 按钮，不等 4 分钟
- [ ] 成功后自动检测版本变化 → reload
- [ ] `mindos start` 启动时清除残留 status 文件
- [ ] 640 existing tests pass
