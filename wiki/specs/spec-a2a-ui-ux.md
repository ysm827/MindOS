<!-- Created: 2026-03-31 | Status: Design Draft -->

# A2A UI/UX 设计方案

## 1. 背景

A2A 协议已完成 3 个阶段的后端实现：
- **Phase 1**: Agent Card + JSON-RPC Server（MindOS 作为 A2A 服务端）
- **Phase 2**: Client 发现 + 委派工具（MindOS 作为 A2A 客户端）
- **Phase 3**: 多 Agent 编排引擎（任务分解 + 技能匹配 + 并行/串行执行）

**核心问题：用户在 UI 上完全感知不到 A2A 能力。**

目前用户能触达 A2A 的唯一方式是通过 Ask AI 对话，让内置 Agent 隐式调用 `discover_agent` / `delegate_to_agent` / `orchestrate` 工具。用户不知道这些能力存在。

---

## 2. 设计原则

1. **渐进式披露** — A2A 能力按需展示，不增加新用户的认知负担
2. **信心优先** — 用户必须先看到 Agent 的 A2A 就绪状态，才会尝试委派
3. **清晰的委派流** — 请求 -> 执行中 -> 完成/失败，每一步都有明确反馈
4. **统一心智模型** — 远程 Agent 和本地 Agent 使用相同的状态/能力框架

---

## 3. 当前 Agents 面板结构

```
AgentsPanel
  +-- PanelHeader ("Agents" + "3 Connected" + 刷新按钮)
  +-- AgentsPanelHubNav (3 个 Tab: Overview / MCP / Skills)
  +-- AgentsPanelAgentGroups
  |     +-- Connected (绿色) — present && installed
  |     +-- Detected (琥珀色) — present && !installed，有安装按钮
  |     +-- Not Found (红色) — !present，折叠区
  +-- Footer ("Advanced Config" 按钮)
```

每个 Agent 行显示：头像 + 名称 + 传输类型标签(http/stdio) + 箭头导航

Agent 详情页结构：
- Profile Header（名称、状态、传输类型、最后活动时间）
- MCP Management（配置、连接、服务器列表）
- Skill Assignments（搜索、过滤、启用/禁用）

---

## 4. 三个方案对比

### 方案 A：最小集成（让用户能感知）

在现有 UI 上做轻量标注，不增加新页面：

```
+-- PanelHeader: "3 Connected | A2A: 2"
+-- Agent 行: 名称 [http] [A2A icon]     <- 新增 A2A 图标
+-- Overview Tab: 新增第 6 个统计格 "A2A: Ready"
+-- Overview Tab: 新增 "发现远程 Agent" 快捷卡片
+-- Agent 详情: 新增 "A2A 能力" 折叠段
+-- Ask AI 对话: 委派结果带来源标注
```

| 维度 | 评价 |
|------|------|
| 用户体验 | 中等 — 能感知但操控有限 |
| 实现复杂度 | 低 |
| 可维护性 | 高 |
| 风险 | 低 |

### 方案 B：完整集成（委派管理 UI）

方案 A 的全部内容，加上：

```
+-- HubNav 新增第 4 个 Tab: "A2A"
+-- A2A Tab 内容:
|     +-- "发现远程 Agent" 输入框 + 按钮
|     +-- 已发现的远程 Agent 列表（同本地 Agent 分组）
|     +-- 活跃委派队列（实时状态）
|     +-- 委派历史记录
+-- Agent 详情:
|     +-- "委派设置" 段（启用/禁用、超时、并发上限）
|     +-- "最近委派" 表格
```

| 维度 | 评价 |
|------|------|
| 用户体验 | 高 — 完整的委派管理 |
| 实现复杂度 | 高 |
| 可维护性 | 中 |
| 风险 | 中 |

### 方案 C：专家模式（高级可视化）

方案 B 的全部内容，加上：

```
+-- Agent 网络拓扑图（谁能委派给谁）
+-- 编排可视化（任务分解 DAG 图）
+-- 委派性能仪表盘（成功率、延迟、历史趋势）
+-- Agent 市场（发布/发现 Agent）
```

| 维度 | 评价 |
|------|------|
| 用户体验 | 极高 — 企业级编排平台 |
| 实现复杂度 | 极高 |
| 可维护性 | 低 |
| 风险 | 高 |

---

## 5. 推荐方案：渐进式混合

### 第一期（MVP）: 方案 A + 发现弹窗

**改动范围：**

#### 5.1 PanelHeader 增加 A2A 计数

```
改前: "3 Connected [刷新]"
改后: "3 Connected · A2A 0 [刷新]"
```

当有远程 Agent 时显示数量，没有时显示 0 引导用户发现。

#### 5.2 Agent 行增加 A2A 图标

```
改前: ✅ Claude Code  [http]    >
改后: ✅ Claude Code  [http] 🔗  >
```

- 🔗 图标: A2A 就绪（hover 显示 "A2A Ready: 3 skills"）
- 无图标: 不支持 A2A
- 图标半透明: 正在检测 A2A

#### 5.3 Overview 统计栏增加 A2A 格

```
┌─────────┬──────────┬──────────┬──────────┬──────┬──────────┐
│Connected│ Detected │Not Found │ Skills   │ MCP  │   A2A    │
│   3/5   │    1     │    1     │ Enabled  │:8567 │ 0 Remote │
└─────────┴──────────┴──────────┴──────────┴──────┴──────────┘
```

点击 A2A 格 -> 弹出发现弹窗。

#### 5.4 Overview 快捷卡片增加 "发现远程 Agent"

```
快捷导航:
  [MCP 服务器]  [Skills 管理]  [发现远程 Agent]
```

点击 -> 弹出发现弹窗。

#### 5.5 发现远程 Agent 弹窗

```
+----------------------------------------------+
| 发现远程 Agent                          [X]  |
|                                              |
| 输入 Agent 的 URL:                           |
| [https://agent.example.com         ] [发现]  |
|                                              |
| (发现中...)                                  |
| +------------------------------------------+|
| | 发现成功!                                 ||
| | 名称: Claude Code Agent                  ||
| | 版本: v1.0                                ||
| | 技能:                                     ||
| |   - Search Files: 搜索知识库文件          ||
| |   - Write Code: 编写和审查代码            ||
| | 端点: https://agent.example.com/api/a2a   ||
| +------------------------------------------+|
|                                              |
| (发现失败时:)                                |
| +------------------------------------------+|
| | 未找到 A2A Agent                          ||
| | 该服务器可能不支持 A2A 协议               ||
| | 请检查 URL 是否正确                       ||
| +------------------------------------------+|
+----------------------------------------------+
```

状态流转:
```
[空输入] --输入URL--> [就绪] --点击发现--> [发现中] --成功--> [展示结果]
                                              |
                                              +--失败--> [错误提示] --修改URL--> [就绪]
```

#### 5.6 Agent 详情页增加 A2A 段

在 MCP Management 和 Skill Assignments 之间，新增折叠段：

```
▼ A2A 能力
  状态: ✓ 已连接，A2A 就绪
  协议版本: A2A v1.0
  可用技能: 3
  端点: https://agent.example.com/api/a2a
```

远程 Agent 额外显示：
```
  最近委派:
    委派 #1: "搜索项目笔记" — ✓ 完成 (2.3s)
    委派 #2: "整理文件结构" — ✓ 完成 (5.1s)
```

#### 5.7 Ask AI 对话中的委派标注

当 Agent 委派任务给远程 Agent 时，在回复末尾显示来源：

```
[回答内容]

ℹ️ 由 Claude Code 处理 (2.3s，通过 A2A)  [展开详情]
```

展开后显示：
```
委派链:
  MindOS Agent → Claude Code Agent
  任务: "搜索项目笔记"
  耗时: 2.3s
  状态: 已完成
```

---

### 第二期: 方案 B — A2A Tab + 委派队列

在第一期验证用户需求后再实施：
- 新增 A2A Tab
- 委派队列实时监控
- 委派历史和统计
- 委派设置（超时、并发、权限）

### 第三期: 方案 C — 可视化

企业用户需求驱动：
- Agent 网络拓扑
- 编排 DAG 可视化
- 性能仪表盘

---

## 6. 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| A2A 状态展示 | 图标+tooltip | 不占空间，hover 即见详情 |
| 发现入口 | Overview 快捷卡片 + 统计格点击 | 两个入口互补，可发现性高 |
| 委派可见性 | 回复末尾可展开卡片 | 不打断阅读流，但可追溯来源 |
| 远程 Agent 分组 | 和本地 Agent 同一列表，图标区分 | 统一心智模型，无需学习新概念 |
| MVP 不做的 | A2A Tab、委派队列、实时监控 | YAGNI：先验证用户是否真的需要管理委派 |

---

## 7. 数据流

```
用户点击 "发现远程 Agent"
  -> 弹窗输入 URL
  -> 调用 discoverAgent(url) (lib/a2a/client.ts)
  -> 获取 /.well-known/agent-card.json
  -> 注册到 registry (内存)
  -> UI 刷新: Agent 列表 + Overview 统计
  -> 用户在 Ask AI 中使用时，Agent 可自动选择远程 Agent 委派
```

---

## 8. 待确认项

- [ ] 远程 Agent 的持久化存储方案（当前是内存 Map，重启后丢失）
- [ ] 是否需要自动发现（mDNS / 局域网扫描）
- [ ] 委派的认证机制（Bearer token 如何配置）
- [ ] 是否允许用户手动选择委派目标（vs 完全自动匹配）

---

## 9. 实现文件清单（第一期）

| 文件 | 改动 |
|------|------|
| `app/components/panels/AgentsPanel.tsx` | Header 增加 A2A 计数 |
| `app/components/panels/AgentsPanelAgentListRow.tsx` | 增加 A2A 图标+tooltip |
| `app/components/agents/AgentsOverviewSection.tsx` | 增加 A2A 统计格 + 快捷卡片 |
| `app/components/agents/AgentDetailContent.tsx` | 增加 A2A 能力折叠段 |
| `app/components/agents/DiscoverAgentModal.tsx` | 新增: 发现远程 Agent 弹窗 |
| `app/lib/i18n-en.ts` + `i18n-zh.ts` | A2A 相关文案 |
| `app/hooks/useA2aRegistry.ts` | 新增: A2A 注册表 React hook |
