# Backlog

> 初始化于 2026-04-11，用于补齐 CLAUDE.md 里约定的 backlog 追踪文件。

## Completed

- [x] Obsidian compat Spike 文档链路
  - 总体方案、API shim、兼容矩阵、生态调研、Spike 计划、Spike 实施规约
- [x] Obsidian compat 最小宿主骨架
  - loader、plugin-manager、vault、metadata-cache、plugin、ui、settings、obsidian export surface
- [x] Obsidian compat 测试覆盖
  - manifest、loader、vault、component、plugin、command-registry、integration、plugin-manager、ui
- [x] Obsidian compat 关键健壮性修复
  - 路径逃逸防护
  - async 生命周期等待
  - `.plugins/` 私有目录隔离
  - 损坏 `data.json` 明确报错

## Next

- [ ] 将 Setting / PluginSettingTab 接入真实宿主设置页面
- [ ] 将 Notice / Modal 接入真实宿主 UI 反馈系统
- [ ] 为真实第三方社区插件构建 smoke suite
- [ ] 补全 `resolvedLinks` / `unresolvedLinks` 全局索引语义
