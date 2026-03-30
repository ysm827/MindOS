# 开发知识记录

## Bug: npm workspaces 依赖提升导致 Turbopack 模块解析失败

**发生时间**: 2026-03-22

**问题现象**:
在启动开发服务器或构建应用时，Turbopack 报错无法找到 `picocolors`、`source-map-js` 等包。这些错误只在 npm 11+ 版本中出现。

**根本原因**:
npm 11+ 对 workspace 依赖进行了激进的提升（hoisting），将各 workspace（如 `app/`、`mcp/`、`desktop/`）的依赖包提升到项目的根目录 `node_modules/` 下。Turbopack 依赖模块解析逻辑无法正确找到这些被提升的包，导致构建失败。

**解决方案**:
在 `.npmrc` 中配置阻止依赖提升：

```ini
# 使用 install-strategy=nested 替代已废弃的 hoist
# (hoist=false 不是有效的 npm config key，会在 npm 10+ 中报警告)
install-strategy=nested
shamefully-hoist=false
strict-peer-dependencies=false
```

其中：
- `install-strategy=nested`: 保持每个 workspace 的依赖自我容器化，不提升到根目录
- `shamefully-hoist=false`: 禁止扁平化依赖结构
- `strict-peer-dependencies=false`: 避免 peer dependency 的严格检查报错

**影响范围**:
仅影响从源码构建的开发者。npm 包用户和 Electron 用户不受影响。

**修复提交**:
- `ab305ff` - 添加 .npmrc 防止 workspace 依赖提升
- `44f1eab` - 使用 install-strategy=nested 替代无效的 hoist=false
