# Spec: 首次使用引导 (First-Use Guide)

**Status**: Draft
**Priority**: I5 (中优先)
**Backlog ref**: `wiki/85-backlog.md` → I5

---

## 问题

用户完成 6 步 SetupWizard 后，落地在首页，看到：

1. 一个可关闭的 WelcomeBanner（3 个按钮：Reconfigure / Ask AI / MCP Settings）
2. 模板生成的 ~30 个文件列表
3. 插件列表

**断裂点**：用户看到一堆陌生文件，不知道：
- 这些文件夹是做什么的
- 应该先做什么
- AI 能帮我做什么（从没用过 `⌘/`）
- 这个系统和普通笔记软件有什么不同

WelcomeBanner 一关就再也找不到了。模板里虽然有 `🧪_example_*` 文件，但用户不知道这些是示例，也不会主动去读。

**核心指标**：Setup 完成 → 用户发出第一条 AI 提问 的转化率（当前无数据，但从产品直觉判断存在显著流失）。

---

## 目标

在 SetupWizard 完成后，用 **最低侵入** 的方式帮用户完成三件事：

1. **理解知识库结构**（10 秒内建立心智模型）
2. **发出第一条 AI 提问**（体验核心价值）
3. **知道下一步做什么**（不迷茫地离开）

不做：
- 不做传统产品 tour（弹窗 + 箭头高亮），太重，完成率低
- 不做强制引导（不阻断用户自由探索）
- 不做视频教程（当前阶段没必要）

---

## 设计方案

### 核心思路：替换 WelcomeBanner → 首页 Guide Card

不新增独立页面/模态框，而是把现有 WelcomeBanner 升级为一个**持久化的 Guide Card**，嵌入首页顶部，分阶段引导，用户完成或手动关闭后消失。

### 用户旅程

```
SetupWizard 完成 → 重定向 /?welcome=1
  ↓
首页检测到 ?welcome=1 → 写入 localStorage guide:active=1，清除 URL 参数
  ↓
首页顶部出现 Guide Card（替代当前 WelcomeBanner）
  ↓
Guide Card 展示 3 个任务卡片（可折叠）：
  ① 了解你的知识库 → 展开看结构说明（根据实际模板类型动态展示）
  ② 和 AI 对话 → 点击直接打开 AskModal，带预填问题
  ③ 配置同步（可选）→ 点击打开 Settings Sync tab
  ↓
完成 ①② 后 Guide Card 自动变为 "🎉 你已准备好" 状态
  ↓
用户关闭 → Guide Card 永久消失，写入 localStorage
```

### Guide Card 视觉结构

```
┌─────────────────────────────────────────────────────┐
│ ✨ 开始使用 MindOS                            [×]  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ 📁       │  │ 💬       │  │ 🔄       │         │
│  │ 了解     │  │ 和 AI    │  │ 配置     │         │
│  │ 知识库   │  │ 对话     │  │ 同步     │         │
│  │          │  │          │  │ (可选)   │         │
│  │ [展开 ↓] │  │ [开始 →] │  │ [设置 →] │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│  ─── 展开后：了解知识库 ───────────────────────     │
│                                                     │
│  📁 你的知识库有 6 个区域：                          │
│                                                     │
│  👤 Profile    你是谁、偏好、目标                     │
│  📝 Notes      日常捕捉：想法、会议、待办              │
│  🔗 Connections 人脉关系网                           │
│  🔄 Workflows   工作流程 SOP                         │
│  📚 Resources   产品库、工具库等结构化数据             │
│  🚀 Projects    项目计划和进展                        │
│                                                     │
│  💡 所有 AI Agent 都遵循根目录的 INSTRUCTION.md      │
│     你可以随时编辑它来调整 AI 的行为                   │
│                                                     │
│                               [知道了 ✓]            │
└─────────────────────────────────────────────────────┘

移动端（< sm）：3 个卡片改为竖排堆叠
```

### 三个任务卡片详细设计

#### ① 了解你的知识库

- **默认状态**：折叠，显示图标 + 标题 + "展开"按钮
- **展开后**：根据用户实际知识库内容动态展示
  - **en/zh 模板用户**：展示 6 个目录的一行说明（如上图）
  - **empty 模板用户**：展示 3 个核心文件说明（INSTRUCTION.md = AI 行为规则，README.md = 目录索引，CONFIG.json = 配置），提示"你可以随时创建自己的目录结构"
  - **实现方式**：Setup 完成时将 `template` 类型写入 `localStorage guide:template`，GuideCard 据此切换展示内容
- **完成条件**：点击 "知道了" 按钮
- **完成后**：卡片显示 ✓，折叠不可再展开

#### ② 和 AI 对话

- **默认状态**：折叠，显示图标 + 标题 + "开始" 按钮
- **点击 "开始"**：通过 CustomEvent 打开 AskModal 并传递预填问题
  - EN: `Summarize my knowledge base structure and suggest what I should set up first`
  - ZH: `概述我的知识库结构，建议我应该先做什么`
- **事件传递机制**：
  ```typescript
  // GuideCard 发出：
  window.dispatchEvent(new CustomEvent('open-ask', {
    detail: { message: 'Summarize my knowledge base...' }
  }));

  // SidebarLayout 监听：
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setAskOpen(true);
      setAskInitialMessage(e.detail.message);
    };
    window.addEventListener('open-ask', handler);
    return () => window.removeEventListener('open-ask', handler);
  }, []);
  ```
- **完成条件**：AskModal 关闭时如果 session 中有 ≥1 条用户消息，通过 `onClose` 回调通知 GuideCard 标记完成
  ```typescript
  // AskModal 新增 onFirstMessage 回调（可选）：
  // 在 handleSend 成功后：
  if (props.onFirstMessage && session.messages.filter(m => m.role === 'user').length === 1) {
    props.onFirstMessage();
  }

  // GuideCard 接收回调，写入 localStorage：
  function handleFirstMessage() {
    localStorage.setItem('guide:askedAI', '1');
  }
  ```
- **完成后**：卡片显示 ✓

#### ③ 配置同步（可选）

- **默认状态**：折叠，显示图标 + 标题 + "(可选)" 标签 + "设置" 按钮
- **点击 "设置"**：打开 SettingsModal，initialTab = 'sync'
- **完成条件**：无强制完成条件，标记为可选
- **不影响整体完成状态**

### 完成状态

- ①② 都完成 → Guide Card 标题变为 "🎉 你已准备好使用 MindOS"，显示 1 秒后自动折叠为单行
- 用户随时可点 × 关闭
- 关闭后 `localStorage.setItem('guide:dismissed', '1')`，永不再显示

---

## 技术设计

### 状态管理

```typescript
// localStorage keys
'guide:active'      // '1' = 由 ?welcome=1 激活（首次 setup 完成写入）
'guide:dismissed'   // '1' = 用户手动关闭，永不再显示
'guide:template'    // 'en' | 'zh' | 'empty' — setup 时写入，决定任务①展示内容
'guide:step1'       // '1' = 了解知识库 完成
'guide:askedAI'     // '1' = 至少发过一条 AI 消息

// 组件内 state
const [expanded, setExpanded] = useState<'kb' | 'ai' | 'sync' | null>(null);
```

### 显示条件

```typescript
// GuideCard 仅对通过 Setup 流程的新用户显示：
function useGuideVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. 已手动关闭 → 永不显示
    if (localStorage.getItem('guide:dismissed')) return;

    // 2. 首次激活：?welcome=1 触发
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === '1') {
      localStorage.setItem('guide:active', '1');
      // 清除 URL 参数
      const url = new URL(window.location.href);
      url.searchParams.delete('welcome');
      window.history.replaceState({}, '', url.pathname + url.search);
    }

    // 3. 只有被激活过的用户才看到
    if (localStorage.getItem('guide:active')) {
      setVisible(true);
    }
  }, []);

  return visible;
}
```

**关键设计**：老用户升级后不会有 `guide:active` key，所以不会被打扰。只有走过 SetupWizard 并被 `?welcome=1` 重定向的新用户才会看到 Guide Card。如果新用户 setup 后立刻离开，下次打开仍然看到（因为 `guide:active=1` 已写入，且未 `dismissed`）。

### 组件层级

```
HomeContent.tsx
  └── GuideCard.tsx (新组件，替换 WelcomeBanner)
        ├── 任务 ① 了解知识库（inline，内容按 guide:template 动态切换）
        ├── 任务 ② 和 AI 对话
        └── 任务 ③ 配置同步
```

3 个任务逻辑简单（各 ~30 行），inline 在 GuideCard 内部即可，不必拆独立文件。

### 与现有代码的关系

| 现有组件 | 改动 | 细节 |
|----------|------|------|
| `WelcomeBanner.tsx` | **删除** | 功能被 GuideCard 完全替代 |
| `HomeContent.tsx` | 替换 1 行 | `<WelcomeBanner />` → `<GuideCard />` |
| `SidebarLayout.tsx` | 加监听 | 监听 `open-ask` CustomEvent，将 message 传给 AskModal |
| `AskModal.tsx` | 加 2 个 prop | `initialMessage?: string`（预填输入框），`onFirstMessage?: () => void`（首条消息回调） |
| `OnboardingView.tsx` | 不改 | 仅空 KB 时显示，与 Guide 不冲突 |
| `i18n.ts` | 加 key | 新增 `guide` namespace（en + zh） |
| SetupWizard 完成逻辑 | 加 1 行 | 写入 `localStorage guide:template` |

### 响应式布局

```
桌面 (≥ sm)：3 个任务卡片横排 grid-cols-3
移动端 (< sm)：竖排 grid-cols-1，卡片间距收窄
展开内容区：始终全宽
```

### i18n

新增 key namespace: `guide`

```typescript
guide: {
  title: 'Get Started with MindOS',
  titleDone: "You're all set!",

  kb: {
    title: 'Explore your knowledge base',
    cta: 'Expand',
    // en/zh 模板用户
    fullDesc: 'Your knowledge base has 6 areas:',
    dirs: {
      profile: 'Who you are, preferences, goals',
      notes: 'Daily capture: ideas, meetings, todos',
      connections: 'Your network of people',
      workflows: 'Reusable process SOPs',
      resources: 'Structured data: product lists, tool lists',
      projects: 'Project plans and progress',
    },
    // empty 模板用户
    emptyDesc: 'Your knowledge base has 3 core files:',
    emptyFiles: {
      instruction: 'INSTRUCTION.md — Rules that all AI agents follow',
      readme: 'README.md — Directory index and navigation',
      config: 'CONFIG.json — Machine-readable preferences',
    },
    emptyHint: 'Create your own folder structure anytime.',
    instructionHint: 'Edit INSTRUCTION.md anytime to customize how AI agents behave.',
    done: 'Got it',
  },

  ai: {
    title: 'Chat with AI',
    cta: 'Start',
    suggestedPrompt: 'Summarize my knowledge base structure and suggest what I should set up first',
  },

  sync: {
    title: 'Set up sync',
    optional: 'Optional',
    cta: 'Configure',
  },
}
```

中文同结构，翻译内容。

---

## 影响面分析

| 维度 | 影响 |
|------|------|
| 新文件 | `GuideCard.tsx`（~200 行） |
| 删文件 | `WelcomeBanner.tsx` |
| 改文件 | `HomeContent.tsx`（1 行替换），`SidebarLayout.tsx`（加 CustomEvent 监听 ~10 行），`AskModal.tsx`（加 2 个 prop + 回调 ~5 行），`i18n.ts`（加 guide key），SetupWizard 完成逻辑（加 1 行 localStorage） |
| API | 无新 API |
| 存储 | localStorage 5 个 key |
| 测试 | GuideCard 单元测试：显示条件（active/dismissed/老用户不显示）、模板类型切换、完成逻辑、关闭持久化 |

---

## 验收标准

1. **新用户**：Setup 完成后首页顶部出现 Guide Card，3 个任务卡片可见
2. **老用户升级**：不显示 Guide Card
3. 点击 "了解知识库" 展开 → en/zh 模板看到 6 个目录说明，empty 模板看到 3 个文件说明 → 点 "知道了" → 标记完成 ✓
4. 点击 "和 AI 对话" → AskModal 打开且输入框有预填问题 → 发送后 → 标记完成 ✓
5. ①② 完成后标题变为 "你已准备好"
6. 点 × 关闭 → 刷新页面 → Guide Card 不再出现
7. 未完成 → 关闭浏览器 → 再次打开 → Guide Card 仍显示
8. 移动端 3 个卡片竖排，不溢出
9. 中英文 i18n 完整

---

## 不做（显式排除）

- **Step-by-step modal tour**：完成率低，打断体验，维护成本高
- **强制完成才能使用**：MindOS 哲学是不限制用户
- **Gamification（进度条/徽章）**：当前用户量不需要，过度设计
- **视频/GIF 教程**：维护成本高，版本迭代快会过期
- **引导编辑 Profile**：太深入，用户还没建立对系统的信任
- **引导 Sync 为必选步骤**：很多用户不需要多设备同步

---

## 分阶段交付

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| **P0** | GuideCard 替换 WelcomeBanner + 任务 ① 知识库结构（区分模板类型）+ 任务 ② AI 对话（CustomEvent + 预填 + 完成回调） | ~4h |
| P1 | 任务 ③ Sync 引导 + 完成状态动画 | ~1h |
| P2 | 可选：Guide Card 在侧栏也有入口（折叠状态的小图标） | ~1h |
