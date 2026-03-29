# 待办清单 (TODO)

> 最后更新：2026-03-30

## 🔥 高优先级

### Agent 功能
- [ ] **ACP for call / Agent as Workflow** - Agent调用协议（跨 Agent 协作机制）

### Desktop APP
- [ ] **内置版本升级检测** - 检测到更高版本时提示切换（基础运行已完成，升级流程待完善）

## ⚡ 功能增强

- [ ] **webpage wording skill** - 网页文案技能
- [ ] **插件市场/技能市场** - Discover 中的市场功能完善（当前已实现 UI 占位 + 本地插件管理，待后端市场 API）
- [ ] **审计功能增强** - Review change 优化
- [ ] **多终端管理** - 多个 Terminal 端口管理

## 🧩 架构与扩展

- [ ] **插件架构** - 保持灵活性和可扩展性，最小化侵入主代码
- [ ] **评论/批注机制** - Human-AI 异步协作
  - `mindos_add_comment(path, line, content)`
  - `mindos_get_comments(path)`

## 🎨 UI/UX

- [ ] **LANDING page** - 节日祝福例子
- [ ] **分享功能** - 分享模板或 md
- [ ] 毛玻璃的列表展开

## 💡 创新功能

- [ ] **AI 自主执行** - Agent 自主执行零散想法
- [ ] **自动 SOP 复盘** - Agent 帮助复盘，通过 MCP 存到 MindOS
- [ ] **创造者故事**

## 📝 其他

- [ ] 优化 Skill
- [ ] CLI 下载命令优化

### 命令行和下载
```bash
curl -L -o ~/Downloads/MindOS-0.1.0-arm64-mac.zip 'http://21.6.243.108:8080/desktop/dist/MindOS-0.1.0-arm64-mac.zip'
cd ~/Downloads && unzip MindOS-0.1.0-arm64-mac.zip && open MindOS-0.1.0-arm64.dmg
```
