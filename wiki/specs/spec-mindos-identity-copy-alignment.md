# Spec: MindOS 统一中英文案与默认助手命名

## 目标
让 MindOS 在聊天、引导和技能描述里的身份文案统一、自然、双语对齐，去掉口号式和不稳定的表述，让用户看到的是同一个清晰的产品人格。

## 现状分析
当前体验存在三类不一致：

1. **Prompt 已改，但产品表面还没跟上**
   - `app/lib/agent/prompt.ts` 已经避免了 “operator of the user's second brain” 这类说法。
   - 但 Ask 标题、默认 Agent 名称、Onboarding 和部分帮助文案仍在大量使用 `MindOS Agent`，导致用户看到的身份仍然偏“多一个 Agent 名字”，而不是更自然的 `MindOS`。

2. **中英不是同一层级同步演化**
   - Prompt 是共享英文系统提示。
   - UI 文案是中英双份 i18n。
   - Skill 描述还有多份副本（`skills/`、`app/data/skills/`，以及 `mindos-max` 系列），其中一部分仍保留 “second brain / 第二大脑” 说法。
   - 结果是用户在不同入口会看到不同人格：有的像产品，有的像 slogan，有的像技术实现名。

3. **默认助手命名影响整条用户心智链路**
   - 在 Ask 面板、ACP Agent 选择器、会话归因、Onboarding CTA 里，默认本地助手名是 `MindOS Agent`。
   - 当用户同时看到 `Claude Code`、`Cursor`、`MindOS Agent` 时，MindOS 更像“又一个 Agent”，而不是“本地知识助手 / 默认本地能力”。

### Why?
这不是单纯改几句文案，而是修复一个长期存在的产品心智问题：用户需要稳定地理解 **MindOS 是产品本体，本地知识助手是它的默认能力，外部 ACP Agent 是可切换的外援**。

### Simpler?
更简单的做法是只改 `prompt.ts` 或只删掉 `second brain`。但这会留下更糟的半成品：
- 聊天行为变了，UI 名字没变
- 英文和中文 skill 继续说不同的话
- Onboarding 继续强化旧心智

因此最小可接受方案必须同时覆盖：**默认助手命名 + prompt 身份文案 + 中英 skill 描述 + 关键 onboarding/help 文案**。

## 数据流 / 状态流
### 现状数据流
```text
prompt.ts
  → 共享系统提示（英文）
  → 聊天时的身份与自我介绍规则

UI i18n
  → Ask 面板标题 / 导航 / Onboarding / Help / Channels 等文案

skills/
  → mindos / mindos-zh / mindos-max / mindos-max-zh 描述
  → app/data/skills/* 副本

最终结果
  → 用户在不同入口看到不同身份：MindOS / MindOS Agent / second brain / 第二大脑
```

### 目标数据流
```text
统一身份原则
  → 产品名：MindOS
  → 默认本地助手名称：MindOS
  → 描述语：local knowledge assistant / 本地知识助手
  → 禁用语：second brain / 第二大脑 / operator

prompt.ts
  → 定义共享行为规则与英文身份基线

skills/
  → 中英 skill 描述与 max 版本同步对齐
  → app/data/skills/* 保持一致副本

i18n
  → Ask / Onboarding / Help / Channels 等关键文案统一引用同一身份表达

最终结果
  → 用户无论从聊天、引导、技能还是默认 Agent 选择器进入，看到的都是同一个 MindOS
```

### 状态流
```text
[首次打开 Ask]
  ├──看到默认本地助手──→ [MindOS]
  │                           ├──纯问候──→ [简短自我介绍：MindOS + 本地知识助手]
  │                           └──明确任务──→ [直接做事，不先念身份]
  │
  ├──切换到外部 ACP Agent──→ [Claude Code / Cursor / ...]
  │                           └──切回默认──→ [MindOS]
  │
  └──进入 Onboarding / Help / Channels
                              └──看到与 Ask 一致的命名和描述
```

## 用户流程
用户目标：在 MindOS 里和默认本地助手交互时，不再被奇怪口号、重复身份标签或中英文不一致打断。

前置条件：
- 用户已进入 MindOS
- 可以打开 Ask、查看 Onboarding/Help，或使用默认 Agent 选择器

Step 1: 用户打开 Ask 面板
  → 系统反馈：标题和默认助手显示为 `MindOS`
  → 状态变化：默认本地助手 identity 从旧的 `MindOS Agent` 统一为 `MindOS`

Step 2: 用户只发一句“你好”或“你是谁”
  → 系统反馈：得到一段简短、自然的介绍，说明 MindOS 是本地知识助手
  → 状态变化：沿用统一 prompt 身份文案，不出现 second brain/operator 话术

Step 3: 用户发一句带任务的话（如“读一下这个文件并帮我整理”）
  → 系统反馈：系统直接开始处理任务，不先自我介绍
  → 状态变化：prompt 按“有任务就直接做事”规则执行

Step 4: 用户进入 Onboarding / Help / Channel 配置页
  → 系统反馈：这些页面继续使用 `MindOS` 和“本地知识助手 / 本地知识库”相关描述，不再突然切回 `MindOS Agent` 或“第二大脑”
  → 状态变化：UI 文案与 prompt/skills 对齐

Step 5: 用户打开 Agent 选择器
  → 系统反馈：默认项显示 `MindOS`，外部项显示 `Claude Code` / `Cursor` 等
  → 状态变化：默认助手命名和外部 Agent 命名层级更清晰

成功结果：
- 用户在关键入口只看到一套统一人格
- 中文和英文语义一致
- 默认助手更像 MindOS 产品本体，而不是额外套出来的一个 Agent

异常分支：
- 异常 A：旧会话消息里还保留 `MindOS Agent`
  → 系统如何处理：旧数据继续可读，新会话和新消息统一显示 `MindOS`
  → 用户看到什么：不会报错，旧记录可兼容
- 异常 B：某个 skill 副本没同步
  → 系统如何处理：测试失败或 diff 暴露不一致
  → 用户看到什么：发布前被拦截，不进入最终体验
- 异常 C：用户切到第三方 ACP Agent 后再切回默认
  → 系统如何处理：默认项仍稳定显示 `MindOS`
  → 用户看到什么：不会出现 `MindOS Agent` / `MindOS` 混用

边界场景：
- 纯问候 vs 问候+任务
- 中英文环境切换
- 旧 session / 旧 message 仍含 `MindOS Agent`
- `mindos` 与 `mindos-max` 两套 skill 都需要同步
- `skills/` 与 `app/data/skills/` 双副本一致性

## UI 状态线框图
### 状态 1：Ask 初始状态
```text
┌─ Ask Panel ─────────────────────────────────────┐
│ MindOS                                          │
│ ┌────────────────────────────────────────────┐   │
│ │ Ask a question... @ files, / skills        │   │
│ └────────────────────────────────────────────┘   │
│ [Agent: MindOS ▼] [Mode] [Provider]       [Send]│
└──────────────────────────────────────────────────┘
```

### 状态 2：纯问候后的自然介绍
```text
┌─ Messages ───────────────────────────────────────┐
│ User: 你好                                       │
│                                                  │
│ MindOS                                           │
│ 我是 MindOS。你可以直接让我读文件、找笔记、整理材料│
│ 或把讨论里的决定记下来。                         │
└──────────────────────────────────────────────────┘
```

### 状态 3：带任务的首条消息（加载中）
```text
┌─ Messages ───────────────────────────────────────┐
│ User: 读一下这个文件并帮我整理重点               │
│                                                  │
│ MindOS                                           │
│ ◌ 正在读取文件并整理重点...                      │
└──────────────────────────────────────────────────┘
```

### 状态 4：带任务的首条消息（成功）
```text
┌─ Messages ───────────────────────────────────────┐
│ User: 读一下这个文件并帮我整理重点               │
│                                                  │
│ MindOS                                           │
│ 好，我先读文件，再整理重点。                     │
└──────────────────────────────────────────────────┘
```

### 状态 5：带任务的首条消息（错误）
```text
┌─ Messages ───────────────────────────────────────┐
│ User: 读一下这个文件并帮我整理重点               │
│                                                  │
│ MindOS                                           │
│ ✗ 读取失败，请检查文件是否仍然存在，然后重试。   │
└──────────────────────────────────────────────────┘
```

### 状态 6：默认助手与外部 Agent 并列
```text
┌─ Agent Selector ────────────────────────────────┐
│ [✓] MindOS                                      │
│ ─────────────────────────────────────────────── │
│ [ ] Claude Code                                 │
│ [ ] Cursor                                      │
└─────────────────────────────────────────────────┘
```

### 状态 7：Onboarding / Help 中的一致命名
```text
┌─ Onboarding ────────────────────────────────────┐
│ Welcome to MindOS                               │
│ Ask MindOS to capture knowledge from this       │
│ conversation into your knowledge base.          │
│                                  [Try it]       │
└─────────────────────────────────────────────────┘
```

## 状态流转图
```text
[Ask 初始：MindOS]
   ├──纯问候──→ [简短介绍]
   ├──直接提任务──→ [直接执行]
   ├──切换外部 Agent──→ [Claude Code / Cursor]
   │                      └──切回默认──→ [MindOS]
   └──进入 Onboarding/Help──→ [一致命名与描述]
```

## 方案
### 方案 A：只改 prompt 文案
- 用户体验质量：⭐
- 实现复杂度：低
- 可维护性：低
- 风险：用户在 UI、skill、onboarding 里继续看到旧身份，体验会更割裂

### 方案 B：改 prompt + skill 描述，但保留 UI 里的 `MindOS Agent`
- 用户体验质量：⭐⭐⭐
- 实现复杂度：中
- 可维护性：中
- 风险：底层和表层仍然两套名字，默认助手与产品本体关系依旧模糊

### 方案 C：统一为 `MindOS` 默认助手命名，并同步 prompt / skill / 关键 UI 文案
- 用户体验质量：⭐⭐⭐⭐⭐
- 实现复杂度：中
- 可维护性：高
- 风险：需要更新测试和少量默认消息归因逻辑，但不会引入新架构复杂度

### 方案对比线框图
```text
方案 B：表层仍叫 MindOS Agent        方案 C：默认助手直接叫 MindOS
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ 标题：MindOS Agent          │     │ 标题：MindOS                │
│ [Agent: MindOS Agent ▼]     │     │ [Agent: MindOS ▼]           │
│ 纯问候：我是 MindOS...       │     │ 纯问候：我是 MindOS...       │
└─────────────────────────────┘     └─────────────────────────────┘
UX：表里不一，仍需解释 ⭐⭐⭐        UX：看到什么就是什么 ⭐⭐⭐⭐⭐
```

### 选择
选择 **方案 C**。

理由：它是最符合用户心智的最小完整解。MindOS 应该作为产品本体出现，默认本地助手名称直接用 `MindOS`，外部 ACP Agent 才显示为具体 Agent 名称。这样既能减少“Agent 套娃感”，也能让中英文文案围绕同一个主语展开。

## 影响范围
- 变更文件列表
  - `app/lib/agent/prompt.ts`
  - `app/lib/ask-agent.ts`
  - `app/lib/i18n/modules/ai-chat.ts`
  - `app/lib/i18n/modules/navigation.ts`
  - `app/lib/i18n/modules/knowledge.ts`
  - `app/lib/i18n/modules/features.ts`
  - `app/lib/i18n/modules/onboarding.ts`
  - `app/lib/i18n/modules/panels.ts`
  - `skills/mindos/SKILL.md`
  - `skills/mindos-zh/SKILL.md`
  - `skills/mindos-max/SKILL.md`
  - `skills/mindos-max-zh/SKILL.md`
  - `app/data/skills/*` 对应副本
  - 相关测试文件
- 明确不改的文件
  - `wiki/specs/archive/*`、`wiki/refs/*` 等历史文档（保留历史语境）
  - `desktop/dist/*`、`desktop/resources/mindos-runtime/*`、`_standalone/*` 等生成产物
- 受影响的其他模块
  - Ask 面板默认标题与默认 Agent 选择项
  - 历史消息里默认 agentName 的展示兼容
  - Onboarding、Help、Channels 的文案一致性
- 是否有破坏性变更
  - 无协议级破坏性变更
  - 仅用户可见命名与文案调整；旧消息历史需兼容读取

## 边界 case 与风险
1. **旧消息兼容**
   - 风险：旧消息记录里可能还保存 `MindOS Agent`
   - 处理：只统一新的默认值与文案，不破坏旧数据读取

2. **多份 skill 副本不同步**
   - 风险：`skills/` 与 `app/data/skills/` 不一致导致运行时和源文件描述分裂
   - 处理：同步更新并增加测试断言关键文案

3. **过度改动非关键页面**
   - 风险：把架构文档或历史 spec 里的 `MindOS Agent` 一并改掉，会造成历史记录失真
   - 处理：只改当前用户可见 surfaces 与 source-of-truth skill/prompt 文件，不改历史 spec/研究文档

4. **“MindOS” 过短导致上下文不清**
   - 风险：某些句子只写 `MindOS` 可能不如“本地知识助手”清晰
   - 处理：标题/默认名字用 `MindOS`，描述语补充 `local knowledge assistant / 本地知识助手`

## 验收标准
- [ ] Ask 标题、默认 Agent 名称、导航/快捷键等关键入口统一显示 `MindOS`，不再混用 `MindOS Agent`
- [ ] Prompt 中纯问候时的身份表述与产品文案一致，不包含 `second brain` / `第二大脑` / `operator`
- [ ] `skills/mindos*` 与 `app/data/skills/mindos*` 的关键描述中英对齐
- [ ] Onboarding / Help / Channels 的关键用户可见文案与 Ask 的身份命名一致
- [ ] 新增/更新测试覆盖默认命名与 prompt/skill 对齐规则
- [ ] 相关 Vitest 测试通过，TypeScript 编译通过
