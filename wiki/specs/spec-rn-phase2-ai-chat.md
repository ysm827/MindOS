# Spec: 移动端 AI Chat (Phase 2)

> 日期：2026-04-10
> 状态：Draft
> 前置：spec-rn-phase1-app-shell.md
> 后继：spec-rn-phase3-markdown-editor.md

## 目标

将 MindOS 的 Ask AI 对话功能移植到 React Native 移动端，支持：
1. 文本对话（Chat/Agent 双模式）
2. SSE 流式响应实时渲染
3. 工具调用过程可视化
4. @mention 引用知识库文件
5. 会话历史管理

### Why（YAGNI check）

AI Chat 是 MindOS 的核心功能。没有 AI 对话，移动端只是一个文件浏览器。

### Simpler（KISS check）

Phase 2 暂不支持：图片上传（multimodal）、文件编辑（save insight）、AI organize。只做**对话 + 工具调用可视化**。

---

## 竞品参考

| 产品 | 移动端 AI Chat 模式 |
|------|---------------------|
| ChatGPT | 底部输入框 + 消息流 + 工具调用折叠 |
| Claude | 底部输入框 + 消息流 + artifact 预览 |
| Notion AI | Inline block 内嵌 + 侧边面板 |
| Obsidian | 插件实现，全屏对话 |

**MindOS 移动端选择**：底部 Tab 新增 Chat，全屏对话模式。理由：移动端屏幕小，侧边面板不实用。

---

## User Flow

```
用户目标：在手机上向 MindOS AI 提问并获得基于知识库的回答

前置条件：用户已连接 MindOS 后端（Phase 1 完成）

Step 1: 用户点击底部 Chat tab（或 Home 中的 Ask AI 入口）
  → 系统反馈：显示 Chat 页面，底部输入框获取焦点
  → 状态变化：加载最近会话（如有）

Step 2: 用户输入问题「帮我总结一下本周的会议记录」
  → 系统反馈：输入框文字显示，发送按钮高亮
  → 状态变化：本地 draft 保存

Step 3: 用户点击发送
  → 系统反馈：用户消息气泡出现，底部显示「◌ Thinking...」
  → 状态变化：POST /api/ask 发起请求，SSE 流开始

Step 4: AI 开始执行工具调用
  → 系统反馈：显示折叠的工具调用卡片「🔧 search: 会议记录」
  → 状态变化：SSE 事件 tool_call_start → tool_call_done

Step 5: AI 返回文本响应（流式）
  → 系统反馈：文字逐字出现在 assistant 消息气泡中
  → 状态变化：SSE text_delta 事件逐块渲染

Step 6: 响应完成
  → 系统反馈：thinking 指示器消失，消息完整显示
  → 状态变化：会话自动保存

Step 7: 用户使用 @mention 引用文件
  → 系统反馈：输入 @ 后弹出文件列表 Picker
  → 状态变化：选中文件的内容作为 context 发送

成功结果：用户获得基于知识库的 AI 回答

异常分支：
- 异常 A：AI 响应超时 (>60s) → 显示「响应超时」+ 重试按钮
- 异常 B：网络断开 → 自动重连（指数退避 1s/2s/4s，最多 3 次）
- 异常 C：API Key 无效 → 显示「请在桌面端设置 AI Provider」
- 异常 D：SSE 流中断 → 保留已收到内容 + 显示「回答被中断」

边界场景：
- 超长对话 (>50 条消息) → 虚拟列表 + 自动滚动到底部
- 消息含代码块 → 语法高亮 + 横向可滚动
- 工具调用链很长 (>10 个工具) → 折叠显示，展开查看
- 用户快速连续发送 → 队列化，等上一条完成再发下一条
```

---

## UI 线框图

### 状态 1：空 Chat（新会话）

```
┌──────────────────────────────────┐
│  ← Chat           (Chat ▾)      │
├──────────────────────────────────┤
│                                  │
│                                  │
│                                  │
│          ◆                       │
│   Ask anything about             │
│   your knowledge base            │
│                                  │
│   Try:                           │
│   "Summarize my weekly notes"    │
│   "What did I write about X?"   │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│ ┌────────────────────────────┐ ↑ │
│ │ Ask MindOS...          @ ▶│   │
│ └────────────────────────────┘   │
│  Chat · Agent                    │
└──────────────────────────────────┘
```

### 状态 2：对话进行中

```
┌──────────────────────────────────┐
│  ← Chat                   ⋮     │
├──────────────────────────────────┤
│                                  │
│  ┌─ You ────────────────────┐    │
│  │ 帮我总结本周的会议记录    │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌─ MindOS ─────────────────┐    │
│  │ 🔧 search("会议记录")    │    │
│  │  └ Found 3 files          │    │
│  │ 🔧 read_file("meeting.md")│   │
│  │  └ Read 1.2 KB            │    │
│  │                           │    │
│  │ 根据本周的会议记录，主要   │    │
│  │ 讨论了以下议题：           │    │
│  │                           │    │
│  │ 1. **项目进度** — 移动端   │    │
│  │    开发已启动...           │    │
│  │ 2. **技术方案** — 确定使用 │    │
│  │    React Native...█       │    │
│  └──────────────────────────┘    │
│                                  │
├──────────────────────────────────┤
│ ┌────────────────────────────┐   │
│ │ Follow up...           @ ▶│   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

### 状态 3：@mention 文件选择

```
┌──────────────────────────────────┐
│  ← Chat                         │
├──────────────────────────────────┤
│  (对话消息区)                    │
│                                  │
│                                  │
├──────────────────────────────────┤
│  ┌──────────────────────────┐    │
│  │ 🔍 Search files...       │    │
│  ├──────────────────────────┤    │
│  │ 📝 meeting-notes.md      │    │
│  │ 📝 project-plan.md       │    │
│  │ 📝 weekly-review.md      │    │
│  │ 📊 budget.csv            │    │
│  └──────────────────────────┘    │
├──────────────────────────────────┤
│ ┌────────────────────────────┐   │
│ │ @meeting-notes.md 你觉得▶│   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

### 状态 4：会话列表

```
┌──────────────────────────────────┐
│  ← Sessions           [ + New ] │
├──────────────────────────────────┤
│                                  │
│  Today                           │
│  ┌──────────────────────────┐    │
│  │ 总结本周会议记录          │    │
│  │ 10:30 AM · 6 messages    │    │
│  ├──────────────────────────┤    │
│  │ React Native 技术调研     │    │
│  │ 9:15 AM · 12 messages    │    │
│  └──────────────────────────┘    │
│                                  │
│  Yesterday                       │
│  ┌──────────────────────────┐    │
│  │ OKR 回顾                 │    │
│  │ 4:20 PM · 4 messages     │    │
│  └──────────────────────────┘    │
│                                  │
├──────────────────────────────────┤
│  🏠  📁  💬 Chat  🔍  ⚙       │
└──────────────────────────────────┘
```

### 状态 5：错误 — 连接断开

```
┌──────────────────────────────────┐
│  ← Chat                         │
├──────────────────────────────────┤
│  (之前的对话消息)                │
│                                  │
│  ┌──────────────────────────┐    │
│  │ ⚠ Connection lost        │    │
│  │ Reconnecting... (2/3)    │    │
│  └──────────────────────────┘    │
│                                  │
├──────────────────────────────────┤
│ ┌────────────────────────────┐   │
│ │ (disabled) Waiting...     │   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

### 状态流转图

```
[新会话] ──输入发送──→ [Thinking] ──工具调用──→ [工具执行中]
    │                     │                        │
    │                     │                  ──完成──→ [流式响应]──完成──→ [对话中]
    │                     │                        │
    │                     └──超时──→ [超时错误]──重试──→ [Thinking]
    │
    ├──点击历史──→ [会话列表] ──选择──→ [历史会话]
    │
    └──@mention──→ [文件选择] ──选中──→ [输入框 + 附件]

[对话中] ──继续提问──→ [Thinking]
    │
    └──网络断开──→ [重连中] ──成功──→ [对话中]
                     │
                     └──失败──→ [离线提示]
```

---

## 技术方案

### SSE 流式消费

React Native 中 `fetch` 不原生支持 `ReadableStream`。方案：

```typescript
// mobile/lib/sse-client.ts
import EventSource from 'react-native-sse';

export function streamChat(
  baseUrl: string,
  params: { messages: Message[]; mode: AskMode; sessionId: string },
  callbacks: {
    onTextDelta: (text: string) => void;
    onToolCall: (toolCall: ToolCallPart) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }
) {
  const es = new EventSource(`${baseUrl}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  es.addEventListener('text_delta', (e) => {
    callbacks.onTextDelta(JSON.parse(e.data).text);
  });

  es.addEventListener('tool_call_start', (e) => {
    callbacks.onToolCall(JSON.parse(e.data));
  });

  es.addEventListener('done', () => {
    es.close();
    callbacks.onDone();
  });

  es.addEventListener('error', (e) => {
    es.close();
    callbacks.onError(new Error(e.message || 'SSE error'));
  });

  return () => es.close(); // cancel 函数
}
```

### Chat Hook（复用 shared 逻辑）

```typescript
// mobile/hooks/useChat.ts
import { useState, useCallback, useRef } from 'react';
import type { Message, AskMode } from '@mindos/shared/types';
import { streamChat } from '../lib/sse-client';
import { useConnectionStore } from '../stores/connection-store';

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const baseUrl = useConnectionStore((s) => s.serverUrl);

  const send = useCallback(async (text: string, mode: AskMode) => {
    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantText = '';
    const parts: MessagePart[] = [];

    cancelRef.current = streamChat(baseUrl, {
      messages: [...messages, userMsg],
      mode,
      sessionId,
    }, {
      onTextDelta: (delta) => {
        assistantText += delta;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            last.content = assistantText;
          } else {
            updated.push({ role: 'assistant', content: assistantText, parts, timestamp: Date.now() });
          }
          return [...updated];
        });
      },
      onToolCall: (tc) => {
        parts.push(tc);
        // 触发 UI 更新
      },
      onDone: () => setIsStreaming(false),
      onError: () => setIsStreaming(false),
    });
  }, [messages, baseUrl, sessionId]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, cancel };
}
```

### Markdown 渲染

```typescript
// 移动端消息渲染
import Markdown from 'react-native-markdown-display';

function AssistantMessage({ content }: { content: string }) {
  return (
    <Markdown
      style={markdownStyles}
      rules={{
        // 自定义 wikilink [[xxx]] 渲染
        link: (node) => <WikiLink href={node.attributes.href} />,
      }}
    >
      {content}
    </Markdown>
  );
}
```

### 关键依赖

| 包 | 用途 | 版本 |
|---|---|---|
| `react-native-sse` | SSE 流式通信 | ^1.2.0 |
| `react-native-markdown-display` | Markdown 渲染 | ^7.0.0 |
| `@mindos/shared` | 类型 + i18n + stores | workspace |

---

## 影响范围

### 新增文件

| 文件 | 说明 |
|------|------|
| `mobile/app/(tabs)/chat.tsx` | Chat tab 路由 |
| `mobile/app/chat/[sessionId].tsx` | 会话详情页 |
| `mobile/app/chat/sessions.tsx` | 会话列表 |
| `mobile/components/chat/` | ChatInput, MessageBubble, ToolCallCard 等 |
| `mobile/hooks/useChat.ts` | Chat 核心 hook |
| `mobile/lib/sse-client.ts` | SSE 客户端 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `app/app/api/ask/route.ts` | 确认 CORS 和 SSE content-type |
| `mobile/app/(tabs)/_layout.tsx` | 添加 Chat tab |

---

## 边界 case

| Case | 处理方式 |
|------|----------|
| Agent 模式工具调用 >30s | 显示经过时间计时器 + 取消按钮 |
| 消息含超长代码块 | 水平滚动 + 折叠（默认显示前 20 行） |
| 消息含表格 | 水平滚动容器 |
| 用户在 Agent 执行中退出 APP | 回来后显示已收到的部分 + 提示「被中断」 |
| 键盘弹出遮挡输入框 | KeyboardAvoidingView + 自动滚动到底部 |
| 图片消息（Phase 2 不支持）| 显示占位「Image — view on desktop」 |

---

## 风险

| 风险 | 严重性 | Mitigation |
|------|--------|------------|
| `react-native-sse` 不稳定 | 高 | 备选：自行封装基于 XMLHttpRequest 的 SSE |
| SSE 在移动网络下频繁断开 | 高 | 自动重连 + 消息幂等（sessionId + 消息序号） |
| Markdown 渲染性能差 | 中 | 虚拟列表 + 只渲染可见消息 |
| 键盘交互体验差 | 中 | 测试 iOS/Android 不同键盘行为 |

---

## 验收标准

- [ ] Chat tab 可正常打开
- [ ] 输入文本并发送，SSE 流式响应可实时显示
- [ ] 工具调用卡片正确折叠/展开
- [ ] Chat/Agent 模式切换生效
- [ ] @mention 可弹出文件列表并选中
- [ ] 会话历史列表可查看和切换
- [ ] 网络断开时显示重连提示
- [ ] 键盘弹出时输入框不被遮挡
- [ ] 超长消息列表滚动流畅（>50 条）
- [ ] 取消按钮可终止正在执行的请求
