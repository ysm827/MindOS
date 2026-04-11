# Spec: Search 首搜预热与冷启动降迟

## 目标

降低 Search Panel 首次搜索的等待感，让用户在第一次打开搜索时就尽可能快地拿到结果，同时不为从不使用搜索的用户增加明显的首屏负担。

## 现状分析

当前 Search Panel 在用户输入后才发起 `/api/search` 请求，服务端会在 `app/lib/fs.ts` 的 `getSearchIndex()` 中同步读取文件并构建 Fuse 索引；当索引尚未建立时，第一次查询需要同时承担“建索引 + 查询”两段成本。现有埋点已经证明这条路径在冷启动下会额外出现 `search.ui.index.build`，从而放大用户对“第一次搜索有点卡”的感知。

Why?
- 搜索是高频路径，首搜慢会直接伤害用户对“系统有点卡”的整体印象。
- 已有两层埋点可以确认冷索引建立是体感延迟的重要来源之一。

Simpler?
- 仅缩短 debounce、优化 loading 文案、或者继续堆埋点，都不能消除“第一次搜索才开始建索引”的根因。
- 更简单且更利于用户体验的方案，是在用户明确表达搜索意图时，提前预热索引，但不阻塞其继续输入。

当前假设：
- Search Panel 是最值得先优化的用户搜索入口。
- 这一轮只预热 UI 搜索（Fuse index），不扩大到 MCP/Core search，以控制范围和风险。

## 用户流 / UI 线框图

### User Flow

用户目标：第一次打开搜索时，尽快得到可用结果，而不是把第一次输入浪费在“偷偷建索引”上。

前置条件：
- 用户已进入主应用。
- Search UI 索引可能尚未建立。
- 用户尚未输入搜索关键词。

Step 1: 用户通过活动栏或快捷键打开 Search Panel
  → 系统反馈：Search Panel 立即打开，输入框获得焦点
  → 状态变化：客户端判断当前为首次进入搜索面板，后台发起 `/api/search/prewarm`

Step 2: 系统在后台预热搜索索引
  → 系统反馈：输入框下方显示一条轻量状态文案“Preparing search…”；不阻塞输入
  → 状态变化：服务端调用 `prewarmSearchIndex()`；若索引已热，立即返回 hit；若索引未热，则构建 Fuse 索引后返回 built

Step 3: 用户开始输入查询
  → 系统反馈：继续沿用现有 loading spinner / skeleton 反馈
  → 状态变化：若预热已完成，请求直接复用热索引；若预热仍在进行，请求仍可执行，最终按现有搜索路径返回结果

Step 4: 搜索结果返回
  → 系统反馈：结果列表展示；若预热先完成，则用户仅感知正常搜索；若预热失败，则维持原行为，不额外弹错
  → 状态变化：Search Panel 内部 warmState 进入 ready 或 fallback

成功结果：
- 用户第一次搜索时，更多情况下只承担“查询”成本，而不是“建索引 + 查询”双重成本。

异常分支：
- 异常 A：`/api/search/prewarm` 失败 → 系统降级到现有按需搜索路径 → 用户仍可搜索，只是第一次可能稍慢
- 异常 B：用户在预热完成前立即输入 → 系统继续执行正常搜索流程 → 用户看到已有 loading spinner，不会被阻塞
- 异常 C：知识库极大，预热本身较慢 → 系统保持轻量 warming 文案，不弹模态，不锁输入

边界场景：
- 空知识库：预热应快速完成，返回 0 文档，不报错
- 已有热索引：再次打开 Search Panel 只命中 cache，不重复构建
- 预热请求重复触发：客户端应避免一轮会话内反复 prewarm

### UI 状态线框图

```
┌─ 状态 1：Search 初始 / 冷索引 ──────────────────────────────┐
│ Search                                                      │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🔍 [ Search your notes...                           ] │ │
│ └────────────────────────────────────────────────────────┘ │
│  Preparing search…                                         │
│                                                            │
│  Start typing to search across your notes.                 │
└────────────────────────────────────────────────────────────┘

┌─ 状态 2：预热完成 / 待输入 ─────────────────────────────────┐
│ Search                                                      │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🔍 [ Search your notes...                           ] │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│  Start typing to search across your notes.                 │
└────────────────────────────────────────────────────────────┘

┌─ 状态 3：输入中 / 正在查询 ─────────────────────────────────┐
│ Search                                                      │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🔍 machine learning                                 ⟳ │ │
│ └────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ target.md                                            │ │
│  │ Profile > Research                                   │ │
│  │ ...machine learning in depth...                      │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

┌─ 状态 4：预热失败 / 降级 ───────────────────────────────────┐
│ Search                                                      │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🔍 [ Search your notes...                           ] │ │
│ └────────────────────────────────────────────────────────┘ │
│  Search will prepare on first query.                       │
│                                                            │
│  Start typing to search across your notes.                 │
└────────────────────────────────────────────────────────────┘
```

### 状态流转图

```
[初始 idle]
   └── 打开 Search Panel ──→ [warming]
                              ├── 预热成功 ──→ [ready]
                              ├── 预热失败 ──→ [fallback]
                              └── 用户立刻输入 ──→ [querying]

[ready] ── 用户输入 ──→ [querying] ── 成功 ──→ [result]
   │                         │
   │                         └── 失败 ──→ [empty/error existing path]
   │
   └── 关闭/再次打开 ──→ [ready]

[fallback] ── 用户输入 ──→ [querying]
```

## 数据流 / 状态流

```
SearchPanel(active=true)
  └─ useEffect -> shouldStartSearchPrewarm(...)
       └─ GET /api/search/prewarm
            └─ app/api/search/prewarm/route.ts
                 └─ prewarmSearchIndex()
                      └─ getSearchIndex()
                           ├─ cache hit -> return existing Fuse index
                           └─ cache miss -> collectAllFiles + build Fuse index

用户输入 query
  └─ GET /api/search?q=...
       └─ searchFiles(query)
            └─ getSearchIndex()  // 复用已预热索引
```

关键状态：
- `warmState: idle | warming | ready | fallback`
- `hasAttemptedPrewarm: boolean`
- API 返回 `SearchPrewarmResponse`

## 方案

### 方案 A：阻塞式预热（打开搜索后先等待）
- 用户体验质量：⭐
- 实现复杂度：低
- 可维护性：中
- 风险：第一次打开搜索面板就被卡住，打断用户心流

线框图：
```
┌─────────────────────────────┐
│ Search                      │
│  Preparing search...        │
│  ⟳ Please wait              │
│  [ 输入框禁用 ]             │
└─────────────────────────────┘
```

### 方案 B：面板激活即非阻塞预热（推荐）
- 用户体验质量：⭐⭐⭐⭐
- 实现复杂度：中
- 可维护性：高
- 风险：如果用户极快输入，第一次查询仍可能遇到冷路径，但不会更差

线框图：
```
┌─────────────────────────────┐
│ Search                      │
│ [ Search your notes... ]    │
│ Preparing search...         │
│ 用户可立即输入               │
└─────────────────────────────┘
```

### 方案 C：应用空闲时全局预热
- 用户体验质量：⭐⭐⭐⭐⭐
- 实现复杂度：中
- 可维护性：中
- 风险：把索引构建成本前置给所有用户，包括不使用搜索的人；可能与首屏资源竞争

线框图：
```
应用加载后（无可见 UI 变化）
后台自动预热 Search index
```

### 选择说明

选择 **方案 B**。

原因：
1. 它优先照顾“明确表达搜索意图”的用户，而不让所有用户都承担后台预热成本。
2. 它不阻塞输入，用户体验显著好于方案 A。
3. 相比方案 C，它更克制，符合当前产品“Warm Industrial / Progressive Disclosure”的设计原则。
4. 它复用现有 `/api/search` 链路和现有 loading 反馈，不引入额外复杂缓存层。

## 影响范围

- 变更文件：
  - `app/lib/types.ts`
  - `app/lib/fs.ts`
  - `app/app/api/search/prewarm/route.ts`（新增）
  - `app/components/panels/SearchPanel.tsx`
  - `app/__tests__/api/search-prewarm.test.ts`（新增）
  - `app/__tests__/components/search-panel-prewarm.test.ts` 或等价纯函数测试（新增）
- 受影响模块：
  - 仅 Search Panel UI 搜索链路
  - 不影响 Core search / MCP search / Agent search
- 破坏性变更：无

## 架构审查

- Library-First：复用现有 Fuse 索引与现有 API，不新增第三方库
- Clean Architecture：预热逻辑通过 `prewarmSearchIndex()` 落在搜索域层，SearchPanel 只负责触发与展示状态
- 命名规范：使用 `prewarmSearchIndex`、`SearchPrewarmResponse`、`SearchWarmState`，避免 `utils/helpers/common`
- 复杂度预判：
  - 新 route < 30 行
  - 新 helper < 30 行
  - SearchPanel 新增状态逻辑控制在 50 行内

## 边界 case 与风险

1. **空知识库**
   - 处理：预热照常执行，返回 `documentCount=0`
2. **重复打开 Search Panel**
   - 处理：前端通过 `hasAttemptedPrewarm` 防止重复请求；服务端 cache hit 也能兜底
3. **预热失败**
   - 处理：UI 切到 `fallback`，保留现有按需搜索能力，不阻断输入
4. **用户在 warming 中立刻输入**
   - 处理：不额外禁用输入；沿用现有 loading spinner
5. **大知识库预热时间较长**
   - 风险：warming 文案停留更久
   - mitigation：只显示轻量文案，不显示全屏 loading，不弹错误

## Spec 对抗性审查

### 第 1 轮：完整性攻击
发现问题 1：如果只写 route 和 helper，没有定义前端 warmState，SearchPanel 无法稳定处理 warming / fallback / ready 三态。
- 修复：在方案中明确 `warmState` 和 `hasAttemptedPrewarm` 两个状态。

发现问题 2：如果不写重复打开的边界 case，可能每次激活 Search Panel 都重复打 prewarm 请求。
- 修复：在边界 case 中补充“重复打开 Search Panel”与前端防重策略。

### 第 2 轮：可行性攻击
发现问题 1：若预热默认走全局空闲触发，会让不使用搜索的用户也承担索引构建成本。
- 修复：放弃方案 C，选方案 B。

发现问题 2：如果 prewarm 失败时弹明显错误，会放大一个“优化性失败”的存在感，反而损伤体验。
- 修复：改为 fallback 降级，不弹中断式错误，只保留轻量提示。

## 验收标准

- [ ] 第一次打开 Search Panel 时，客户端最多发起一次 `/api/search/prewarm`
- [ ] 冷索引情况下，`/api/search/prewarm` 返回 built 或 hit 的结构化响应
- [ ] 再次打开 Search Panel 时，不会重复触发同一轮会话中的 prewarm 请求
- [ ] prewarm 成功后，第一次搜索不再额外出现新的 `search.ui.index.build`
- [ ] prewarm 失败时，用户仍可正常输入和搜索
- [ ] 新增测试覆盖：正常路径、重复预热、防失败降级
