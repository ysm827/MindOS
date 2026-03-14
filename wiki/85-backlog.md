<!-- Last verified: 2026-03-14 | Current stage: P1 -->

# Backlog

> 临时 bug、技术债、改进想法。解决后移除或转入对应 stage 文件。

## Bug

(无)

## 技术债

- [ ] 模板内容待优化（中英双语）
- [ ] SearchModal / AskModal 添加 `role="dialog"` + `aria-modal="true"`（无障碍）
- [ ] 13 个 renderer 插件文件仍使用 inline `fontFamily`，待迁移到 `.font-display`

## 改进想法

- [ ] 局域网自动发现 (mDNS/Bonjour) — 手机/平板自动连
- [ ] 首页 Plugins 更好的展示方式
- [ ] Skill 工作流引导优化（持续）
- [ ] 离线 PWA 缓存最近文件
- [ ] 登录页添加产品标语（`t.app.tagline`），给初次访问者提供上下文
- [ ] 目录视图卡片可按内容类型调整大小（文件夹 vs 单文件密度优化）
- [ ] 文件视图 topbar 增加文件图标前缀，与侧边栏保持一致
- [ ] 文件视图增加文档内搜索（⌘F 高亮跳转）
- [ ] CLI 增加 per-command `--help`（`mindos start --help` 显示子命令选项）
- [ ] CLI 增加 `mindos status` 命令（一览服务状态、端口、同步状态）
- [ ] 首次使用引导流程：检测新模板 → 展示知识库结构 → 引导 AI 提问 → 引导配置 Sync

## 待验证

- [ ] Windows WSL 下 daemon (systemd) 是否稳定
- [ ] Git sync 在大知识库 (>1000 文件) 下的性能
- [ ] 多 Mind 实例（~/MindOS 下多个大脑，如团队/个人）— 当前用子目录满足，等团队版(P2)或用户反馈再决策
