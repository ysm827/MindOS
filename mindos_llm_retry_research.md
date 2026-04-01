# MindOS Agent LLM API 调用重试/重连机制 - 全面调研报告

## 执行摘要

**核心发现：** MindOS 具有基础的 LLM API 重试机制（仅限 **MindOS Agent**），但存在以下关键问题：

1. **重试工具函数已实现但被闲置** - `retry.ts` / `reconnect.ts` 中的工具函数定义完整但 **仅在 MindOS Agent 中使用**
2. **ACP Agent 路由无重试保护** - 使用 ACP 代理时，完全依赖 ACP 代理自身的重试机制
3. **流式传输中断无恢复机制** - 一旦 SSE 流中断，无法恢复或重新连接
4. **超时配置离散化** - 不同组件有不同的硬编码超时值，无统一管理
5. **Rate Limit 处理不完全** - 能识别 429 错误但无指数退避补偿

---

## 一、关键文件路径

### 1.1 核心重试机制

```
/app/lib/agent/retry.ts
├─ isTransientError()        # 转瞬性错误检测
├─ 识别规则：timeout / 429 / 5xx / 连接错误
└─ 注：仅在 route.ts 中被导入，未在 ACP 路径使用

/app/lib/agent/reconnect.ts
├─ isRetryableError()        # 可重试错误判断（流式）
├─ retryDelay()             # 指数退避计算: 1s→2s→4s→...→10s
├─ sleep()                  # 支持 AbortSignal 的延迟
└─ 注：仅定义但从未被调用

/app/lib/api.ts
├─ apiFetch<T>()            # 通用 fetch 包装器
├─ timeout: 30秒（硬编码）
├─ 支持 AbortController 超时 + 外部 AbortSignal
└─ 错误处理：非2xx 状态 → 抛出 ApiError
```

### 1.2 LLM API 调用入口

```
/app/app/api/ask/route.ts (POST /api/ask)
├─ 行 748：session.prompt() 调用
├─ 行 743-762：重试循环（仅 MindOS Agent）
│  ├─ MAX_RETRIES = 3
│  ├─ 指数退避：1s, 2s (由第 758 行的 2^(attempt-1) 生成)
│  ├─ 仅在"尚未流出内容"时重试
│  └─ 检查 isTransientError() 决定是否重试
└─ 行 664：ACP 路由（promptStream）→ 无重试循环

/app/lib/acp/session.ts
├─ promptStream()           # ACP 流式提示调用
│  ├─ 无内置重试逻辑
│  ├─ 依赖 onMessage() 接收 agent 响应
│  └─ 进程退出时有保护：行 425-430 exit 监听器
└─ 行 443：sendMessage(proc, 'session/prompt', ...)

/app/lib/acp/subprocess.ts
├─ sendAndWait()            # JSON-RPC 请求/应答
│  ├─ timeoutMs = 30_000 （硬编码）
│  ├─ 超时后 reject（无重试）
│  └─ 用于 initialize / authenticate / session/new
├─ onMessage()              # 消息流处理
│  ├─ 行 78-110：newline-delimited JSON 解析
│  └─ 支持多个监听器注册
└─ sendMessage()            # 单向发送
```

### 1.3 流式传输处理

```
/app/lib/agent/stream-consumer.ts
├─ consumeUIMessageStream()
│  ├─ 行 102：检查 signal.aborted
│  ├─ 行 103：reader.read() 循环
│  ├─ 行 183-192：'error' 事件处理 → 追加到文本
│  ├─ 行 217-225：流中断恢复
│  │  └─ 将未完成的工具调用标记为 'error'
│  └─ 注：只能处理已接收的事件，无法恢复中断的连接
└─ 支持外部 AbortSignal
```

---

## 二、当前实现的核心代码片段

### 2.1 MindOS Agent 重试机制（ask/route.ts 第 743-762 行）

```typescript
const MAX_RETRIES = 3;
let lastPromptError: Error | null = null;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    // 调用 pi-ai session
    await session.prompt(lastUserContent, lastUserImages ? { images: lastUserImages } : undefined);
    lastPromptError = null;
    break; // success
  } catch (err) {
    lastPromptError = err instanceof Error ? err : new Error(String(err));

    // 只在"尚未流出内容"且"可重试错误"且"有重试次数"时重试
    const canRetry = !hasContent && attempt < MAX_RETRIES && isTransientError(lastPromptError);
    if (!canRetry) break;

    // 指数退避：1000ms * 2^(attempt-1) = 1s, 2s (仅 2 次)
    const delayMs = 1000 * Math.pow(2, attempt - 1);
    send({ type: 'status', message: `Request failed, retrying (${attempt}/${MAX_RETRIES})...` });
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

if (lastPromptError) throw lastPromptError;
```

**关键点：**
- 重试条件：`!hasContent && attempt < MAX_RETRIES && isTransientError(err)`
- 限制：一旦开始流式传输（任何文本、工具调用等），**停止重试**
- 指数退避：仅手动计算 2 次（attempt=1: 1s, attempt=2: 2s, attempt=3 时 canRetry=false）
- 无回退以 10s 为上限的逻辑

### 2.2 转瞬性错误检测（retry.ts）

```typescript
export function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  
  // Timeout patterns
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) 
    return true;
  
  // Rate limiting
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) 
    return true;
  
  // Server errors (5xx)
  if (/\b5\d{2}\b/.test(msg) || msg.includes('internal server error') || msg.includes('service unavailable')) 
    return true;
  
  // Connection errors
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('socket hang up')) 
    return true;
  
  // Overloaded
  if (msg.includes('overloaded') || msg.includes('capacity')) 
    return true;
  
  return false;
}
```

**问题：**
- 仅基于错误消息文本匹配，可能误判
- 无 HTTP 状态码传入（依赖 Error.message 包含状态码字符串）
- 缺少 DNS 故障、SSL 错误、连接被重置等边界情况

### 2.3 指数退避工具（reconnect.ts，未被使用）

```typescript
const BASE_DELAY = 1000;      // 1 秒
const MAX_DELAY = 10_000;     // 10 秒

export function retryDelay(attempt: number): number {
  return Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
  // attempt=0: 1s
  // attempt=1: 2s
  // attempt=2: 4s
  // attempt=3: 8s
  // attempt=4+: 10s (capped)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortReason = () => signal?.reason ?? new DOMException('...', 'AbortError');
    if (signal?.aborted) { reject(abortReason()); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortReason());
    }, { once: true });
  });
}
```

**现状：**
- 设计完整，支持 AbortSignal（可被外部中止）
- **从未被调用** - isTransientError 被调用，但 retryDelay 和 sleep 无处引用
- 计算正确但 ask/route.ts 使用了内联的 `Math.pow(2, attempt-1)` 而非此函数

### 2.4 ACP 流式提示（session.ts 第 361-455 行）

```typescript
export async function promptStream(
  sessionId: string,
  text: string,
  onUpdate: (update: AcpSessionUpdate) => void,
): Promise<AcpPromptResponse> {
  const { session, proc } = getSessionAndProc(sessionId);

  if (session.state === 'active') {
    throw new Error(`Session ${sessionId} is busy`);
  }

  updateSessionState(session, 'active');

  return new Promise((resolve, reject) => {
    let aggregatedText = '';
    let stopReason: AcpStopReason = 'end_turn';

    // 消息处理（no retry loop here）
    const unsub = onMessage(proc, (msg) => {
      if (msg.result && typeof msg.result === 'object') {
        const raw = msg.result as Record<string, unknown>;
        const update = parseSessionUpdate(sessionId, raw);
        onUpdate(update);

        if (update.type === 'done') {
          unsub();
          updateSessionState(session, 'idle');
          resolve({ sessionId, text: aggregatedText, done: true, stopReason });
        }

        if (update.type === 'error') {
          unsub();
          updateSessionState(session, 'error');
          reject(new Error(update.error ?? 'Unknown ACP error'));
        }
      }
    });

    // 进程意外退出保护
    const onExit = () => {
      unsub();
      updateSessionState(session, 'error');
      reject(new Error(`ACP agent process exited unexpectedly during prompt`));
    };
    proc.proc.once('exit', onExit);

    // 发送提示（无重试）
    try {
      sendMessage(proc, 'session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text }],
        stream: true,
      });
    } catch (err) {
      unsub();
      updateSessionState(session, 'error');
      reject(err);
    }
  });
}
```

**关键缺陷：**
- 无重试循环（ask/route.ts 第 664 行调用 promptStream 时，没有围绕它的 try-catch-retry）
- 进程退出时有保护，但网络中断/消息丢失无保护
- 如果 'done' 或 'error' 事件永不到达，Promise 将永远挂起

### 2.5 通用 API Fetch 包装器（api.ts）

```typescript
export async function apiFetch<T>(url: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { timeout = 30_000, signal: externalSignal, ...fetchOpts } = opts;

  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeExternalAbortListener: (() => void) | undefined;

  if (timeout > 0 || externalSignal) {
    controller = new AbortController();
  }

  if (timeout > 0 && controller) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  // 合并外部 AbortSignal
  if (externalSignal && controller) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller?.abort();
      externalSignal.addEventListener('abort', onAbort, { once: true });
      removeExternalAbortListener = () => {
        externalSignal.removeEventListener('abort', onAbort);
      };
    }
  }

  const signal = controller?.signal ?? externalSignal;

  try {
    const res = await fetch(url, { ...fetchOpts, signal });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      let code: string | undefined;
      try {
        const body = await res.json();
        if (body?.error?.code && body?.error?.message) {
          msg = body.error.message;
          code = body.error.code;
        } else if (body?.error) {
          msg = typeof body.error === 'string' ? body.error : body.error.message ?? msg;
        }
      } catch { /* non-JSON error body */ }
      throw new ApiError(msg, res.status, code);
    }

    return (await res.json()) as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (removeExternalAbortListener) removeExternalAbortListener();
  }
}
```

**特点：**
- 支持合并多个 AbortSignal（内部超时 + 外部中止）
- 默认 30 秒超时（硬编码）
- 无内置重试，仅超时和错误抛出

---

## 三、超时配置速查表

| 组件 | 位置 | 默认值 | 备注 |
|------|------|--------|------|
| apiFetch() | lib/api.ts:28 | 30s | 所有通用 API 调用 |
| session.prompt() | ask/route.ts:748 | 由 pi-ai 决定 | MindOS Agent LLM 调用 |
| sendAndWait() | lib/acp/subprocess.ts:176 | 30s | ACP RPC 初始化/认证 |
| registry fetch | lib/acp/registry.ts:14 | 10s | ACP 注册表下载 |
| retry delay | ask/route.ts:758 | 1s, 2s | 仅 2 次（attempt<3） |
| stream consumer | lib/agent/stream-consumer.ts | 无超时 | 依赖外部 AbortSignal |

---

## 四、现有问题与缺失点

### 4.1 🔴 关键缺陷

#### 问题 1：ACP 路由无重试保护
- **现象**：使用 ACP 代理时，任何网络错误/超时导致立即失败
- **代码**：ask/route.ts:664 调用 `promptStream()` 无 try-catch-retry
- **影响**：ACP 流式传输不稳定（特别是弱网环境）

```typescript
// 当前（无重试）
await promptStream(acpSessionId, lastUserContent, (update) => { ... });

// 应该（有重试）
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    await promptStream(...);
    break;
  } catch (err) {
    if (isTransientError(err) && attempt < MAX_RETRIES) {
      await sleep(retryDelay(attempt - 1));
      continue;
    }
    throw;
  }
}
```

#### 问题 2：流中断后无恢复机制
- **现象**：SSE 流中途中断 (网络波动、客户端断开、服务器重启) → 用户看到"Stream ended before tool completed"
- **代码**：stream-consumer.ts:216-228 只能标记工具为 error，无重连
- **影响**：长时间运行的 agent 任务容易失败

#### 问题 3：指数退避工具未被使用
- **代码**：reconnect.ts 定义了完整的 `retryDelay()` 和 `sleep()`
- **现状**：ask/route.ts 第 758 行使用硬编码 `Math.pow(2, attempt-1)` 而非 `retryDelay()`
- **问题**：
  - attempt=1: 1s ✓
  - attempt=2: 2s ✓
  - attempt=3 时 canRetry=false（无 attempt=3）
  - **实际上最多只重试 2 次，没有达到最大 3 次** (retry.ts 设计为可以多次)

#### 问题 4：Rate Limit 识别不完整
- **代码**：retry.ts 检查 `msg.includes('429')`
- **问题**：
  - 依赖错误消息文本，易误判
  - 无 HTTP 状态码直接检查
  - 无 Retry-After 头处理

#### 问题 5：转瞬性错误检测仅基于消息文本
- **代码**：retry.ts 全部依赖 `err.message.toLowerCase()`
- **风险**：
  - HTTP 5xx 可能被格式化为 "Error 500" 或 "HTTP/1.1 500" → 可能漏判
  - DNS 错误 / SSL 错误 / 连接被重置 可能有多种字符串格式

### 4.2 🟡 设计缺陷

#### 问题 6：流出内容后停止重试（by design）
- **代码**：ask/route.ts:755 `!hasContent` 条件
- **意义**：避免客户端收到重复内容
- **问题**：
  - 如果 LLM 响应了 100 字符后超时，无法重试整个请求
  - 可能导致不完整的回复但用户认为任务完成
  - 无"增量重试"或"流式续传"机制

#### 问题 7：超时参数离散化，无统一配置
- **现状**：
  - apiFetch: 30s
  - sendAndWait: 30s (RPC)
  - registry: 10s
  - session.prompt: 由 pi-ai 决定（通常 60-300s）
- **缺失**：
  - 无统一的超时配置类
  - 无环境变量或配置文件控制
  - 无动态调整机制（如弱网自适应）

#### 问题 8：SSE 流消费无心跳/ping
- **代码**：stream-consumer.ts
- **风险**：
  - 如果 SSE 源长时间无数据但未关闭连接，难以检测僵尸连接
  - TCP keep-alive 间隔通常 > 2 分钟，易导致连接被中间件切断

### 4.3 ⚪ 缺失功能

| 功能 | 状态 | 影响 |
|------|------|------|
| **断点续传** | ❌ | 无法恢复流中断，必须从头重试 |
| **连接池** | ❌ | 每个请求建立新连接 |
| **请求去重** | ❌ | 重试可能导致重复的 tool 执行 |
| **速率限制客户端管理** | ❌ | 无主动 429 处理，依赖被动重试 |
| **可观测性** | 🟡 | 有基础 metrics，无详细重试日志 |
| **动态超时调整** | ❌ | 固定超时值，无基于网络状态的调整 |

---

## 五、关键调用链路图

### MindOS Agent 路径（有重试）

```
POST /api/ask
  ├─ 读取 settings (model config, maxSteps, etc)
  ├─ build systemPrompt + messages
  ├─ createAgentSession()
  │  └─ pi-ai session 初始化 (包含 LLM config)
  │
  ├─ session.subscribe() (绑定事件监听)
  │
  ├─ SSE ReadableStream.start()
  │  └─ runAgent() async {
  │       ├─ for attempt = 1 to MAX_RETRIES {
  │       │    try {
  │       │      await session.prompt(messages)  ← LLM API 调用
  │       │         (pi-ai 内部: 调用 Anthropic/OpenAI)
  │       │      break
  │       │    } catch(err) {
  │       │      if (!hasContent && attempt < 3 && isTransientError(err)) {
  │       │        await sleep(1000 * 2^(attempt-1))
  │       │        continue retry
  │       │      }
  │       │      throw
  │       │    }
  │       │  }
  │       │
  │       └─ send({type: 'done'})
  │  }
  │
  └─ return Response (SSE stream)
     └─ client: consumeUIMessageStream() processes events
```

### ACP Agent 路径（无重试）

```
POST /api/ask (with selectedAcpAgent)
  ├─ read settings
  ├─ build systemPrompt + messages
  │
  ├─ SSE ReadableStream.start()
  │  └─ runAgent() async {
  │       ├─ createSession(agentId)  ← spawn subprocess
  │       │  ├─ sendAndWait('initialize', ..., 30s)
  │       │  ├─ sendAndWait('authenticate', ..., 15s)
  │       │  └─ sendAndWait('session/new', ..., 15s)
  │       │
  │       ├─ promptStream(sessionId, prompt, onUpdate) ← ⚠️ NO RETRY
  │       │  └─ onMessage() + sendMessage('session/prompt')
  │       │     └─ receive streamed updates (no retry loop!)
  │       │
  │       └─ closeSession(sessionId)
  │  }
  │
  └─ return Response (SSE stream)
     └─ client: consumeUIMessageStream() processes events
```

---

## 六、类型定义摘要

### 6.1 Error 类型

```typescript
// api.ts
class ApiError extends Error {
  status: number;
  code?: string;
}

// types (inferred from code)
type TransientError = 
  | TimeoutError
  | RateLimitError (429)
  | ServerError (5xx)
  | ConnectionError (ECONNRESET, ECONNREFUSED, socket hang up)
  | OverloadedError;
```

### 6.2 Session 状态

```typescript
// acp/session.ts
type AcpSessionState = 'idle' | 'active' | 'error';

// ask/route.ts (implicit)
type AgentStreamState = {
  hasContent: boolean;
  lastPromptError: Error | null;
  stepCount: number;
  loopCooldown: number;
};
```

---

## 七、性能影响分析

### 7.1 重试成本

| 场景 | 次数 | 总延迟 | 最坏情况 |
|------|------|--------|---------|
| 全部重试成功 | 3 | 1s + 2s + actual = 3s+ | 3 + 60 = 63s |
| 第 1 次重试成功 | 1 | 0s | 30s timeout |
| 第 3 次失败 | 3 | 1s + 2s = 3s | 3 + 90 = 93s |

### 7.2 现有限制

- **MindOS**: 最多 3 次 LLM 调用（每次可能 30-60s timeout）
- **ACP**: 取决于 ACP 代理自身（无应用层重试）
- **SSE 流**: 一旦 streaming 开始，无重试保护

---

## 八、改进建议（优先级）

### P0 - 关键

1. **为 ACP 路由添加重试循环**
   ```typescript
   for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
     try {
       await promptStream(...);
       break;
     } catch (err) {
       if (attempt < MAX_RETRIES && isTransientError(err)) {
         await sleep(retryDelay(attempt - 1));
       } else {
         throw;
       }
     }
   }
   ```

2. **修复重试次数计数**
   - 当前：attempt=1,2 时执行；attempt=3 时不重试（只 2 次）
   - 应该：attempt=1,2,3 都执行（真正 3 次）

3. **改进 isTransientError 的 HTTP 状态码支持**
   ```typescript
   export function isTransientError(err: Error, httpStatus?: number): boolean {
     if (httpStatus) {
       return [408, 429, 500, 502, 503, 504].includes(httpStatus);
     }
     // 保留文本匹配作为 fallback
     ...
   }
   ```

### P1 - 重要

4. **使用 reconnect.ts 中的 retryDelay() 和 sleep() 工具**
   - 替换 ask/route.ts 中的硬编码指数退避
   - 保持代码 DRY 原则

5. **为流式传输添加心跳/ping**
   - 在 SSE 中定期发送 keep-alive 事件
   - 检测僵尸连接

6. **统一超时配置**
   ```typescript
   const CONFIG = {
     API_TIMEOUT_MS: 30_000,
     LLM_TIMEOUT_MS: 60_000,
     RPC_TIMEOUT_MS: 30_000,
     REGISTRY_TIMEOUT_MS: 10_000,
   };
   ```

### P2 - 可选

7. **请求去重防护** - 追踪已发送的 tool 调用 ID
8. **流式续传** - 支持从中断点恢复（需要 LLM API 支持）
9. **弱网自适应** - 基于历史 RTT 动态调整超时
10. **可观测性增强** - 详细的重试日志和指标

---

## 九、测试覆盖现状

### 已有

- MindOS Agent 的 isTransientError() 逻辑（部分）
- ACP 进程退出检测

### 缺失

- ❌ ACP 网络中断恢复
- ❌ 并发 prompt 调用时的状态管理
- ❌ 重试指数退避的准确性
- ❌ 429 Retry-After 头的处理
- ❌ 流中断中的部分工具调用处理

---

## 十、参考文件清单

```
深度调研相关文件（按调用顺序）：
1. /app/app/api/ask/route.ts              (主入口，MindOS 重试逻辑)
2. /app/lib/agent/retry.ts                (错误判断工具)
3. /app/lib/agent/reconnect.ts            (未使用的重试工具)
4. /app/lib/acp/session.ts                (ACP 流式调用，无重试)
5. /app/lib/acp/subprocess.ts             (ACP RPC 超时)
6. /app/lib/agent/stream-consumer.ts      (SSE 消费，流中断处理)
7. /app/lib/api.ts                        (通用 fetch 包装)
8. /app/lib/acp/registry.ts               (注册表 fetch 超时)

配置相关：
9. /app/lib/agent/model.ts                (LLM 模型配置，无超时覆盖)
10. /app/lib/settings.ts                  (全局设置，无重试参数)
```

---

## 总结

MindOS 目前在 **MindOS Agent 路径** 上有基础的重试保护（虽然有缺陷），但在 **ACP Agent 路径** 上完全缺失应用层重试。建议优先实现 P0 级别的改进，特别是为 ACP 路由添加重试保护，以提升整体稳定性。
