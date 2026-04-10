# Spec: 飞书适配器

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/adapters/feishu.ts`

## 依赖

- **@larksuiteoapi/node-sdk**: MIT 协议，飞书/Lark 官方 SDK
- 安装方式：`npm install @larksuiteoapi/node-sdk`（列为 optionalDependencies）

## 接口实现

```typescript
import type { IMAdapter, IMMessage, IMSendResult, FeishuConfig } from '../types';

export class FeishuAdapter implements IMAdapter {
  readonly platform = 'feishu' as const;

  private client: InstanceType<typeof import('@larksuiteoapi/node-sdk').Client> | null = null;
  private config: FeishuConfig;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  async send(message: IMMessage, signal?: AbortSignal): Promise<IMSendResult> { ... }
  async verify(): Promise<boolean> { ... }
  async dispose(): Promise<void> { ... }
}
```

## send() 实现逻辑

```
1. 懒初始化 Client
   - const lark = await import('@larksuiteoapi/node-sdk');
   - this.client = new lark.Client({ appId, appSecret, appType: lark.AppType.SelfBuild });

2. 判断消息类型
   - format='text' → msg_type: 'text', content: JSON.stringify({ text })
   - format='markdown' → msg_type: 'interactive', content: 构造飞书 Card JSON
     飞书不直接支持 markdown 消息类型，需要用 Interactive Card 或 Post（富文本）
     策略：使用 Post（富文本），支持 bold/italic/link/code

3. 发送
   - client.im.message.create({
       receive_id_type: 'chat_id',  // 或 'open_id' / 'user_id' / 'email'
       params: { receive_id_type: 'chat_id' },
       data: {
         receive_id: message.recipientId,
         msg_type: msgType,
         content: contentJson,
       },
     });

4. 处理 thread_id
   - 飞书的 reply API: client.im.message.reply({ message_id: threadId, ... })

5. 超时保护
   - AbortSignal + 10s 超时
   - SDK 层面没有内置 signal 支持，需要 Promise.race + AbortController

6. 错误处理
   - API 返回 code !== 0 → 提取 msg 作为错误信息
   - 网络错误 → 通用网络错误提示
```

## Token 管理

飞书的 tenant_access_token 有 **2 小时有效期**。`@larksuiteoapi/node-sdk` 自动处理 token 刷新，无需手动管理。

## 消息格式映射

### Text → Feishu Text

```json
{
  "msg_type": "text",
  "content": "{\"text\": \"Hello World\"}"
}
```

### Markdown → Feishu Post（富文本）

飞书不支持直接的 Markdown 消息。使用 Post（富文本）作为替代：

```json
{
  "msg_type": "post",
  "content": "{\"zh_cn\": {\"title\": \"\", \"content\": [[{\"tag\": \"text\", \"text\": \"Hello \"}, {\"tag\": \"b\", \"text\": \"World\"}]]}}"
}
```

**转换策略**：在 `format.ts` 中提供 `markdownToFeishuPost(text)` 函数：
1. 解析标准 Markdown
2. 将 `**bold**` → `{tag: 'text', style: ['bold'], text: '...'}`
3. 将 `[link](url)` → `{tag: 'a', href: url, text: '...'}`
4. 将 `` `code` `` → `{tag: 'text', style: ['code'], text: '...'}`
5. 段落分隔 → 新的 content 数组元素

### 附件

```
image → client.im.message.create({ msg_type: 'image', content: { image_key } })
   需要先上传图片获取 image_key: client.im.image.create({ image_type: 'message', image: buffer })
file → client.im.message.create({ msg_type: 'file', content: { file_key } })
   需要先上传文件获取 file_key: client.im.file.create({ file_type, file_name, file: buffer })
```

## 平台特有常量

```typescript
const FEISHU_TEXT_LIMIT = 30000; // 飞书文本消息无硬性字符限制，但建议不超过 30k
const FEISHU_SEND_TIMEOUT_MS = 10_000;
const FEISHU_RETRY_COUNT = 3;
```

## receive_id_type 推断

飞书支持多种 ID 类型。适配器需要根据 recipientId 格式推断类型：

```
- oc_ 开头 → chat_id (群聊)
- ou_ 开头 → open_id (用户 open_id)
- on_ 开头 → union_id (联合 ID)
- 包含 @ → email
- 其他 → 默认 chat_id
```

## 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| API code 99991668 | 返回 `"Token invalid, check app_id/app_secret"` |
| API code 99991403 | 返回 `"Monthly API quota exhausted"` |
| API code 99991400 | 返回 `"Request parameter error: {msg}"` |
| API code 230001 | 返回 `"Bot not in the chat, add bot to group first"` |
| 网络超时 | 重试 3 次（指数退避） |
| AbortError | 返回 `"Send cancelled"` |

## 测试计划

| 测试用例 | 类型 | 说明 |
|---------|------|------|
| 发送纯文本成功 | 正常 | mock client.im.message.create 返回成功 |
| 发送 markdown → post 格式 | 正常 | 验证 Post 富文本结构正确 |
| app_id/secret 无效 | 错误 | verify() 返回 false |
| Bot 不在群内 | 错误 | 验证错误信息人类可读 |
| receive_id_type 自动推断 | 边界 | oc_ → chat_id, ou_ → open_id |
| 月度 API 配额耗尽 | 错误 | 验证 99991403 错误提示 |
| @larksuiteoapi/node-sdk 未安装 | 边界 | 动态 import 失败返回清晰错误 |
