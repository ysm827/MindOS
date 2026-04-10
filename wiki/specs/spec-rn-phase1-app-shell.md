# Spec: React Native App Shell 与导航 (Phase 1)

> 日期：2026-04-10
> 状态：Draft
> 前置：spec-rn-phase0-monorepo-shared-packages.md
> 后继：spec-rn-phase2-ai-chat.md

## 目标

创建 MindOS 移动端 React Native + Expo 项目骨架，包含：
1. Expo 项目初始化与配置
2. 底部 Tab 导航 + Stack 路由
3. 连接 MindOS 后端（本地/远程）
4. 文件树浏览与 Markdown 预览
5. 设置页面（连接配置）

### Why（YAGNI check）

移动端第一个可用功能是**浏览知识库**。没有文件浏览，后续的编辑/AI Chat 无处附着。

### Simpler（KISS check）

Phase 1 不做编辑、不做 AI Chat。只做**只读浏览 + 连接配置**。最小可测试闭环。

---

## 竞品参考

| 产品 | 移动端导航模式 | 一级 Tab |
|------|--------------|----------|
| Notion | 底部 Tab (5) | Home / Search / Inbox / Notes / More |
| Obsidian | 底部 Tab (3-5) | Files / Search / (custom) |
| Bear | 侧边栏 + 列表 | Sidebar → Note list → Note |
| Craft | 底部 Tab (4) | Home / Search / Shared / Settings |
| Linear | 底部 Tab (5) | Inbox / Issues / Projects / Views / My |

**共性**：底部 Tab 导航是知识类 APP 的标准模式。

---

## User Flow

```
用户目标：在手机上浏览 MindOS 知识库内容

前置条件：用户已安装 MindOS 移动端 APP

Step 1: 用户首次打开 APP
  → 系统反馈：显示 Welcome 页面，提示输入 MindOS 服务地址
  → 状态变化：APP 进入「未连接」状态

Step 2: 用户输入 MindOS 后端地址（如 http://192.168.1.10:3456）
  → 系统反馈：显示「正在连接...」+ 旋转指示器
  → 状态变化：APP 调用 /api/health 验证连接

Step 3a: 连接成功
  → 系统反馈：绿色 ✓「已连接 MindOS」，自动跳转到首页
  → 状态变化：地址保存到 AsyncStorage，进入「已连接」状态

Step 3b: 连接失败
  → 系统反馈：红色提示「无法连接，请确认 MindOS 正在运行且地址正确」
  → 状态变化：停留在配置页，用户可修改地址重试

Step 4: 用户看到首页
  → 系统反馈：显示 Space 列表 + 最近文件 + 系统摘要
  → 状态变化：已从 /api/files 获取文件树

Step 5: 用户点击某个 Space
  → 系统反馈：展开文件列表，显示该 Space 下的文件和子目录
  → 状态变化：文件树节点展开

Step 6: 用户点击某个 .md 文件
  → 系统反馈：Push 进入文件查看页，渲染 Markdown 内容
  → 状态变化：从 /api/files?path=xxx 获取文件内容

Step 7: 用户左滑返回
  → 系统反馈：回到文件列表

成功结果：用户能在手机上流畅浏览知识库

异常分支：
- 异常 A：网络中断 → Toast 提示「网络连接已断开」+ 显示缓存内容
- 异常 B：文件不存在 → 显示「文件未找到」+ 返回按钮
- 异常 C：服务端返回 500 → 显示「服务端错误」+ 重试按钮
- 异常 D：超大文件 (>1MB) → 分块加载 + 进度条

边界场景：
- 空知识库（零文件）→ 显示空态引导「开始在桌面端创建你的第一个笔记」
- 超多文件 (>5000) → 虚拟列表 + 搜索过滤
- 非 UTF-8 文件 → 显示「不支持的文件格式」
- 深层嵌套目录 (>10 层) → Breadcrumb 可横向滚动
```

---

## UI 线框图

### 状态 1：首次打开 — Welcome / 连接配置

```
┌──────────────────────────────────┐
│         (status bar)             │
│                                  │
│                                  │
│          ◆  MindOS               │
│     Your Mind, Everywhere        │
│                                  │
│  ┌──────────────────────────┐    │
│  │ http://192.168.1.10:3456 │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │      [ Connect ]         │    │
│  └──────────────────────────┘    │
│                                  │
│  Also try: Scan QR code         │
│                                  │
│                                  │
│                                  │
└──────────────────────────────────┘
```

### 状态 2：首页 — Home Tab

```
┌──────────────────────────────────┐
│  MindOS           (●) Connected  │
├──────────────────────────────────┤
│                                  │
│  Spaces                          │
│  ┌─────────┐ ┌─────────┐        │
│  │ 📁 Work │ │ 📁 Life │ +      │
│  │ 12 files│ │ 8 files │        │
│  └─────────┘ └─────────┘        │
│                                  │
│  Recently Active                 │
│  ┌──────────────────────────┐    │
│  │ 📝 meeting-notes.md      │    │
│  │    Work · 2 hours ago    │    │
│  ├──────────────────────────┤    │
│  │ 📝 project-ideas.md      │    │
│  │    Life · yesterday      │    │
│  ├──────────────────────────┤    │
│  │ 📊 contacts.csv          │    │
│  │    Work · 3 days ago     │    │
│  └──────────────────────────┘    │
│                                  │
├──────────────────────────────────┤
│  🏠 Home  📁 Files  🔍 Search  ⚙│
└──────────────────────────────────┘
```

### 状态 3：文件列表 — Files Tab

```
┌──────────────────────────────────┐
│  ← Files                        │
├──────────────────────────────────┤
│  Work/                           │
│  ┌──────────────────────────┐    │
│  │ 📁 projects/          >  │    │
│  ├──────────────────────────┤    │
│  │ 📁 meeting-notes/     >  │    │
│  ├──────────────────────────┤    │
│  │ 📝 weekly-review.md      │    │
│  │    1.2 KB · 2h ago       │    │
│  ├──────────────────────────┤    │
│  │ 📊 budget.csv            │    │
│  │    3.4 KB · 1d ago       │    │
│  ├──────────────────────────┤    │
│  │ ✅ TODO.md               │    │
│  │    0.8 KB · 3d ago       │    │
│  └──────────────────────────┘    │
│                                  │
│                                  │
├──────────────────────────────────┤
│  🏠 Home  📁 Files  🔍 Search  ⚙│
└──────────────────────────────────┘
```

### 状态 4：文件查看 — Markdown Preview

```
┌──────────────────────────────────┐
│  ← weekly-review.md    ⋮        │
├──────────────────────────────────┤
│                                  │
│  # Weekly Review                 │
│                                  │
│  ## What I Did                   │
│                                  │
│  - Completed project proposal    │
│  - Reviewed team feedback        │
│  - Updated **roadmap**           │
│                                  │
│  ## Next Week                    │
│                                  │
│  1. Start mobile app dev         │
│  2. Review Q2 OKRs              │
│                                  │
│  > Note: Deadline is Friday     │
│                                  │
│  [[project-ideas]] ← 链接       │
│                                  │
│                                  │
│                                  │
│                                  │
└──────────────────────────────────┘
```

### 状态 5：空态

```
┌──────────────────────────────────┐
│  MindOS                          │
├──────────────────────────────────┤
│                                  │
│                                  │
│                                  │
│         📭                       │
│                                  │
│    Your mind is empty            │
│                                  │
│    Start writing on desktop,     │
│    and it'll show up here.       │
│                                  │
│    [ Open Desktop Guide ]        │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│  🏠 Home  📁 Files  🔍 Search  ⚙│
└──────────────────────────────────┘
```

### 状态 6：连接失败

```
┌──────────────────────────────────┐
│                                  │
│          ◆  MindOS               │
│                                  │
│  ┌──────────────────────────┐    │
│  │ http://192.168.1.10:3456 │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ ✗ Unable to connect      │    │
│  │                          │    │
│  │ Make sure MindOS is      │    │
│  │ running on your computer │    │
│  │ and connected to the     │    │
│  │ same network.            │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │      [ Try Again ]       │    │
│  └──────────────────────────┘    │
│                                  │
└──────────────────────────────────┘
```

### 状态流转图

```
[Welcome]──输入地址──→[连接中...]──成功──→[Home Tab]
                          │                  │
                          └──失败──→[错误提示]──重试──→[连接中...]
                                                │
                                              修改地址──→[Welcome]

[Home Tab]──点击 Space──→[Files Tab / 子目录]──点击文件──→[文件查看]
    │                           │                           │
    │                           └──返回──→[Home Tab]         └──返回──→[Files]
    │
    ├──点击 Search──→[搜索页]
    └──点击 Settings──→[设置页]
```

---

## 技术方案

### Expo 项目配置

```json
// mobile/app.json
{
  "expo": {
    "name": "MindOS",
    "slug": "mindos",
    "version": "1.0.0",
    "scheme": "mindos",
    "platforms": ["ios", "android"],
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "backgroundColor": "#1a1917"
    },
    "plugins": ["expo-router"],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

### 路由结构（Expo Router file-based）

```
mobile/app/
├── _layout.tsx              # Root layout（Tab 导航）
├── (tabs)/
│   ├── _layout.tsx          # Tab bar 定义
│   ├── index.tsx            # Home tab
│   ├── files.tsx            # Files tab（文件树根）
│   ├── search.tsx           # Search tab
│   └── settings.tsx         # Settings tab
├── files/
│   └── [...path].tsx        # 文件/目录动态路由
├── view/
│   └── [...path].tsx        # 文件查看页
└── connect.tsx              # 首次连接配置
```

### 导航架构

```
TabNavigator
├── Home (Stack)
│   └── HomeScreen
├── Files (Stack)
│   ├── FilesRootScreen
│   └── FilesPathScreen (dynamic [...path])
├── Search (Stack)
│   └── SearchScreen
└── Settings (Stack)
    └── SettingsScreen
        └── ConnectScreen
```

### API 客户端

```typescript
// mobile/lib/api-client.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mindos_server_url';

class MindOSClient {
  private baseUrl: string = '';

  async init() {
    this.baseUrl = (await AsyncStorage.getItem(STORAGE_KEY)) || '';
  }

  async setServer(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
    await AsyncStorage.setItem(STORAGE_KEY, this.baseUrl);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getFiles(path: string = ''): Promise<FileNode[]> {
    const res = await fetch(
      `${this.baseUrl}/api/files?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getFileContent(path: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/files?path=${encodeURIComponent(path)}&content=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content;
  }

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

export const mindosClient = new MindOSClient();
```

### 关键依赖

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "react": "19.2.3",
    "react-native": "0.77.0",
    "react-native-safe-area-context": "^5.0.0",
    "react-native-screens": "^4.0.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "react-native-markdown-display": "^7.0.0",
    "@expo/vector-icons": "^14.0.0",
    "nativewind": "^4.0.0",
    "@mindos/shared": "workspace:*",
    "zustand": "^5.0.12"
  }
}
```

---

## 影响范围

### 新增文件

| 文件 | 说明 |
|------|------|
| `mobile/` | 整个 Expo 项目 |
| `mobile/app/` | Expo Router 路由 |
| `mobile/components/` | RN 组件 |
| `mobile/lib/api-client.ts` | API 客户端 |
| `mobile/lib/connection-store.ts` | 连接状态 Zustand store |

### 修改文件

| 文件 | 变更 |
|------|------|
| `package.json` (根) | 添加 `mobile` 到 workspaces |
| `app/app/api/health/route.ts` | 确保 CORS 允许移动端请求 |

---

## 边界 case

| Case | 处理方式 |
|------|----------|
| 服务端在不同子网 | 提示用户确认同一 WiFi 网络 |
| HTTPS 自签证书 | Expo 开发模式允许；生产需用户信任 |
| 服务端重启 | 心跳检测 30s 间隔，断开后自动重连 |
| iPad / 平板 | 使用响应式布局，宽屏显示两栏 |
| 大图片嵌入 Markdown | 远程图片懒加载 + 占位符 |
| Wikilink `[[xxx]]` | 渲染为可点击链接，导航到对应文件 |

---

## 风险

| 风险 | 严重性 | Mitigation |
|------|--------|------------|
| Expo SDK 52 与 React 19 兼容性 | 中 | 使用 Expo 官方支持的 React 版本 |
| 局域网发现困难 | 低 | QR 码扫描 + 手动输入双入口 |
| CORS 阻止移动端请求 | 高 | 服务端 `/api/health` 等路由添加 CORS headers |
| Android 返回键行为不一致 | 低 | 使用 Expo Router 默认处理 |

---

## 验收标准

- [ ] `npx expo start` 可启动开发服务器
- [ ] iOS 模拟器/真机可打开 APP
- [ ] Android 模拟器/真机可打开 APP
- [ ] 首次打开显示 Welcome 连接页
- [ ] 输入有效 MindOS 地址可成功连接
- [ ] 连接后显示 Home tab 含 Space 列表 + 最近文件
- [ ] 点击 Space 展开文件列表
- [ ] 点击 .md 文件可预览 Markdown 内容
- [ ] Search tab 可全文搜索知识库
- [ ] Settings tab 可修改服务端地址
- [ ] 网络中断有 Toast 提示
- [ ] 空知识库有引导提示
