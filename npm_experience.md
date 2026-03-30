# npm Publish 经验

## 发布触发机制

- publish workflow 只监听 tag（`v*.*.*`），push 代码到 main **不会**触发 npm 发布
- tag 就是发布的开关

## 版本号来源

- `GITHUB_REF_NAME`：GitHub 内置环境变量，push tag 时自动设置为 tag 名（如 `v1.0.0`）
- workflow 会校验 `package.json` 的 version 与 tag 是否一致，不一致直接报错退出

## 发布流程

```bash
# 1. 改好代码，push 到 main（npm 不动）
git push

# 2. 准备发布时
npm version patch   # 自动改 package.json 并创建 tag（patch/minor/major）
git push && git push --tags   # 触发 npm 发布
```

## 版本号约定

- `v0.0.1`：只有骨架，功能极少
- `v0.1.0`：功能完整的早期版本（本项目从此起步）
- 本项目 package.json 当前版本：`0.1.1`

## 版本号更新

- **不会自动更新**，每次发布前需手动执行：
  ```bash
  npm version patch   # 0.1.0 → 0.1.1
  npm version minor   # 0.1.0 → 0.2.0
  npm version major   # 0.1.0 → 1.0.0
  ```
- 该命令会自动修改 `package.json` 并创建对应 git tag
- 版本语义需人工判断，没有任何机制自动决定升哪个版本

## 更新已发布版本的流程（包含 workflow 变更）

当代码或 workflow 有改动需要重新发布时：

```bash
# 1. 提交改动
git add <files> && git commit -m "..."

# 2. 升版本号（自动改 package.json 并创建 tag）
npm version patch

# 3. 推送代码和 tag，触发 GitHub Actions 发布
git push && git push --tags
```

如果需要重新发布同一版本（如之前 tag 打错了）：

```bash
# 删除旧 tag
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0

# 重新打 tag 并推送
git tag v0.1.0
git push --tags
```

## 所需 Secret

- `NPM_TOKEN`：需在仓库 Secrets 里配置，用于 `npm publish` 鉴权

## 相关文件

- `.github/workflows/publish-npm.yml`：发布 workflow
- `.github/workflows/ci.yml`：测试 workflow（与发布独立，发布前不会自动跑测试）
