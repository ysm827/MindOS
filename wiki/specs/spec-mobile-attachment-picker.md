# Spec: Mobile Chat Attachment Picker

## 目标
让用户在移动端 Chat 中选择知识库文件作为上下文附件发送给 AI，补齐移动端与桌面端在核心对话能力上的缺口。

## 现状分析
当前移动端 `useChat` 已支持 `attachedFilePaths`，`Message` 类型也已支持 `attachedFiles`，但 `ChatInput` 没有任何附件入口或选择 UI。结果是用户虽然能在移动端聊天，却无法把知识库中的文件带进对话上下文，Agent/Chat 实际能力残缺。

## 数据流 / 状态流
用户点击 ChatInput 左侧附件按钮
→ `chat.tsx` 打开 `FileAttachmentPicker`
→ `FileAttachmentPicker` 调用 `mindosClient.getFileTree()` 获取文件树
→ 本地扁平化为 `FileNode[]`（仅 file）
→ 用户勾选文件，更新 `selectedAttachments`
→ 关闭 picker 后，`ChatInput` 渲染附件 chips
→ 用户点击发送
→ `chat.tsx.handleSend(message, selectedAttachments)`
→ `useChat.send(message, attachedFilePaths)`
→ SSE 请求带上 `attachedFiles`
→ 成功后清空当前附件选择；失败时保留错误提示与消息重试能力

## 方案
采用“知识库文件选择面板”方案，而不是系统文件选择器或 `@filename` 手输方案。

原因：
- 完全符合 MindOS 产品模型（附件来自知识库，而不是系统任意文件）
- 不引入上传和权限链路
- 发现性与移动端可用性远好于手动输入

### User Flow

用户目标：在移动端 Chat 中选择知识库文件作为上下文附件发送给 AI。

前置条件：用户已连接到 MindOS 服务，并进入 Chat 页。

Step 1: 用户点击输入框左侧附件按钮
  → 系统反馈：弹出“Attach files”面板，展示 loading 状态
  → 状态变化：开始加载文件树

Step 2: 用户看到文件列表
  → 系统反馈：显示可选择的文件项、已选状态、Done/Cancel 操作
  → 状态变化：本地维护 `selectedAttachments`

Step 3: 用户勾选一个或多个文件
  → 系统反馈：文件项显示选中状态；关闭面板后输入框上方显示附件 chips
  → 状态变化：`selectedAttachments` 更新

Step 4: 用户输入消息并点击发送
  → 系统反馈：用户消息立即出现，消息内带上附件路径；AI 开始流式响应
  → 状态变化：`useChat.send(message, attachedFilePaths)` 被调用

Step 5: 发送成功
  → 系统反馈：附件 chips 消失，输入框恢复可继续输入
  → 状态变化：当前附件选择清空

成功结果：AI 收到消息以及附件路径，并将其作为上下文处理。

异常分支：
- 异常 A：文件树加载失败 → 面板显示错误文案 + Retry 按钮
- 异常 B：知识库为空 → 显示空状态“No files available to attach”
- 异常 C：发送时网络断开 → Chat 现有错误框 + Retry 生效；不丢失消息历史

边界 case 与风险：
1. 选择 0 个文件：Done disabled 或返回时不显示 chip
2. 超长路径 / Unicode：列表副标题截断显示，完整 path 仍作为值发送
3. 大文件树：先扁平化 + FlatList，不引入目录树递归交互

## 影响范围
- 变更文件列表
  - `mobile/components/ChatInput.tsx`
  - `mobile/app/(tabs)/chat.tsx`
  - `mobile/lib/types.ts`（若需补充 UI 类型）
  - `mobile/lib/api-client.ts`（复用现有 `getFileTree`，不新增 API）
  - `mobile/components/FileAttachmentPicker.tsx`（新增）
- 受影响的其他模块
  - `useChat` 已兼容附件路径，无需修改协议
  - `MessageBubble` 已支持显示 `attachedFiles` 字段的潜在扩展
- 是否有破坏性变更
  - 无

## 验收标准
- [ ] ChatInput 出现明确的附件入口按钮
- [ ] 点击附件入口后出现附件选择面板
- [ ] 面板能正确展示知识库中的文件列表（仅文件，不展示目录交互）
- [ ] 用户可以选择一个或多个附件
- [ ] 已选附件在输入框上方显示为 chips，并支持单个移除
- [ ] 点击发送时，`useChat.send` 收到 `attachedFilePaths`
- [ ] 发送成功后，当前附件 chips 清空
- [ ] 文件树加载失败时有明确错误态和 Retry
- [ ] 文件树为空时有明确空状态
- [ ] New Chat 会清空当前待发送附件
