# Spec: React Native 移动端前置条件与风险修复

> 日期：2026-04-10
> 状态：Draft
> 适用：Phase 0-3 所有 Spec

## 背景

对 Phase 0-3 Spec 进行两轮对抗性审查后，发现 9 个 Blocker、15 个 Major 问题。本文档列出所有需要在开发前解决的前置条件和修复项。

---

## 🔴 Blocker 级问题修复

### B1: CORS 缺失（影响全部 Phase）

**问题**：当前只有 `/api/health` 有 CORS headers。移动端 fetch 其他 API 会被浏览器内核拦截。

**修复方案**：在 `app/next.config.ts` 添加全局 CORS 头，或创建 middleware。

```typescript
// app/middleware.ts — 新增
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // 允许移动端跨域请求
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理 preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

**验收标准**：
- [ ] `curl -I -X OPTIONS http://localhost:3456/api/files` 返回 `Access-Control-Allow-Origin: *`
- [ ] 移动端 fetch `/api/files` 成功

---

### B2: React / React Native 版本不兼容（影响 Phase 1-3）

**问题**：Spec 中写 `react: 19.2.3` + `react-native: 0.77.0`，但 Expo SDK 52 使用 React 18.3.1 + RN 0.76.x。

**修复方案**：使用 Expo SDK 52 官方版本。

```json
// mobile/package.json 正确版本
{
  "dependencies": {
    "expo": "~52.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5"
  }
}
```

**验收**：`npx create-expo-app@latest --template` 默认模板版本

---

### B3: pi-agent-core peerDependency 缺失（影响 Phase 0）

**问题**：`packages/shared` 依赖 `pi-agent-core` 但未声明。

**修复方案**：

```json
// packages/shared/package.json
{
  "peerDependencies": {
    "@mariozechner/pi-agent-core": "^0.60.0",
    "react": ">=18"
  }
}
```

---

### B4: Metro bundler 不解析 npm workspaces（影响 Phase 0-3）

**问题**：Expo Metro 默认不解析 symlinked workspace packages。

**修复方案**：

```javascript
// mobile/metro.config.js — 新增
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '..');

const config = getDefaultConfig(projectRoot);

// 监听 workspace packages 变更
config.watchFolders = [workspaceRoot];

// 解析 workspace packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 防止重复 React 实例
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

---

### B5: expectedMtime 冲突检测不存在（影响 Phase 3）

**问题**：Spec 声称 `/api/files` POST 支持 `expectedMtime` 参数，但实际代码没有实现。

**修复方案**：在 `/api/files/route.ts` 添加冲突检测。

```typescript
// app/app/api/files/route.ts 修改
export async function POST(req: NextRequest) {
  const { path, content, expectedMtime } = await req.json();
  
  // 冲突检测
  if (expectedMtime !== undefined) {
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat && stat.mtimeMs > expectedMtime) {
      return NextResponse.json(
        { error: 'conflict', serverMtime: stat.mtimeMs },
        { status: 409 }
      );
    }
  }
  
  await fs.writeFile(fullPath, content, 'utf-8');
  const newStat = await fs.stat(fullPath);
  return NextResponse.json({ ok: true, mtime: newStat.mtimeMs });
}
```

---

### B6: SSE 库 API 不确定（影响 Phase 2）

**问题**：`react-native-sse` 可能不支持 POST + body 的用法，文档和实际 API 有差异。

**修复方案**：改用更成熟的方案——基于 `fetch` + `ReadableStream` polyfill。

```typescript
// mobile/lib/sse-client.ts — 修复版
import { decode } from 'base64-arraybuffer';

export function streamChat(
  baseUrl: string,
  params: { messages: Message[]; mode: AskMode; sessionId: string },
  callbacks: {
    onTextDelta: (text: string) => void;
    onToolCall: (toolCall: ToolCallPart) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }
): () => void {
  const controller = new AbortController();
  
  (async () => {
    try {
      const response = await fetch(`${baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(params),
        signal: controller.signal,
        // @ts-expect-error React Native polyfill
        reactNative: { textStreaming: true },
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text_delta') callbacks.onTextDelta(data.text);
            if (data.type === 'tool_call_start') callbacks.onToolCall(data);
            if (data.type === 'done') callbacks.onDone();
          }
        }
      }
      
      callbacks.onDone();
    } catch (error) {
      if (error.name !== 'AbortError') {
        callbacks.onError(error as Error);
      }
    }
  })();
  
  return () => controller.abort();
}
```

**备选方案**：如果 fetch streaming 在 RN 不稳定，改用 WebSocket 双向通信。

---

### B7: 服务发现机制缺失（影响 Phase 1）

**问题**：用户不知道电脑的 IP 地址，手动输入 `192.168.x.x` 极易出错。

**修复方案**：桌面端 Web 提供 QR 码连接。

```typescript
// app/app/api/connect-qr/route.ts — 新增
import { getLocalIPAddress } from '@/lib/network';
import QRCode from 'qrcode';

export async function GET() {
  const ip = getLocalIPAddress();
  const port = process.env.MINDOS_WEB_PORT || '3456';
  const url = `http://${ip}:${port}`;
  
  const qrDataUrl = await QRCode.toDataURL(url, { width: 256 });
  
  return NextResponse.json({ url, qrDataUrl });
}
```

```typescript
// app/lib/network.ts — 新增
import os from 'os';

export function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}
```

Settings 页面显示 QR 码 + 手动复制 URL。移动端扫码自动填入。

---

### B8: Android TextInput 性能阈值过高（影响 Phase 3）

**问题**：Spec 声称 100KB 文件可编辑，但 Android 上 20KB 就会卡顿。

**修复方案**：按平台区分阈值。

```typescript
// mobile/lib/editor-config.ts
import { Platform } from 'react-native';

export const EDITOR_LIMITS = {
  // Android bridge serialization 瓶颈更明显
  maxEditableSize: Platform.OS === 'android' ? 20 * 1024 : 100 * 1024,
  maxWithSyntaxHighlight: Platform.OS === 'android' ? 10 * 1024 : 50 * 1024,
};
```

---

### B9: Phase 0 提取表缺少 Message/AskMode 等类型（影响 Phase 2）

**问题**：Phase 2 依赖的类型在 Phase 0 提取表中未列出。

**修复**：补充提取清单：

| 源路径 | 目标路径 | 说明 |
|--------|----------|------|
| `app/lib/types.ts` 全部内容 | `shared/src/types/index.ts` | 包含 Message, AskMode, ToolCallPart, ImagePart 等 |
| `app/lib/core/types.ts` | `shared/src/types/core.ts` | FileNode, SearchResult, BacklinkEntry |

---

## 🟡 Major 级问题修复摘要

| 问题 | 影响 | 修复方向 |
|------|------|----------|
| git mv 保留历史 | Phase 0 | 迁移脚本使用 `git mv` 而非 copy+delete |
| 过渡层 deprecation warning | Phase 0 | re-export 加 `console.warn` 提醒 |
| tsconfig moduleResolution | Phase 0 | 改为 `node16` |
| fetch 缺 timeout | Phase 1 | 所有 fetch 加 `AbortSignal.timeout(15000)` |
| HTTPS 自签证书配置 | Phase 1 | 添加 `app.json` ATS 配置 + Android network_security_config |
| NativeWind 配置 | Phase 1 | 添加完整 babel/tailwind/postcss 配置指引 |
| react-native-markdown-display 维护状态 | Phase 1-2 | 备选：@ronradtke/react-native-markdown-display |
| SSE 重连不恢复上下文 | Phase 2 | 简化为"连接断开，点击重试"，不自动重连流内容 |
| useChat 闭包 race condition | Phase 2 | messages 存 ref 而非闭包捕获 |
| WikiLink 预处理 | Phase 2 | `[[link]]` → `[link](mindos://file/link)` |
| 语法高亮未定义 | Phase 3 | 明确当前版本无语法高亮，大文件只是降级 |
| Unicode 字符计数 | Phase 3 | 使用 `Intl.Segmenter` 或标记为 known limitation |
| 无 undo/redo | Phase 3 | 添加简单 undo stack（useState 数组） |
| Android TextInput 滚动问题 | Phase 3 | 添加 Android 测试要求 |
| AsyncStorage 6MB 限制 | Phase 3 | 实现 draft LRU 淘汰 |

---

## 🟢 Minor 级问题

- Bundle size 验收标准
- SSE 首 token 延迟可测量
- 100KB 文件编辑延迟可测量
- Keep Both 命名规则

---

## 新增 Spec 建议

1. **spec-rn-phase4-store-submission.md** — App Store / Google Play 上架流程
   - Apple Developer 账号
   - EAS Build 配置
   - 证书管理
   - 隐私政策
   - 审核合规

2. **spec-cors-middleware.md** — 全局 CORS 中间件
   - 作为 Phase 0.5 前置条件

3. **spec-qr-connect.md** — 桌面端 QR 码连接
   - Settings 显示 QR 码
   - 移动端扫码连接

---

## 实施优先级

```
Week 0: CORS 中间件 + QR 连接 + expectedMtime
     ↓
Week 1-2: Phase 0 (Monorepo)
     ↓
Week 3-4: Phase 1 (App Shell)
     ↓
Week 5-6: Phase 2 (AI Chat)
     ↓
Week 7-8: Phase 3 (Markdown Editor)
     ↓
Week 9+: Phase 4 (App Store)
```

---

## 验收标准（总）

- [ ] 所有 9 个 Blocker 已修复
- [ ] CORS 中间件已部署，移动端 fetch 通过
- [ ] Expo SDK 52 + React 18.3 版本运行正常
- [ ] Metro 能解析 @mindos/shared
- [ ] 冲突检测 expectedMtime 可用
- [ ] 桌面端可显示连接 QR 码
- [ ] SSE 流式通信在 iOS/Android 上稳定
