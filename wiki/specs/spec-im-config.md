# Spec: IM 配置管理

> Parent: [spec-im-integration.md](./spec-im-integration.md)

## 文件位置

`app/lib/im/config.ts`

## 配置文件

路径：`~/.mindos/im.json`

### 格式

```json
{
  "providers": {
    "telegram": {
      "bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
    },
    "feishu": {
      "app_id": "cli_xxxxxxxxxxxx",
      "app_secret": "xxxxxxxxxxxxxxxxxxxxxxxx"
    },
    "discord": {
      "bot_token": "MTAxNTI..."
    },
    "slack": {
      "bot_token": "xoxb-...",
      "signing_secret": "abc123..."
    },
    "wecom": {
      "webhook_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    },
    "dingtalk": {
      "client_id": "dingxxxxxxxxxx",
      "client_secret": "xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

## API 设计

```typescript
import type { IMConfig, IMPlatform, PlatformConfig } from './types';

/** 读取 IM 配置，文件不存在或格式错误时返回空配置 */
export function readIMConfig(): IMConfig;

/** 写入 IM 配置 */
export function writeIMConfig(config: IMConfig): void;

/** 检查是否有任何平台配置了凭据 */
export function hasAnyIMConfig(): boolean;

/** 获取指定平台的配置，未配置返回 undefined */
export function getPlatformConfig(platform: IMPlatform): PlatformConfig | undefined;

/** 获取所有已配置的平台列表 */
export function getConfiguredPlatforms(): IMPlatform[];

/** 验证平台配置的必填字段是否完整 */
export function validatePlatformConfig(platform: IMPlatform, config: unknown): { valid: boolean; missing?: string[] };
```

## 实现要点

### 读取逻辑

```
1. 拼接路径：path.join(os.homedir(), '.mindos', 'im.json')
2. 检查文件是否存在 → 不存在返回 { providers: {} }
3. 读取文件内容
4. JSON.parse → 失败时 console.warn + 返回 { providers: {} }
5. 校验 providers 是否为对象 → 不是则返回空配置
6. 返回 IMConfig
```

### 写入逻辑

```
1. 确保 ~/.mindos/ 目录存在（fs.mkdirSync recursive）
2. JSON.stringify(config, null, 2)
3. fs.writeFileSync 原子写入（先写 .tmp 再 rename）
4. 设置文件权限 0o600（仅所有者可读写，保护凭据）
```

### 凭据校验规则

| 平台 | 必填字段 | 校验规则 |
|------|---------|---------|
| telegram | `bot_token` | 非空字符串，包含 `:` |
| feishu | `app_id`, `app_secret` | 非空字符串 |
| discord | `bot_token` | 非空字符串 |
| slack | `bot_token` | 以 `xoxb-` 开头 |
| wecom | `webhook_key` 或 (`corp_id` + `corp_secret`) | 至少一组完整 |
| dingtalk | (`client_id` + `client_secret`) 或 (`webhook_url`) | 至少一组完整 |

### 缓存策略

- 使用内存缓存 + 文件 mtime 比对
- 每次 `readIMConfig()` 检查文件 mtime，如果未变则返回缓存
- `writeIMConfig()` 同时更新缓存
- 避免每次 Agent tool call 都读磁盘

## 安全考虑

1. **文件权限**：非 Windows 平台写入时设置 `0o600`，只有文件所有者能读写。Windows 上 `fs.chmod` 不生效，需在文档中提醒用户自行保护文件
2. **不在日志中打印凭据**：所有 log 输出用 `***` 掩码处理 token
3. **原子写入**：先写 `.tmp` 再 `rename`，防止写入中途崩溃导致文件损坏
