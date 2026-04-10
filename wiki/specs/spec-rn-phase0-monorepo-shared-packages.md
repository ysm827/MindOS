# Spec: Monorepo 共享包提取 (Phase 0)

> 日期：2026-04-10
> 状态：Draft
> 前置：无
> 后继：spec-rn-phase1-app-shell.md

## 目标

将 MindOS 现有 `app/` 中可跨平台复用的纯逻辑代码提取为独立共享包，为 React Native 移动端和现有 Web 端建立统一的代码共享基础设施。

### Why（YAGNI check）

移动端和 Web 端的类型定义、AI Agent 逻辑、状态管理、工具函数完全相同。不提取则两端必须 copy-paste，维护成本翻倍。

### Simpler（KISS check）

只提取 **已被验证为纯逻辑** 的模块，不做预设性抽象。一个模块如果只有 Web 端在用，就不提取。

---

## 现状

```
sop_note/
├── app/                   # Next.js Web 应用（81,716 行）
│   ├── lib/
│   │   ├── agent/         # AI Agent 逻辑（3,263 行）
│   │   ├── core/          # 核心业务逻辑（混合 Node.js 依赖）
│   │   ├── stores/        # Zustand 状态管理
│   │   ├── types.ts       # 类型定义
│   │   ├── errors.ts      # 错误类型
│   │   ├── settings.ts    # 配置管理
│   │   └── i18n-*.ts      # 国际化
│   ├── hooks/             # React Hooks
│   └── components/        # UI 组件
├── mcp/                   # MCP 后端服务
├── desktop/               # Electron 桌面端
└── bin/                   # CLI 工具
```

**问题**：所有代码耦合在 `app/` 内部，跨端共享必须 import from `app/lib/`，但这会拖入 Next.js/DOM 依赖。

---

## 方案

### 方案 A：npm workspaces monorepo（选择此方案）

```
sop_note/
├── packages/
│   └── shared/                # 新增：纯逻辑共享包
│       ├── src/
│       │   ├── types/         # 类型定义
│       │   ├── agent/         # Agent 工具定义 + 模型配置
│       │   ├── i18n/          # 国际化字符串
│       │   ├── stores/        # Zustand stores（去除 DOM Init 组件）
│       │   └── utils/         # 纯工具函数（cjk, csv, security, lines）
│       ├── package.json
│       └── tsconfig.json
├── app/                       # Web（import from @mindos/shared）
├── mobile/                    # React Native（Phase 1 创建）
├── mcp/
├── desktop/
└── package.json               # workspaces: ["packages/*", "app", "mobile"]
```

- 用户体验质量：N/A（基础设施）
- 实现复杂度：低
- 可维护性：高——单一来源、类型安全
- 风险：迁移期间可能破坏现有 import 路径

### 方案 B：路径别名（tsconfig paths）

只配 tsconfig paths 指向 `app/lib/` 子目录，不物理拆分。

- 优点：零成本
- 缺点：React Native metro bundler 对 tsconfig paths 支持不佳；`app/lib/` 内混杂 DOM 依赖；不解决根本问题
- **不选**：RN metro 解析 tsconfig paths 会碰到 Next.js 特有的模块解析逻辑

### 方案 C：git submodule

- 过度工程，团队只有一个 repo，不需要

---

## 提取范围

### 提取到 `packages/shared`（纯逻辑，零 DOM/Node.js 依赖）

| 源路径 | 目标路径 | 行数 | 依赖 |
|--------|----------|------|------|
| `app/lib/types.ts` | `shared/src/types/index.ts` | 108 | 无 |
| `app/lib/core/types.ts` | `shared/src/types/core.ts` | 54 | 无 |
| `app/lib/errors.ts` | `shared/src/errors.ts` | ~80 | 无 |
| `app/lib/agent/model.ts` | `shared/src/agent/model.ts` | 118 | 无 |
| `app/lib/agent/prompt.ts` | `shared/src/agent/prompt.ts` | 98 | 无 |
| `app/lib/agent/to-agent-messages.ts` | `shared/src/agent/to-agent-messages.ts` | 131 | pi-agent-core |
| `app/lib/agent/loop-detection.ts` | `shared/src/agent/loop-detection.ts` | 52 | 无 |
| `app/lib/agent/retry.ts` | `shared/src/agent/retry.ts` | 19 | 无 |
| `app/lib/agent/reconnect.ts` | `shared/src/agent/reconnect.ts` | 40 | 无 |
| `app/lib/agent/paragraph-extract.ts` | `shared/src/agent/paragraph-extract.ts` | 117 | 无 |
| `app/lib/agent/log.ts` | `shared/src/agent/log.ts` | 44 | 无 |
| `app/lib/core/cjk.ts` | `shared/src/utils/cjk.ts` | 50 | 无 |
| `app/lib/core/csv.ts` | `shared/src/utils/csv.ts` | 100 | papaparse |
| `app/lib/core/security.ts` | `shared/src/utils/security.ts` | 50 | 无 |
| `app/lib/core/lines.ts` | `shared/src/utils/lines.ts` | 100 | 无 |
| `app/lib/core/backlinks.ts` | `shared/src/utils/backlinks.ts` | 150 | 无 |
| `app/lib/i18n-en.ts` | `shared/src/i18n/en.ts` | ~1600 | 无 |
| `app/lib/i18n-zh.ts` | `shared/src/i18n/zh.ts` | ~1600 | 无 |
| `app/lib/i18n.ts` | `shared/src/i18n/index.ts` | ~60 | 无 |
| `app/lib/stores/walkthrough-store.ts` | `shared/src/stores/walkthrough-store.ts` | 151 | zustand |
| `app/lib/stores/locale-store.ts` | `shared/src/stores/locale-store.ts` | ~100 | zustand |
| `app/lib/stores/mcp-store.ts` | `shared/src/stores/mcp-store.ts` | ~200 | zustand |
| `app/lib/stores/hidden-files.ts` | `shared/src/stores/hidden-files.ts` | ~50 | zustand |

**总计**：~5,000 行纯逻辑代码

### 不提取（留在 `app/` 内）

| 模块 | 原因 |
|------|------|
| `app/lib/agent/tools.ts` (732 行) | 依赖 `@sinclair/typebox` + 服务端 fs 操作定义，工具执行在后端 |
| `app/lib/agent/context.ts` (468 行) | 依赖 token 计数 + 服务端逻辑 |
| `app/lib/agent/providers.ts` (349 行) | 依赖 pi-ai 服务端 API |
| `app/lib/agent/stream-consumer.ts` | 依赖 ReadableStream (Web API) |
| `app/lib/agent/non-streaming.ts` | 依赖服务端 fetch |
| `app/lib/agent/web-search.ts` | 依赖服务端 fetch |
| `app/lib/agent/skill-resolver.ts` | 依赖 fs 读取 skill 文件 |
| `app/lib/core/fs-ops.ts` | 依赖 Node.js `fs` |
| `app/lib/core/git.ts` | 依赖 `child_process` |
| `app/lib/core/tree.ts` | 依赖 `fs.readdir` |
| `app/lib/core/search*.ts` | 依赖 `fs` 读取文件内容 |
| `app/lib/core/inbox.ts` | 依赖 `fs` |
| `app/lib/core/trash.ts` | 依赖 `fs` |
| `app/lib/core/export.ts` | 依赖 `archiver` + `fs` |
| `app/lib/fs.ts` | 全部 Node.js fs 操作 |
| `app/lib/stores/*.Init.tsx` | DOM 绑定（window.addEventListener） |
| 所有 `app/components/` | React DOM 组件 |
| 所有 `app/hooks/` | 多数依赖 DOM/Next.js Router |

---

## 实现步骤

### Step 1: 创建 `packages/shared` 包结构

```json
// packages/shared/package.json
{
  "name": "@mindos/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./agent": "./src/agent/index.ts",
    "./i18n": "./src/i18n/index.ts",
    "./stores": "./src/stores/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "dependencies": {
    "zustand": "^5.0.12",
    "papaparse": "^5.5.3"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

```json
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### Step 2: 配置 npm workspaces

```json
// 根 package.json 新增
{
  "workspaces": ["packages/*", "app"]
}
```

### Step 3: 移动文件

逐模块迁移，每个模块迁移后立刻跑测试确认不破坏：

1. **types** → `packages/shared/src/types/` → 更新 `app/` import → 跑测试
2. **errors** → `packages/shared/src/errors.ts` → 更新 import → 跑测试
3. **i18n** → `packages/shared/src/i18n/` → 更新 import → 跑测试
4. **agent 纯逻辑子模块** → `packages/shared/src/agent/` → 更新 import → 跑测试
5. **utils** → `packages/shared/src/utils/` → 更新 import → 跑测试
6. **stores**（去除 Init 组件）→ `packages/shared/src/stores/` → 更新 import → 跑测试

### Step 4: 更新 `app/` 的 import

原始：
```typescript
import { Message, ChatSession } from '@/lib/types';
import { useLocaleStore } from '@/lib/stores/locale-store';
```

迁移后：
```typescript
import { Message, ChatSession } from '@mindos/shared/types';
import { useLocaleStore } from '@mindos/shared/stores';
```

`app/lib/` 保留一个 re-export 过渡层（可选，6 个月后移除）：
```typescript
// app/lib/types.ts — 过渡期 re-export
export * from '@mindos/shared/types';
```

### Step 5: 验证

- `cd app && npm test` — 全量测试通过
- `cd packages/shared && npx tsc --noEmit` — 类型检查通过
- `cd app && npm run build` — 构建通过

---

## 数据流

```
packages/shared/           app/ (Web)              mobile/ (Phase 1)
┌──────────────┐     ┌──────────────────┐    ┌──────────────────┐
│ types/       │◄────│ import from      │    │ import from      │
│ agent/       │     │ @mindos/shared   │    │ @mindos/shared   │
│ i18n/        │◄────│                  │    │                  │
│ stores/      │     │ + DOM 组件       │    │ + RN 组件        │
│ utils/       │     │ + Next.js 路由   │    │ + Expo 路由      │
└──────────────┘     │ + Node.js fs     │    │ + 移动端 fs      │
                     └──────────────────┘    └──────────────────┘
```

---

## 边界 case

| Case | 处理方式 |
|------|----------|
| Zustand store 引用 `window` | stores 本身不引用 window；Init 组件留在 `app/` 和 `mobile/` |
| i18n 文件很大（~1600 行/语言） | 不拆分，tree-shaking 由消费端处理 |
| 循环依赖 | `shared` 不允许 import `app/` 任何东西；CI lint 规则防护 |
| pi-agent-core 类型 | 仅 `to-agent-messages.ts` 依赖；作为 peerDependency |
| 测试文件 | 测试留在 `app/__tests__/` 不动，import 路径跟着改 |

---

## 风险

| 风险 | 严重性 | Mitigation |
|------|--------|------------|
| 大量 import 路径变更导致遗漏 | 中 | IDE 全局替换 + TypeScript 编译检查 |
| npm workspaces 与 Next.js 16 兼容性 | 低 | Next.js 官方支持 monorepo |
| `packages/shared` 意外引入 DOM 依赖 | 中 | tsconfig 中 `lib: ["ES2022"]`（不含 DOM） |

---

## 验收标准

- [ ] `packages/shared/` 目录存在，包含 types/agent/i18n/stores/utils 子目录
- [ ] `packages/shared/tsconfig.json` 的 `lib` 不包含 `DOM`
- [ ] `app/` 中所有 `@/lib/types` 等 import 指向 `@mindos/shared`
- [ ] `npm test`（app）全量通过
- [ ] `npx tsc --noEmit`（shared）通过
- [ ] `npm run build`（app）通过
- [ ] 无循环依赖：shared 不 import app/ 中任何东西
