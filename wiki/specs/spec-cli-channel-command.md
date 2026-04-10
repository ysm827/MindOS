# Spec: `mindos channel` CLI Command

**Author**: AI Assistant  
**Date**: 2026-04-10  
**Phase**: Implementation Complete  
**Status**: Hardening in progress — `/api/channels/verify`, `--skip-verify`, `--env`, alternative credential sets, and cross-platform regression coverage are implemented.  

**Implementation Status**:
- ✅ Phase 0: Environment & Research complete
- ✅ Phase 1-2: User Flow & Design spec complete
- ✅ Phase 3: TDD test suite created (425 test stubs)
- ✅ Phase 4: Implementation complete (bin-native pattern, no TS imports)
- ✅ Phase 5: Adversarial review complete (12 issues identified)
- ⏳ Phase 6: User walkthrough (manual scenarios)
- ⏳ Phase 8-9: Final commit & summary  

---

## 1. 原始需求 & 设计目标

### 需求描述
用户已实现了 IM 集成（8 个平台：Telegram, Discord, Feishu, Slack, WeChat Enterprise, DingTalk, WeChat Official, QQ），存储在 `~/.mindos/im.json`。目前用户需要手动编辑该文件来配置频道（Channel）。

**目标**：创建 `mindos channel` CLI 命令，让用户能够通过命令行管理 IM 频道配置，**模仿 OpenClaw 的设计风格**。

### OpenClaw 参考
OpenClaw 使用：
- **verb-noun snake_case** 命名：`send_im_message`, `list_im_channels`, `web_search`
- **分层工具架构**：8 个核心工具 + 17+ 高级工具，分层暴露给 Agent
- **Platform abstraction**：统一 `message` 工具屏蔽平台差异
- **Separate credentials**：平台凭证分离存储，独立验证
- **Lazy loading**：未配置的平台不加载 SDK

### MindOS 现状
- ✅ IM 架构完整（`app/lib/im/`）
- ✅ 8 个平台 Adapter + SDK
- ✅ Config 在 `~/.mindos/im.json`
- ✅ Agent 工具已暴露（`send_im_message`, `list_im_channels`）
- ❌ **CLI 命令缺失**

---

## 2. 用户目标 & 前置条件

### 用户目标
用户想要通过 CLI 命令**快速配置、验证、管理** IM 平台凭证，而不必手动编辑 JSON 文件。

### 前置条件
- MindOS 已安装
- `~/.mindos/` 目录存在
- 用户已创建平台机器人账号（e.g., Telegram Bot Token, Discord Bot Token）

---

## 3. 命令架构 & 子命令设计

### 核心原则（OpenClaw-inspired）

1. **Verb-Noun Pattern**
   - 动词优先：`channel add`, `channel list`, `channel remove`, `channel verify`
   - 符合 OpenClaw 的 snake_case：`send_im_message`, `list_im_channels`

2. **Progressive Disclosure**
   - `mindos channel` (no args) → 显示帮助
   - `mindos channel list` → 展示已配置的平台
   - `mindos channel add telegram` → 交互式配置（逐步提示）
   - `mindos channel verify discord` → 验证凭证有效性

3. **Credential Security**
   - 敏感信息永不打印完整值（仅显示前 6 字符 + `****`）
   - 密钥存储使用 0o600 权限（Unix）
   - 交互输入使用隐藏输入（password mode）

4. **Platform-Aware Feedback**
   - 清晰提示用户需要填写哪些字段（e.g., Telegram 需要 `bot_token`；Feishu 需要 `app_id` + `app_secret`）
   - 验证失败时给出具体原因（e.g., "Bot token format invalid" vs "Bot not responding"）

---

## 4. 完整 User Flow

### User Flow 1: 查看已配置的平台

**用户目标**：了解当前有哪些 IM 平台已配置

**前置条件**：至少有一个平台配置过

**操作流程**：

```
Step 1: 用户执行 `mindos channel list`
  → 系统反馈：展示配置的所有平台及状态
  → 状态变化：读取 ~/.mindos/im.json，解析 providers

Step 2: 系统展示每个平台的：
  - 平台名称 (platform)
  - 配置状态 (✔️ 已配置 / ✘ 配置不完整)
  - Bot/应用名 (如果验证成功过)
  - 最后验证时间

成功结果：用户看到清晰的平台列表，知道当前配置状态

示例输出：
  Telegram      ✔ configured   (bot: MyBot)
  Discord       ✔ configured   (bot: MindOS)
  Feishu        ✘ incomplete   (missing: app_secret)
  Slack         ○ not configured
  WeChat Ent.   ○ not configured
  ...
```

**异常分支**：
- 异常 A：未配置任何平台 → 系统提示 "No platforms configured. Run `mindos channel add` to get started."
- 异常 B：im.json 文件损坏 → 系统提示 "Failed to parse im.json. Please check the file." + 显示文件路径
- 异常 C：权限不足（无法读 im.json）→ 系统提示 "Permission denied: cannot read ~/.mindos/im.json"

**边界场景**：
- 所有字段都为空的"幽灵配置" → 列表中标注为 ✘ incomplete
- 平台名称拼写错误 → 系统忽略，仅显示已识别的平台
- `providers` 字段不存在或为 null → 系统提示 "im.json is corrupt"

---

### User Flow 2: 添加新平台（交互式配置）

**用户目标**：为某个 IM 平台添加凭证

**前置条件**：
- 用户已创建机器人（e.g., 在 Telegram BotFather 创建了 Bot）
- 用户知道对应的凭证（token / app_id + app_secret）

**操作流程**：

```
Step 1: 用户执行 `mindos channel add telegram`
  → 系统反馈：显示 "Configuring Telegram platform..."
  → 状态变化：检测 Telegram 是否已配置过

Step 2: 如果已配置，系统确认 "Platform already configured. Replace? (y/n)"
  → 用户输入 y/n
  → 若 n，系统中止并提示 "Aborted."
  → 若 y，继续

Step 3: 系统提示凭据输入。
  - 单一凭据模式（如 Telegram）：直接提示 `Enter Telegram bot token (hidden):`
  - 多模式平台（如 WeCom / DingTalk）：先提示选择 credential mode，再进入对应字段输入
  → 用户输入（敏感字段隐藏回显）
  → 系统反馈：正在验证...（进度指示）

Step 4: 系统验证 Token 有效性（调用 Telegram API）
  → 成功：系统反馈 "✔ Token verified. Bot name: MyBot" + 显示 Bot Avatar/ID
  → 失败：系统反馈 "✗ Token invalid: Invalid bot token format" + 允许重试 (retry/abort)

Step 5: 如果重试，回到 Step 3；如果 abort，中止操作
  → 未保存任何配置，恢复到原始状态

Step 6: 验证通过后，系统提示 "Saving configuration..."
  → 系统反馈：✔ Saved to ~/.mindos/im.json
  → 状态变化：写入 provider 凭证到 im.json，设置 0o600 权限

成功结果：用户看到确认信息，Telegram 平台已配置
```

**异常分支**：
- 异常 A：用户按 Ctrl+C 中止输入 → 系统提示 "Aborted by user. No changes saved." + 恢复原始状态
- 异常 B：im.json 写入失败（权限或磁盘满）→ 系统提示 "Failed to write im.json: Permission denied" + 提示检查磁盘空间
- 异常 C：验证超时（网络不稳定）→ 系统提示 "Verification timeout (10s). Check your network connection. Retry? (y/n)"
- 异常 D：平台名称不认可 → 系统提示 "Unknown platform: xxx. Supported: telegram, discord, feishu, ..." + 列出所有支持的平台

**边界场景**：
- 输入空 token → 系统提示 "Token cannot be empty"
- Token 格式看似对但 API 验证失败 → 显示 API 返回的具体错误（e.g., "Bot was deleted or revoked"）
- 用户连续添加多个平台 → 每个平台独立处理，不影响已配置的其他平台
- im.json 中已有该平台但配置不完整 → 允许用户编辑/覆盖

---

### User Flow 3: 删除平台配置

**用户目标**：移除某个 IM 平台的配置（销毁凭证）

**前置条件**：该平台已配置过

**操作流程**：

```
Step 1: 用户执行 `mindos channel remove telegram`
  → 系统反馈：显示该平台的当前配置（仅显示 bot_token 前 6 字符）
  → 状态变化：检索当前配置

Step 2: 系统确认 "Remove Telegram platform configuration? This cannot be undone. (y/n)"
  → 用户输入 y/n
  → 若 n，系统中止并提示 "Aborted."
  → 若 y，继续

Step 3: 系统删除该 provider 从 im.json
  → 系统反馈：✔ Removed Telegram configuration
  → 状态变化：写入修改后的 im.json

成功结果：用户确认了删除，Telegram 配置已从 im.json 移除
```

**异常分支**：
- 异常 A：平台不存在 → 系统提示 "Platform not configured: telegram"
- 异常 B：im.json 写入失败 → 系统提示 "Failed to write im.json: Permission denied"
- 异常 C：im.json 被外部进程修改（竞态）→ 系统提示 "im.json was modified elsewhere. Retry? (y/n)"

**边界场景**：
- 删除后 providers 为空 → im.json 保留但 providers: {} 为空
- 用户确认删除后立即 Ctrl+C（在写入过程中）→ 操作可能部分完成，下次 list 显示不一致

---

### User Flow 4: 验证平台凭证

**用户目标**：测试某个平台的配置是否有效（credentials 是否仍然工作）

**前置条件**：该平台已配置过

**操作流程**：

```
Step 1: 用户执行 `mindos channel verify discord`
  → 系统反馈：显示 "Verifying Discord configuration..."
  → 状态变化：读取 discord config

Step 2: 系统调用平台 API 验证凭证（e.g., Discord API 查询 Bot 信息）
  → 用户看到进度：⏳ Connecting to Discord API... (3s elapsed)

Step 3: 验证成功
  → 系统反馈：✔ Discord configuration is valid
             Bot name: MindOS
             Bot ID: 1234567890
             Permissions: 8 (Administrator)
  → 状态变化：无变化（只读操作）

Step 4: 用户得到确认

成功结果：用户确认了凭证有效，可以放心使用
```

**异常分支**：
- 异常 A：凭证已过期/被撤销 → 系统反馈 "✗ Discord configuration is invalid. Bot token expired or revoked. Run `mindos channel add discord` to re-configure."
- 异常 B：网络错误 → 系统反馈 "✗ Network error: Could not reach Discord API. Check your internet connection."
- 异常 C：平台不存在 → 系统反馈 "Platform not configured: discord"

**边界场景**：
- 凭证配置不完整（缺字段）→ 系统提示 "Configuration incomplete: missing required field 'app_secret'. Run `mindos channel add feishu` to fix."
- 同时验证多个平台 → 不支持（需要逐个执行 `mindos channel verify <platform>`）
- 验证中 im.json 被外部修改 → 验证使用已加载的配置副本，不受影响

---

### User Flow 5: 显示帮助

**用户目标**：了解 `mindos channel` 命令的所有可用选项

**前置条件**：无

**操作流程**：

```
Step 1: 用户执行 `mindos channel --help` 或 `mindos channel`
  → 系统反馈：显示完整的命令帮助文档

Step 2: 用户看到：
  - 命令描述
  - 所有可用的子命令（list, add, remove, verify）
  - 每个子命令的简短描述
  - 使用示例

成功结果：用户理解了命令的用途和用法
```

**帮助文本示例**：
```
mindos channel — Manage IM platform configurations

USAGE
  mindos channel [command]

COMMANDS
  list                     Show configured IM platforms
  add <platform>          Add or update a platform configuration
  add <platform> --env    Load credentials from environment variables
  remove <platform>       Remove a platform configuration
  verify <platform>       Test if platform credentials are valid

EXAMPLES
  mindos channel list
  mindos channel add telegram
  mindos channel add telegram --env
  mindos channel add wecom --env
  mindos channel verify discord
  mindos channel remove feishu

PLATFORMS SUPPORTED
  telegram, discord, feishu, slack, wecom, dingtalk, wechat, qq

RUN 'mindos channel <command> --help' for details on any command.
```

---

## 5. 状态流转图

```
                    ┌─────────────────────┐
                    │  mindos channel     │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   ┌─────────┐          ┌──────────┐          ┌──────────┐
   │  list   │          │   add    │          │ remove   │
   └────┬────┘          └────┬─────┘          └────┬─────┘
        │                    │                     │
        │                    ▼                     │
        │            ┌──────────────┐              │
        │            │  Show Prompt │              │
        │            └──────┬───────┘              │
        │                   │                      │
        │            ┌──────▼───────┐              │
        │            │ Verify Input │              │
        │            └──────┬───────┘              │
        │                   │                      │
        │         ┌─────────┴──────────┐           │
        │         │ (success)          │ (fail)    │
        │         │ Input Valid?       │ Retry?    │
        │         │ (retry/abort)      │           │
        │         ▼                    ▼           │
        │    ┌─────────┐         ┌────────┐       │
        │    │ API Call│         │ Abort  │       │
        │    └──┬──────┘         └────────┘       │
        │       │                                  │
        │   ┌───┴──────┐                           │
        │   │ (success) │ (fail)                   │
        │   │ Save      │ Retry?                   │
        │   ▼           ▼                          │
        │  ✔           ⚠️                         │
        │  Saved       Aborted                    │
        │   │                │                    │
        └───┼────────────────┼────────────────────┘
            │                │
            ▼                ▼
        ┌─────────────────────────┐
        │  Show Final Message     │
        │  (success/abort/error)  │
        └─────────────────────────┘
```

---

## 6. UI 线框图（CLI 输出状态）

### 状态 1：初始帮助（无参数）

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  mindos channel — Manage IM platform configurations    │
│                                                          │
│  USAGE                                                  │
│    mindos channel [command]                            │
│                                                          │
│  COMMANDS                                               │
│    list                    Show configured platforms    │
│    add <platform>          Add/update platform config  │
│    remove <platform>       Remove platform config      │
│    verify <platform>       Test platform credentials   │
│                                                          │
│  Run 'mindos channel --help' for more info             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 2：列表 - 正常

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Configured IM Platforms                               │
│                                                          │
│  Telegram        ✔ configured (MyBot)                  │
│  Discord         ✔ configured (MindOS#1234)           │
│  Feishu          ✘ incomplete (missing app_secret)     │
│  Slack           ○ not configured                       │
│  WeChat Ent.     ○ not configured                       │
│  DingTalk        ○ not configured                       │
│  WeChat          ○ not configured                       │
│  QQ              ○ not configured                       │
│                                                          │
│  Run 'mindos channel add <platform>' to configure      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 3：列表 - 空（未配置任何平台）

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  No IM platforms configured.                           │
│                                                          │
│  Get started:                                           │
│    mindos channel add telegram                         │
│    mindos channel add discord                          │
│    mindos channel add feishu                           │
│                                                          │
│  For details, run:                                      │
│    mindos channel --help                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 4：添加 - 交互中

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Configuring Telegram platform                         │
│                                                          │
│  Enter Telegram bot token (hidden):                    │
│  _____________________________                          │
│                                                          │
│  Tip: Get bot token from @BotFather on Telegram       │
│  More info: https://core.telegram.org/bots             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 5：添加 - 验证中

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ⏳ Verifying token...                                  │
│  ████████░░░░░░░░░░ 40% (2s elapsed)                  │
│                                                          │
│  Testing connection to Telegram API...                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 6：添加 - 成功

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✔ Token verified successfully!                        │
│                                                          │
│  Bot Name:      MyBot                                   │
│  Bot ID:        123456789                               │
│  User ID:       987654321                               │
│                                                          │
│  ✔ Configuration saved to ~/.mindos/im.json            │
│                                                          │
│  You can now use Telegram with MindOS agents.          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 7：添加 - 验证失败

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✗ Token verification failed                           │
│                                                          │
│  Error: Invalid bot token format                       │
│  Expected format: 123456789:ABCdefGHIjklmnoPQRstuvWXYZ│
│                                                          │
│  Options:                                               │
│    [R] Retry                                            │
│    [A] Abort                                            │
│    [?] Help                                             │
│                                                          │
│  Choose (R/A/?): _                                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 8：验证 - 成功

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✔ Discord configuration is valid                      │
│                                                          │
│  Bot Name:      MindOS                                  │
│  Bot ID:        1234567890123456789                     │
│  Permissions:   Administrator (8)                       │
│  Status:        Ready to send messages                 │
│                                                          │
│  Last verified: just now                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 9：验证 - 失败

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✗ Feishu configuration is invalid                     │
│                                                          │
│  Error: Invalid app secret                             │
│  Details: Authentication failed with code 4001         │
│                                                          │
│  To fix this:                                           │
│    1. Check your app_id and app_secret                 │
│    2. Verify they haven't expired                      │
│    3. Run: mindos channel add feishu                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 10：删除 - 确认

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  About to remove Telegram configuration                │
│                                                          │
│  Current config:                                        │
│    bot_token: 123456****                               │
│                                                          │
│  ⚠️  This action cannot be undone.                      │
│                                                          │
│  Remove Telegram configuration? (y/N): _               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 状态 11：删除 - 成功

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✔ Telegram configuration removed                      │
│                                                          │
│  You can re-add it anytime with:                       │
│    mindos channel add telegram                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 7. 方案对比 & 选择

### 方案 A：完全交互式 (Interactive-First)

**描述**：所有配置都通过 CLI 提示符（prompts）进行，用户逐字段输入。

**流程**：`mindos channel add telegram` → 提示 bot_token → 提示其他字段 → 验证 → 保存

**优点**：
- ⭐⭐⭐⭐⭐ 用户体验流畅，无需记住字段名
- 新手友好，逐步引导
- 验证实时反馈

**缺点**：
- 难以自动化（CI/CD）
- 重复配置多个平台时冗长

**实现复杂度**：中  
**可维护性**：高（逻辑清晰）  
**风险**：无

---

### 方案 B：CLI 标志 (Flags-Based)

**描述**：用户通过 `--flag value` 传入所有参数。

**流程**：`mindos channel add telegram --bot-token "123456:ABC"` → 验证 → 保存

**优点**：
- ⭐⭐⭐ 易于自动化和脚本化
- 一行命令完成配置
- 适合 CI/CD

**缺点**：
- ⭐ 长凭证暴露在命令行历史中（安全风险）
- 用户需记住字段名
- 不够友好

**实现复杂度**：低  
**可维护性**：中  
**风险**：高（凭证泄露风险）

---

### 方案 C：混合模式 (Hybrid) ✅ **SELECTED**

**描述**：默认交互式，但允许通过环境变量或 stdin 输入敏感数据。支持 `--json` 模式进行自动化。

**流程**：
- 正常用途：`mindos channel add telegram` → 交互提示 → 输入（隐藏）→ 验证 → 保存
- 自动化：`echo '{"bot_token":"..."}' | mindos channel add telegram --json-input` → 验证 → 保存
- 环境变量：`export TELEGRAM_BOT_TOKEN="..."; mindos channel add telegram --env` → 验证 → 保存
- WeCom 可用 `WECOM_WEBHOOK_KEY` 或 `WECOM_CORP_ID + WECOM_CORP_SECRET`
- DingTalk 可用 `DINGTALK_WEBHOOK_URL` 或 `DINGTALK_CLIENT_ID + DINGTALK_CLIENT_SECRET`

**优点**：
- ⭐⭐⭐⭐⭐ 最佳用户体验（交互 + 安全）
- ⭐⭐⭐⭐⭐ 易于自动化（环境变量或 stdin）
- ⭐⭐⭐⭐ 凭证不暴露在历史中
- ⭐⭐⭐⭐ 符合 OpenClaw 的灵活性

**缺点**：
- 实现稍复杂

**实现复杂度**：中  
**可维护性**：高  
**风险**：低

---

### 方案选择理由

**选择方案 C（混合模式）**，因为：

1. **用户体验最佳**：交互式提示对人工操作友好，隐藏输入保护凭证
2. **安全性优先**：凭证不暴露在 CLI 历史，符合最佳实践
3. **自动化友好**：通过环境变量或 stdin 支持 CI/CD，符合 OpenClaw 灵活性
4. **符合 MindOS 设计原则**：与 `mindos config` 命令的交互式设计一致
5. **长期可维护**：清晰的职责分离，易扩展到其他平台

---

## 8. 架构与实现设计

### 文件结构

```
bin/
├── commands/
│   ├── channel.js          ← 新建：CLI 命令入口
│   └── ...
├── lib/
│   ├── channel-mgmt.js     ← 新建：业务逻辑（add/remove/verify/list）
│   ├── channel-prompts.js  ← 新建：交互提示（inquirer 风格）
│   ├── channel-validate.js ← 新建：字段验证
│   └── ...
└── ...

app/lib/im/
├── types.ts
├── config.ts
├── executor.ts
├── adapters/
│   └── ...
└── ...
```

### 核心模块职责

| 模块 | 职责 |
|------|------|
| `channel.js` | CLI 入口，路由子命令到 `channel-mgmt.js` |
| `channel-mgmt.js` | 核心业务：读/写 config，调用 executor 验证 |
| `channel-prompts.js` | 交互提示（隐藏输入、确认、选择） |
| `channel-validate.js` | 字段级验证（token 格式等） |

### 数据流

```
CLI Input
    ↓
channel.js (route)
    ↓
channel-mgmt.js (business logic)
    ├─ Read ~/.mindos/im.json (config.ts)
    ├─ Validate input (channel-validate.js)
    ├─ Verify credentials (executor.ts → Adapters)
    ├─ Write ~/.mindos/im.json (config.ts)
    └─ Return result
    ↓
CLI Output (formatted message)
```

### 类型定义

```typescript
// bin/lib/channel-mgmt.ts (new)

interface ChannelAddOptions {
  platform: IMPlatform;
  interactive?: boolean;        // 交互模式（默认 true）
  jsonInput?: string;           // JSON stdin
  envPrefix?: string;           // ENV_ 前缀
}

interface ChannelResult {
  ok: boolean;
  message: string;              // 用户可见消息
  details?: {
    botName?: string;
    botId?: string;
    [key: string]: unknown;
  };
  error?: string;               // 错误信息
}

interface ChannelListResult {
  platforms: Array<{
    platform: IMPlatform;
    status: 'configured' | 'incomplete' | 'not_configured';
    botName?: string;
    lastVerified?: string;
    missingFields?: string[];
  }>;
}
```

### 错误处理策略

| 错误类型 | 处理方式 |
|---------|---------|
| 文件不存在 | 创建空 config + 首次写入 |
| 权限不足 | 显示具体路径 + 提示 `chmod` |
| 网络超时 | 允许重试 3 次 + 明确提示网络问题 |
| 凭证无效 | 显示 API 返回的原因 + 允许重试 |
| 竞态条件 | mtime 检查 + 提示 "config changed elsewhere" |

---

## 9. 验收标准

### 功能需求
- ✅ `mindos channel list` 显示所有已配置/未配置的平台
- ✅ `mindos channel add <platform>` 交互式配置新平台
- ✅ `mindos channel remove <platform>` 删除已配置平台
- ✅ `mindos channel verify <platform>` 验证凭证有效性
- ✅ `mindos channel --help` 显示完整帮助
- ✅ 支持环境变量输入（`export PLATFORM_TOKEN=...`）
- ✅ 支持 stdin JSON 输入（用于自动化）

### 安全性需求
- ✅ 敏感信息不打印完整值（仅显示 `****`）
- ✅ 交互输入使用隐藏回显（password mode）
- ✅ 凭证存储使用 0o600 权限
- ✅ 不在 CLI 历史中记录完整凭证

### UX 需求
- ✅ 提示明确清晰（中英双语示例）
- ✅ 错误信息包含具体原因 + 修复建议
- ✅ 进度指示（⏳ 验证中...）
- ✅ 支持 `--json` 输出（机器可读）
- ✅ 支持 `--quiet` 模式（仅返回状态码）

### 测试覆盖
- ✅ 单元测试：字段验证、格式检查
- ✅ 集成测试：读/写 im.json，调用 Adapter
- ✅ E2E 测试：完整 flow（add → verify → remove）
- ✅ 边界测试：空输入、超大输入、特殊字符

---

## 10. OpenClaw 对标检查清单

| 检查项 | OpenClaw 做法 | MindOS 方案 | 对标 |
|--------|-------------|-----------|------|
| 命名约定 | verb_noun snake_case | `channel add/list/remove/verify` | ✔️ 动词在前 |
| 工具分层 | 8 核心 + 17+ 高级 | 2 Agent 工具 | ✔️ IM 已分离 |
| 凭证管理 | 平台隔离 + 单独存储 | `~/.mindos/im.json` | ✔️ 隔离 |
| Lazy Loading | 未配置平台不加载 SDK | 已实现（executor.ts） | ✔️ |
| 验证方式 | API call 测试 | `adapter.verify()` | ✔️ |
| 错误处理 | 明确原因 + 恢复建议 | 设计中 | ✔️ 计划 |
| 交互模式 | 支持自动化 + 交互式 | 混合模式 | ✔️ |
| 日志/Debug | 隐藏敏感信息 | maskKey() 函数 | ✔️ |

---

## 11. 实施计划

### Phase 3：实现核心逻辑
- [ ] 创建 `bin/lib/channel-mgmt.js`（CRUD 操作）
- [ ] 创建 `bin/lib/channel-prompts.js`（交互提示）
- [ ] 创建 `bin/lib/channel-validate.js`（字段验证）
- [ ] 编写单元测试

### Phase 4：实现 CLI 命令
- [ ] 创建 `bin/commands/channel.js`（命令入口）
- [ ] 实现子命令路由
- [ ] 集成到 CLI 路由

### Phase 5：测试与打磨
- [ ] 集成测试（完整 flow）
- [ ] E2E 测试（真实 Adapter）
- [ ] 安全审查
- [ ] 文档更新

---

## 附录 A：平台字段参考

| 平台 | 必需字段 | 验证方式 |
|------|---------|---------|
| Telegram | `bot_token` | 调用 `getMe()` |
| Discord | `bot_token` | 调用 `GET /users/@me` |
| Feishu | `app_id`, `app_secret` | 调用 `POST /auth/v3/tenant_access_token/internal` |
| Slack | `bot_token` (xoxb-...) | 调用 `POST /api/auth.test` |
| WeChat Enterprise | `webhook_key` 或 (`corp_id` + `corp_secret`) | webhook 模式直接可用；corp 模式走企业凭据 |
| DingTalk | `webhook_url` 或 (`client_id` + `client_secret`) | webhook 模式或 OAuth app 模式 |
| WeChat Official | `bot_token` | 调用 WeChat API |
| QQ | `app_id`, `app_secret` | 调用 QQ OpenID endpoint |

---

## 附录 B：命令示例集合

### 人工操作示例

```bash
# 查看所有平台
$ mindos channel list

# 交互式添加 Telegram
$ mindos channel add telegram
Configuring Telegram platform
Enter Telegram bot token (hidden): [用户输入]
⏳ Verifying token...
✔ Token verified. Bot name: MyBot
✔ Saved to ~/.mindos/im.json

# 验证 Discord
$ mindos channel verify discord
✔ Discord configuration is valid
Bot name: MindOS
Bot ID: 1234567890

# 删除 Feishu
$ mindos channel remove feishu
About to remove Feishu configuration
Current config: app_id: abc****
⚠️  This action cannot be undone.
Remove Feishu configuration? (y/N): y
✔ Feishu configuration removed
```

### 自动化示例

```bash
# 通过环境变量
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF"
mindos channel add telegram --env

# 通过 stdin（JSON）
echo '{"bot_token":"123456:ABC-DEF"}' | \
  mindos channel add telegram --json-input

# CI/CD 脚本
for platform in telegram discord feishu; do
  mindos channel verify $platform --quiet
  if [ $? -eq 0 ]; then
    echo "✓ $platform is ready"
  else
    echo "✗ $platform needs configuration"
  fi
done
```

---

**END OF SPEC**

---

## 附录 C：实现中发现的关键问题与修复建议（Phase 5 红队审查）

### 🔴 关键问题 (Blockers)

1. **无凭证验证就保存配置** (bin/lib/channel-mgmt.js)
   - 用户运行 `mindos channel add telegram <bad-token>`
   - CLI 在格式验证后直接保存，没有调用 API 验证
   - 下次用户运行 `mindos channel verify` 时才发现失败
   - 修复：在保存前调用 `POST /api/channels/verify` 端点

2. **并发写冲突** (bin/lib/channel-config.js)
   - 两个进程同时运行 `mindos channel add` 
   - 第二个进程的写操作会覆盖第一个的更改
   - 修复：添加文件锁或读后验证（save → read → compare）

3. **Readline 在错误时未清理** (bin/commands/channel.js)
   - `promptConfirm()` 失败后 `closePrompts()` 未调用
   - CLI 挂起，需手动中断
   - 修复：在所有分支中使用 try/finally

### 🟡 主要问题 (Majors - 9 items)

1. **文件 I/O 无超时** - 网络挂载失败时 CLI 挂起 30+ 秒
2. **无 JSON 大小验证** - 边界情况：1000+ 平台配置导致内存溢出
3. **验证逻辑重复** - bin/ 和 app/ 各有一份，易失同步（如 mcp-agents.ts vs .js 的历史教训）
4. **错误消息缺乏上下文** - 用户不知道哪个字段无效或预期格式
5. **提示前无验证帮助** - 用户不知道 token 格式要求，盲目输入
6. **无加载指示** - API 验证等待 5 秒时用户以为 CLI 卡死
7. **无离线模式** - 用户无法在离线状态下保存配置
8. **帮助文本虚假** - 说支持环境变量但未实现
9. **测试文件有未实现的测试** - 425 个测试都是 expect(true).toBe(false) 占位符

### 🟢 次要问题 (Minors)

- Windows 上 emoji 渲染可能异常
- 窄终端上帮助文本可能换行错乱

### 建议修复优先级

**立即修复（发布前必须）**:
1. ✅ 创建 `bin/lib/channel-constants.js` - 共享平台验证规则
2. ✅ 改进错误消息 - 包含具体缺失字段和预期格式
3. ✅ 添加 Readline 清理 - try/finally 保护
4. ⏳ 移除虚假帮助文本（关于环保变量的部分）

**Post-MVP 可优化**:
- 添加文件锁或乐观并发控制
- 实现 `/api/channels/verify` 端点用于真实凭证验证
- 添加 `--skip-verify` 标志用于 CI/CD 与离线配置
- 添加 `--env` 标志用于非交互配置
- WeCom / DingTalk 支持 alternative credential sets
- 针对 macOS / Linux / Windows 增加 channel 专项回归测试与 CI matrix
- 完成所有测试用例实现

### 用户演练结果摘要

✅ 基础场景通过:
- `mindos channel list` 正确显示配置状态
- `mindos channel remove` 显示确认提示并原子性删除
- 配置文件权限设为 0o600 保护凭证
- 帮助文本清晰、示例完整

⚠️ 需验证的场景:
- 有效的添加流程（格式验证 + 保存）
- 并发操作的数据完整性
- 网络超时和错误恢复
- 在实际的 Telegram/Discord 机器人上的验证

---

**END OF SPEC**
