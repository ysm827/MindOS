# MindOS Progressive Disclosure 分层设计

*创建时间：2026-04-01 | 最后修订：2026-04-01*

---

## 用户谱系

MindOS 的用户不只是开发者。需要同时服务两类人：

| 用户类型 | 画像 | 占比（预期） | 能接受的复杂度 |
|---------|------|------------|--------------|
| **开发者** | 用 3+ AI Agent，习惯 IDE/终端 | 当前 100%，未来 40% | 高（VS Code 级别） |
| **知识工作者** | 用 ChatGPT + 1-2 个 AI 工具，习惯 Notion | 未来 60% | 低（Notion 级别） |

**一个产品服务两种人，不能只取其一。** 开发者觉得太简单会嫌弃，知识工作者觉得太复杂会逃跑。

---

## 设计策略：两层 + 好空状态 + JIT 概念引入

三件事同时做，不是选其一：

| 策略 | 解决什么 |
|------|---------|
| **两层界面模式** | 让两类用户都舒服 |
| **空状态引导** | 每个面板"为什么你需要 + 怎么开始" |
| **JIT 概念** | 在用户需要的瞬间引入概念，不预先教 |

---

## Layer 0：标准模式（默认）

> 面向：首次使用的所有人，包括不懂技术的知识工作者
>
> 用户感受："一个智能笔记本，AI 自动帮我整理和记忆。"

### Activity Bar：5 个

```
📁 Files      — 我的笔记
🔍 Search     — 搜索（⌘K）
🤖 Agents     — 连接 AI 工具
📡 Echo       — AI 给我的洞察
⚙️ Settings   — 设置
```

### 为什么选这 5 个

| 入口 | 留的理由 |
|------|---------|
| Files | 最基本的操作 |
| Search | 高频，任何用户都需要 |
| Agents | MindOS 的核心差异——不展示就是普通笔记工具 |
| Echo | "人变强"的感知入口——让普通用户也能感受到认知复利 |
| Settings | 必须有 |

### 为什么不留

| 入口 | 不留的理由 |
|------|-----------|
| Flows | 普通用户不理解"YAML 工作流编排" |
| Discover | 需要先理解 Skill 概念才有意义 |
| Sync | 技术概念，普通用户不关心 Git 同步细节 |

### 可见功能

| 功能 | 说明 |
|------|------|
| 文件浏览器 | 树形目录，叫"我的笔记"不叫"Files" |
| Markdown 编辑器 | 写和读，所见即所得模式优先 |
| 搜索 | ⌘K 全局搜索 |
| AI Chat | ⌘/ 打开，"和笔记聊天" |
| Agent 管理 | 简化视图：只显示已连接 Agent + "添加新 Agent" |
| 一键导入 | 拖拽文件，AI 自动整理 |
| Echo 回响 | 简化视图：只展示最新的 2-3 条洞察 |
| 新手引导 | 5 步 walkthrough |

### 渲染器：4 个

| 渲染器 | 理由 |
|--------|------|
| summary | 文件摘要 |
| backlinks | 反向链接 |
| todo | TODO 看板 |
| graph | 知识图谱（视觉冲击力，帮助理解知识关系） |

### 需要理解的概念：2 个

| 概念 | 怎么说（面向普通用户） |
|------|---------------------|
| 笔记 | "写下你的想法，AI 能读到" |
| Agent | "你用的 AI 工具（比如 ChatGPT、Cursor）" |

**不暴露：** MCP、Instruction、Skill、Space、ACP/A2A、Workflow、YAML。

### Agent 面板简化

普通用户看到的不是"MCP Server + Bearer Token + stdio/HTTP"，而是：

```
┌─────────────────────────────────┐
│  🤖 我的 AI 工具                 │
│                                 │
│  ✅ ChatGPT — 已连接            │
│  ✅ Cursor  — 已连接            │
│                                 │
│  [ + 连接新的 AI 工具 ]          │
│                                 │
│  这些 AI 工具可以读到你的笔记，  │
│  不用每次重复交代背景。          │
└─────────────────────────────────┘
```

---

## Layer 1：专业模式

> 面向：开发者、重度用户、想要完整控制的人
>
> 用户感受："完整的认知操作系统，每个功能都有用。"

### 触发方式

**不自动触发。** 只通过以下方式进入：

1. Settings 中手动切换："界面模式 → 专业"
2. 新手引导最后一步提示："你是开发者？切换到专业模式获得完整功能。"
3. 安装时选择（onboard 流程增加一步）

**为什么不自动触发：** 自动检测容易误判。一个知识工作者碰巧创建了 15 个文件，不应该突然看到 Workflow 和 ACP。让用户主动选择更安全。

### Activity Bar：8 个

```
核心区：
  📁 Files      — 文件浏览器
  🔍 Search     — 搜索（⌘K）
  🤖 Agents     — Agent 管理（完整视图：Overview/MCP/Skills/A2A）

增长区：
  📡 Echo       — 回响（完整 5 种类型）
  ⚡ Flows      — Workflow 编排
  🧭 Discover   — 社区 Skill

工具区：
  ⚙️ Settings
  🔄 Sync       — Git 同步状态
```

### 新增功能

| 功能 | 说明 |
|------|------|
| Agent 完整管理 | Overview / MCP / Skills / A2A 四 Tab |
| Workflow 编排 | YAML 编辑 + 执行引擎 |
| Discover | 社区 Skill 浏览和安装 |
| Changes | 变更追踪 + 逐行审查 |
| Agent Inspector | 工具调用时间线 |
| ACP/A2A | Agent 间通信面板 |
| Git Sync | 同步状态和冲突管理 |
| 全部渲染器 | csv、timeline、workflow-yaml、agent-inspector、config |

### 新增概念

| 概念 | 一句话 |
|------|--------|
| MCP | Agent 读取知识库的协议 |
| Instruction | 写一次规则，所有 Agent 遵守 |
| Skill | 经验变成 Agent 可执行的手册 |
| Space | 按项目分区知识库 |
| Workflow | 多步骤 YAML 执行流程 |
| ACP/A2A | Agent 间通信和任务委派 |

---

## 空状态设计（两个模式共用）

不管哪个模式，每个面板在无数据时都不显示空白：

### Echo（无回响时）

**标准模式：**
```
📡 当你用 AI 的次数多了，
   MindOS 会帮你看到自己的思维模式。
   
   先去写点笔记和 AI 聊聊吧 ✨
```

**专业模式：**
```
📡 Echo 分析你和 Agent 的交互模式，
   生成 5 种类型的认知回响。
   
   触发条件：10+ 次 Agent 交互。
   当前：3/10
```

### Agents（未连接时）

**标准模式：**
```
🤖 连接你的 AI 工具，
   它们就能读到你的笔记。
   
   [ 连接 ChatGPT ]
   [ 连接 Cursor ]
```

**专业模式：**
```
🤖 MCP Server 运行中 (HTTP:8567)
   Token: mindos_***
   
   已连接 Agent: 0
   
   [ 一键安装 MCP ]  [ 手动配置 ]
   [ ACP 发现 ]      [ A2A 注册 ]
```

---

## 概念 JIT 引入（两个模式共用）

| 概念 | 何时引入 | 标准模式怎么说 | 专业模式怎么说 |
|------|---------|--------------|--------------|
| Agent | 点 Agents 面板 | "你用的 AI 工具" | "通过 MCP 连接的 AI Agent" |
| Instruction | 被 Agent 读取后 | "给 AI 定规矩：写一条，所有 AI 都听" | "INSTRUCTION.md — 全局治理规则" |
| Skill | 纠正 Agent 后 | "这个纠正可以存下来，下次 AI 不再犯" | "保存为 Skill？（SKILL.md + experience.md）" |
| Space | 文件 > 30 时 | "笔记多了？按项目分个组吧" | "创建新 Space 隔离知识域" |

---

## 新手引导（Onboard 分流）

```
Step 1: "欢迎来到 MindOS！"

Step 2: "你是哪类用户？"
        ○ 我想用 AI 更好地整理思维     → 标准模式
        ○ 我是开发者，用多个 AI 工具    → 专业模式
        
Step 3 (标准): "先导入一些笔记吧"  → 一键导入
Step 3 (专业): "连接你的第一个 Agent" → MCP 安装

Step 4: "和 AI 聊聊你的笔记" → ⌘/

Step 5: "搞定！"
```

---

## 对比总览

### Activity Bar

```
标准模式                        专业模式
──────────                      ──────────
📁 Files                        📁 Files
🔍 Search                       🔍 Search
🤖 Agents（简化）               🤖 Agents（完整）
📡 Echo（精简）                  📡 Echo（完整）
                                ⚡ Flows
                                🧭 Discover
──────────                      ──────────
⚙️ Settings                     ⚙️ Settings
                                🔄 Sync
──────────                      ──────────
共 5 个                          共 8 个
```

### 概念数

| 维度 | 标准模式 | 专业模式 |
|------|---------|---------|
| 首次概念数 | 2（笔记、AI 工具） | 6+（MCP、Instruction、Skill...） |
| 面板数 | 5 | 8 |
| 渲染器 | 4 | 9 |
| 空状态语言 | 温暖、口语化 | 精确、技术化 |
| Agent 面板 | "我的 AI 工具" | "MCP Server + ACP + A2A" |

---

## 实现方案

### Settings 开关

```
界面模式：
  ○ 标准（推荐大部分用户）
      简洁界面，AI 自动帮你管理
  ○ 专业（开发者和重度用户）
      完整功能，精细控制
```

### 代码实现

```typescript
// lib/ui-mode.ts
type UIMode = 'standard' | 'professional';

// 从 config 读取，默认 standard
function getUIMode(): UIMode {
  return config.get('uiMode', 'standard');
}

// Activity Bar 根据模式过滤
function getVisiblePanels(mode: UIMode): PanelId[] {
  const core: PanelId[] = ['files', 'search', 'agents', 'echo'];
  if (mode === 'professional') {
    return [...core, 'workflows', 'discover'];
  }
  return core;
}

// 空状态文案根据模式切换
function getEmptyStateContent(panel: PanelId, mode: UIMode): EmptyState {
  return emptyStates[panel][mode];
}
```

### Onboard 分流

```typescript
// scripts/onboard.ts — 新增一步
const userType = await prompt('你是哪类用户？', {
  choices: [
    { label: '整理思维', value: 'standard' },
    { label: '开发者', value: 'professional' }
  ]
});
config.set('uiMode', userType);
```

---

## 和战略的对应

| 积累层次 | 标准模式怎么体现 | 专业模式怎么体现 |
|---------|----------------|----------------|
| 层次 1：记住 | "写笔记，AI 记住了" | "MCP 连接，Agent 读取上下文" |
| 层次 2：结构化 | "AI 帮你整理成规则" | "Instruction + Skill 系统" |
| 层次 3：反思 | "Echo 告诉你思维模式" | "Echo 5 种回响 + 交互分析" |
| 层次 4：方法论 | "你的经验越来越系统" | "Workflow + Skill 生态" |
| 层次 5：代理 | "AI 替你处理琐碎" | "ACP/A2A + 品味代理" |

**两种模式走向同一个目的地（人机共演化），只是路径不同。**

---

## 产品辩证审视（2026-04-01 内部 Review）

### 做对了什么

1. **用户分层是对的。** 给 Claude Code 用户和 Notion 用户设计同一个界面，认知负荷差 10 倍。不分层就只能选一边站。
2. **JIT 概念引入是全文最有价值的部分。** "文件 > 30 时才说 Space"、"纠正 Agent 后才引入 Skill"——用户在需要的瞬间学概念，记忆率最高，比任何教程都好。
3. **空状态双语气设计很细致。** 同一个功能，标准模式说"先去写点笔记吧"，专业模式说"触发条件：10+ 次交互，当前 3/10"。真正理解了两类用户。

### 需要挑战的地方

**1. "未来 60% 是知识工作者"没有验证。**

这个数字决定了所有设计决策。如果实际是 90% 开发者（MindOS 分发渠道是 npm，很可能如此），就在为一个不存在的用户群做大量工程。现阶段花大量工程量做两套 UI，不如先把一套做到极致，等用户数据说话。

**2. 双模式切换的隐藏成本被低估了。**

看似只是"过滤 Activity Bar"，实际上：
- 每个组件都要 `if (mode === 'standard')` 分支
- 所有 i18n 文案要双份（温暖版 + 技术版）
- 所有空状态要双份
- Agent 面板要两套视图
- 测试矩阵翻倍（每个功能 × 2 模式）
- Bug 报告要问"你在哪个模式"

这不是一个配置开关，这是**维护两个产品**。

**3. "标准模式"的价值定位模糊。**

标准模式下 MindOS 是"AI 智能笔记本"——但这个赛道有 Notion AI、Obsidian + Copilot、Mem、Reflect。MindOS 的护城河是 MCP/Agent 生态，标准模式把这些藏起来，凭什么赢过 Notion？简单到了一定程度就是另一个产品了。

**4. Onboard 分流的"选择"是个陷阱。**

"整理思维 / 开发者"——用户在这一步不知道两个选项意味着什么。很多开发者也想"整理思维"。选错了要去 Settings 改，但很多人不知道自己选错了。VS Code 不问"你是初学者还是专家"，它默认给全部功能，但用好的默认值和搜索让复杂度可管理。

**5. 去掉 Discover 值得商榷。**

Discover（发现社区 Skill）恰恰是小白最需要的——他们不知道能做什么，需要被启发。去掉 Discover 等于去掉了"发现价值"的最短路径。Sync 可以去掉（同意），Discover 不应该。

### 替代建议：一个模式 + 渐进披露

与其做"两个模式"，不如做**一个模式 + 行为驱动的渐进披露**：

1. **默认显示全部 Activity Bar**（8 个），但用"新"标签和 tooltip 引导
2. **Agent 面板默认简化视图**，底部有"显示高级选项"展开
3. **JIT 概念引入保留**（这是最好的部分，不要改）
4. **空状态根据用户行为阶段自适应**（用行为数据，不用手动选模式）
5. **用户可以逐个隐藏 Activity Bar 项**（而不是二选一的模式切换）

核心区别：**不是"你是谁"决定看到什么，而是"你做了什么"决定看到什么。** 行为驱动比身份驱动更准确。

### 结论

JIT 概念引入和空状态设计作为 **P0 实施**；双模式切换作为 **P2 观察**——先收集用户行为数据，再决定是否真的需要两套 UI。
