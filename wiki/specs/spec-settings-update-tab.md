# Spec: Settings → Update Tab (GUI 更新)

## 目标

在 Settings Modal 新增 "Update" tab，让用户通过 Web GUI 检查 MindOS 版本、查看更新内容、一键触发更新，无需打开终端。

## 现状分析

- 更新检查：`/api/update-check` 已存在（读 npm registry，返回 current/latest/hasUpdate）
- 更新执行：仅 CLI `mindos update`（npm install -g → 删 build stamp → restart daemon）
- 通知：`UpdateBanner.tsx` 顶部横幅，3s 后检查，可 dismiss
- 缺失：Settings 中无版本信息、无更新入口、无更新进度

## 数据流

```
[Settings Update Tab]
  ↓ mount
  GET /api/update-check → { current, latest, hasUpdate }
  ↓ 展示版本信息

[用户点 "Check for Updates"]
  GET /api/update-check (force refresh)
  ↓
  有更新 → 显示 "v0.5.26 → v0.5.27" + "Update Now" 按钮
  无更新 → 显示 "You're up to date"

[用户点 "Update Now"]
  POST /api/update → 新 API
  ↓ 服务端 spawn `mindos update`（detached）
  ↓ 返回 { ok: true }
  ↓ 前端显示 "Updating... MindOS will restart shortly"
  ↓ 开始 polling `/api/update-check` 等新版本号出现
  ↓ 版本变化 → "Updated! Reloading..." → window.location.reload()
  ↓ 超时 4min → "Update may still be in progress. Check terminal."
```

## 方案

### 1. 新增 API：`POST /api/update`
- 调用 `mindos update` 作为 detached child process（同 `/api/restart` 模式）
- 返回 `{ ok: true }` 后进程可能被 restart 杀掉（预期行为）

### 2. 新增 Settings Tab：`UpdateTab`
- Tab id: `'update'`，icon: `Download`，label: "Update"
- 版本卡片：当前版本 + 最新版本 + 状态指示
- "Check for Updates" 按钮（手动刷新）
- "Update Now" 按钮（仅在 hasUpdate 时可点）
- 更新中：spinner + 进度文案 + polling 检测新版本
- Changelog 链接：`https://github.com/GeminiLight/MindOS/releases`

### 3. types.ts 扩展
- `Tab` 加 `'update'`

### 4. SettingsContent.tsx 注册
- TABS 数组末尾加 update tab
- renderContent 加 UpdateTab 渲染

## 影响范围

| 文件 | 变更 |
|------|------|
| `app/api/update/route.ts` | **新建** — POST handler spawn mindos update |
| `components/settings/UpdateTab.tsx` | **新建** — 完整 UI |
| `components/settings/types.ts` | Tab 加 'update' |
| `components/settings/SettingsContent.tsx` | 注册 tab + 渲染 |

不影响：UpdateBanner（保留顶部通知）、CLI update 命令、其他 Settings tab。

## 边界 case 与风险

1. **更新过程中服务断连** — 预期行为。前端 polling 失败后重试，最终 reload
2. **非 npm 全局安装**（link/clone） — update API 仍可调用，但 npm install -g 可能无效。显示 fallback 提示
3. **权限不足** — npm install -g 需要权限。spawn 会报错，API 返回 error
4. **网络断开** — update-check 超时返回 current=latest。"Check for Updates" 显示错误
5. **并发更新** — 忽略，与 CLI 行为一致（后一个覆盖前一个）
6. **更新后版本不变** — polling 超时，显示 "already on latest" 提示

## 验收标准

- [ ] Settings 出现 "Update" tab（Download 图标）
- [ ] 进入 tab 自动检查版本，显示 current / latest
- [ ] "Check for Updates" 手动刷新版本信息
- [ ] 有更新时 "Update Now" 按钮可见
- [ ] 点击后显示 updating 状态，polling 检测新版本
- [ ] 更新成功自动 reload
- [ ] 超时 4min 显示 fallback 提示
- [ ] 无更新时显示 "You're up to date"
- [ ] TypeScript 编译无错误
