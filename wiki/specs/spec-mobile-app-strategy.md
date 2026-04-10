# Spec: MindOS 移动端 APP 跨端方案

> 日期：2026-04-10  
> 状态：调研完成，待决策

## 目标

将 MindOS 扩展到移动端（iOS + Android），实现：
1. **跨端覆盖**：同时支持 Android 和 iOS
2. **代码复用**：最大化复用现有 Next.js 16 + React 19 代码
3. **核心功能**：本地 Markdown 文件读写、AI Agent 运行、富文本编辑、知识图谱

---

## 现状分析

### 当前技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js + React | 16.1.6 / 19.2.3 |
| 样式 | Tailwind + shadcn/ui | 4.x |
| 富文本 | TipTap | 3.20.1 |
| 图谱 | @xyflow/react | 12.10.1 |
| 状态管理 | Zustand | 5.0.12 |
| AI 运行时 | pi-agent-core + pi-ai | 0.60.0 |
| 桌面端 | Electron | v0.1.x |

### 已有基础

- ✅ PWA 配置（manifest.json + sw.js）
- ✅ Electron Desktop（macOS/Windows/Linux）
- ✅ 响应式设计（viewport 配置）
- ❌ 移动端专属 UI（无触控手势、无底部导航）
- ❌ 移动端 Safe Area 适配

### 核心挑战

1. **本地文件访问**：移动端需要读写本地 Markdown 文件
2. **组件复用**：189 个 TSX 组件是否能直接复用
3. **性能要求**：TipTap 编辑器、React Flow 图谱在移动端的表现
4. **App Store 上架**：需要真正的原生 APP

---

## 五种方案对比

### 快速对比表

| 方案 | 代码复用 | 原生能力 | 性能 | MVP 时间 | 包体积 | 推荐度 |
|------|----------|----------|------|----------|--------|--------|
| **Capacitor** | 85-95% | 中等 | 中等 | 2-4 周 | 15-40MB | ⭐⭐⭐⭐⭐ |
| React Native + Expo | 30-50% | 高 | 高 | 3-4 月 | 15-25MB | ⭐⭐⭐⭐ |
| Tauri Mobile | 70-85% | 高 | 高 | 2-3 月 | 5-15MB | ⭐⭐⭐ |
| PWA 增强 | 100% | 低 | 中等 | 0 | 0 | ❌ 不可行 |
| Expo 统一重写 | 60-70% | 高 | 高 | 4-6 月 | 15-25MB | ⭐⭐ |

### 详细分析

#### 1. Capacitor（推荐 MVP 方案）⭐⭐⭐⭐⭐

```
优势:
├─ 代码复用 85-95%（几乎所有前端代码）
├─ TipTap/React Flow 无需修改，直接运行
├─ 开发体验：熟悉的 Web 工具链
├─ Ionic 团队维护，生态成熟
└─ 最快上线：2-4 周

劣势:
├─ 需要静态导出（output: 'export'），无 SSR
├─ API Routes 不可用，需单独后端
├─ WebView 性能不及原生
└─ 复杂动画可能掉帧
```

**文件系统访问**：
```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// 读取 Markdown 文件
const content = await Filesystem.readFile({
  path: 'notes/my-note.md',
  directory: Directory.Documents,
  encoding: Encoding.UTF8
});

// 写入文件
await Filesystem.writeFile({
  path: 'notes/new-note.md',
  data: '# My Note\n\nContent here...',
  directory: Directory.Documents,
  encoding: Encoding.UTF8
});
```

#### 2. React Native + Expo（长期最佳方案）⭐⭐⭐⭐

```
优势:
├─ 真正的原生 UI，性能最佳
├─ Expo SDK 54 生态完善
├─ EAS 云构建，无需本地环境
├─ OTA 更新，绕过 App Store 审核
└─ 大厂背书：Discord、Shopify、Coinbase

劣势:
├─ 组件需重写（View/Text vs div/span）
├─ TipTap 需换 TenTap（WebView 包装）
├─ React Flow 需自行实现或 WebView 包装
├─ 开发周期 3-4 个月
└─ 维护两套 UI 代码
```

**TipTap 替代方案 - TenTap**：
```typescript
import { RichText, useEditorBridge } from '@10play/tentap-editor';

const editor = useEditorBridge({
  autofocus: true,
  initialContent: '# Welcome\n\nStart writing...',
});

return <RichText editor={editor} />;
```

#### 3. Tauri Mobile（最小包体积）⭐⭐⭐

```
优势:
├─ 包体积最小（5-15MB vs Electron 120MB）
├─ 系统 WebView，无 Chromium 捆绑
├─ Rust 后端性能强
└─ 如已用 Tauri Desktop，迁移几乎免费

劣势:
├─ 移动端支持刚成熟（2024.10 发布）
├─ 生态不如 Capacitor/Expo 成熟
├─ 需 Rust 知识（自定义插件时）
└─ 同样需要静态导出
```

#### 4. PWA 增强 ❌ 不可行

**iOS 致命限制**：
| 限制 | 影响 |
|------|------|
| ❌ File System Access API | **无法读写本地文件** |
| ❌ 50MB 存储限制 | 知识库可能超限 |
| ❌ 7 天缓存过期 | 数据会被清除 |
| ❌ EU 地区不支持 | iOS 17.4+ 完全不可用 |

**结论**：PWA 对 MindOS 完全不可行

#### 5. Expo 统一重写（新项目最佳）⭐⭐

```
适用场景:
├─ 从零开始的新项目
├─ 移动端优先的产品
└─ 团队熟悉 React Native

不推荐原因:
├─ 需重写全部 189 个组件
├─ 4-6 个月开发周期
└─ 对现有 Next.js 投资的浪费
```

---

## 数据流 / 状态流

### Capacitor 方案架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     移动端 APP                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              WebView 容器                            │   │
│  │  ┌────────────────────────────────────────────────┐ │   │
│  │  │         Next.js 静态导出                        │ │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │ │   │
│  │  │  │ React 19 │ │ TipTap   │ │ React Flow   │  │ │   │
│  │  │  │ 组件     │ │ 编辑器   │ │ 图谱         │  │ │   │
│  │  │  └──────────┘ └──────────┘ └──────────────┘  │ │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │ │   │
│  │  │  │ Zustand  │ │ Tailwind │ │ shadcn/ui    │  │ │   │
│  │  │  │ 状态     │ │ 样式     │ │ 组件         │  │ │   │
│  │  │  └──────────┘ └──────────┘ └──────────────┘  │ │   │
│  │  └────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                    Capacitor Bridge                         │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  原生插件层                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐        │   │
│  │  │Filesystem│ │ Push     │ │ Share        │        │   │
│  │  │ 文件操作 │ │ 推送通知 │ │ 系统分享     │        │   │
│  │  └──────────┘ └──────────┘ └──────────────┘        │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    本地存储                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Documents/                                           │  │
│  │  └── MindOS/                                         │  │
│  │      ├── spaces/           # 知识空间               │  │
│  │      │   └── default/                               │  │
│  │      │       ├── *.md      # Markdown 文件         │  │
│  │      │       └── .mindos/  # 配置                  │  │
│  │      └── config.json       # 全局配置               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
              │
              │ HTTP/WebSocket（可选）
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    云端服务（可选）                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐                │
│  │ 同步服务 │ │ AI 代理  │ │ MCP 服务器   │                │
│  └──────────┘ └──────────┘ └──────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 关键数据流

**1. 文件读写流**
```
用户操作 → React 组件 → Zustand Store → Capacitor Bridge → Native Filesystem → 本地文件
```

**2. AI Agent 执行流**
```
用户提问 → AskContent 组件 → pi-agent-core → LLM API → 流式响应 → UI 更新
```

**3. 离线同步流（未来）**
```
本地修改 → 变更队列 → 网络恢复 → 批量同步 → 冲突解决 → 状态更新
```

---

## 方案

### 推荐：分阶段实施

#### Phase 1: Capacitor MVP（2-4 周）

**目标**：快速上线验证市场需求

**步骤**：
1. 配置 Next.js 静态导出
2. 初始化 Capacitor 项目
3. 实现文件系统访问
4. 适配移动端 UI（Safe Area、触控优化）
5. iOS + Android 测试
6. 提交 App Store / Google Play

**代码改动**：
```typescript
// next.config.ts
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};
```

```bash
# 初始化 Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init MindOS com.mindos.app
npx cap add ios
npx cap add android
```

**预估工作量**：
| 任务 | 人天 |
|------|------|
| 静态导出配置 | 2 |
| Capacitor 集成 | 3 |
| 文件系统适配 | 5 |
| 移动端 UI 调整 | 5 |
| 测试 & 修 bug | 5 |
| App Store 提交 | 3 |
| **总计** | **~23 人天** |

#### Phase 2: 评估与决策（上线后 1-2 月）

**监控指标**：
- DAU / MAU
- 用户留存率
- App Store 评分
- 性能相关差评
- 功能请求分布

**决策树**：
```
用户反馈如何？
├─ 满意 → 继续优化 Capacitor 版本
├─ 性能抱怨多 → 考虑 Tauri 或 RN 重写
└─ 需要原生特性 → React Native + Expo 重写
```

#### Phase 3: React Native 重写（如有必要）

**触发条件**：
- 移动端 MAU > 10,000
- 性能差评占比 > 20%
- 关键功能无法在 WebView 实现

**迁移策略**：
1. 保持 Capacitor 版本在线
2. 从高频页面开始重写
3. 使用 TenTap 替换 TipTap
4. 渐进式用户迁移

---

## 影响范围

### 变更文件列表（Phase 1）

| 文件/目录 | 变更类型 | 说明 |
|-----------|----------|------|
| `next.config.ts` | 修改 | 添加 `output: 'export'` |
| `capacitor.config.ts` | 新增 | Capacitor 配置 |
| `ios/` | 新增 | iOS 原生项目 |
| `android/` | 新增 | Android 原生项目 |
| `app/lib/fs-mobile.ts` | 新增 | 移动端文件系统抽象 |
| `app/components/` | 修改 | Safe Area 适配 |
| `package.json` | 修改 | 添加 Capacitor 依赖 |

### 受影响的模块

| 模块 | 影响程度 | 原因 |
|------|----------|------|
| 文件操作 | 高 | 需要适配 Capacitor Filesystem |
| API Routes | 高 | 静态导出不支持，需重构 |
| 图片优化 | 中 | 需禁用 Next.js Image |
| 路由 | 中 | 动态路由需添加 trailingSlash |
| 组件库 | 低 | 大部分直接可用 |
| 状态管理 | 低 | Zustand 无需改动 |

### 不受影响的模块

- TipTap 编辑器（在 WebView 中运行）
- React Flow 图谱（在 WebView 中运行）
- Tailwind 样式（静态 CSS）
- shadcn/ui 组件（纯 React）
- pi-agent-core（纯 JS）

---

## 边界 case 与风险

### 边界 Case

| Case | 处理方式 |
|------|----------|
| 超大文件（>10MB Markdown） | 分块读取 + 虚拟滚动 |
| 离线状态下 AI 调用 | 提示用户需要网络 + 缓存上次结果 |
| 存储空间不足 | 检测可用空间 + 清理缓存引导 |
| iOS 权限拒绝 | 引导用户去设置开启 |
| Android 后台杀进程 | 定期自动保存 + 恢复机制 |
| 键盘遮挡输入框 | iOS: avoidIosKeyboard; Android: adjustResize |

### 风险与 Mitigation

| 风险 | 严重性 | Mitigation |
|------|--------|------------|
| App Store 审核拒绝 | 高 | 提前研究审核指南，准备隐私政策 |
| WebView 性能不足 | 中 | 性能监控 + 降级方案 + Phase 3 准备 |
| 静态导出遗漏动态功能 | 中 | 全面测试 + 渐进式迁移 API Routes |
| Android 碎片化 | 中 | 覆盖主流机型测试（小米、华为、OPPO） |
| 用户数据迁移 | 低 | 设计导入导出功能 + 云同步 |

---

## 验收标准

### Phase 1 MVP 完成标准

- [ ] iOS 模拟器 + 真机运行正常
- [ ] Android 模拟器 + 真机运行正常
- [ ] 本地 Markdown 文件读写功能正常
- [ ] TipTap 编辑器可正常输入中英文
- [ ] React Flow 图谱可拖拽缩放
- [ ] 文件树导航可展开折叠
- [ ] AI 对话功能可正常使用
- [ ] 无明显卡顿（<16ms 帧时间）
- [ ] App Store 审核通过
- [ ] Google Play 审核通过

### 性能基准

| 指标 | 目标值 |
|------|--------|
| 冷启动时间 | < 2s |
| 文件列表渲染（1000 文件） | < 500ms |
| Markdown 文件打开 | < 300ms |
| 编辑器输入延迟 | < 50ms |
| 内存占用（空闲） | < 150MB |
| 安装包大小 | < 50MB |

---

## 附录：技术细节

### Capacitor 插件清单

```json
{
  "dependencies": {
    "@capacitor/core": "^6.0.0",
    "@capacitor/cli": "^6.0.0",
    "@capacitor/ios": "^6.0.0",
    "@capacitor/android": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/push-notifications": "^6.0.0",
    "@capacitor/share": "^6.0.0",
    "@capacitor/haptics": "^6.0.0",
    "@capacitor/keyboard": "^6.0.0",
    "@capacitor/status-bar": "^6.0.0",
    "@capacitor/splash-screen": "^6.0.0"
  }
}
```

### 文件系统抽象层设计

```typescript
// app/lib/fs-adapter.ts
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export async function readFile(path: string): Promise<string> {
  if (isNative) {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  } else {
    // Web fallback: fetch from API or IndexedDB
    return fetch(`/api/files?path=${encodeURIComponent(path)}`).then(r => r.text());
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isNative) {
    await Filesystem.writeFile({
      path,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } else {
    await fetch('/api/files', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  }
}
```

### 移动端 UI 适配要点

```css
/* globals.css 新增 */

/* Safe Area 适配 */
.safe-area-top {
  padding-top: env(safe-area-inset-top);
}
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

/* 触控优化 */
@media (hover: none) and (pointer: coarse) {
  /* 增大点击区域 */
  button, a, [role="button"] {
    min-height: 44px;
    min-width: 44px;
  }
  
  /* 禁用 hover 效果 */
  .hover\:bg-gray-100:hover {
    background-color: initial;
  }
  
  /* 使用 active 替代 */
  .hover\:bg-gray-100:active {
    background-color: rgb(243 244 246);
  }
}
```

---

## 参考资料

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Next.js 静态导出](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Expo SDK 54 文档](https://docs.expo.dev/)
- [TenTap 富文本编辑器](https://github.com/10play/10tap-editor)
- [Tauri 2.0 移动端](https://v2.tauri.app/start/prerequisites/)
- 完整调研报告：`wiki/research/mobile-app-approaches-2026.md`
