# Release & Update Guide

## 发版（发布新版本到 npm）

确保所有改动已提交，然后运行：

```bash
npm run release          # patch: 0.1.9 → 0.1.10
npm run release minor    # minor: 0.1.9 → 0.2.0
npm run release major    # major: 0.1.9 → 1.0.0
```

脚本会自动完成：

1. 检查工作区是否干净（有未提交改动会中断）
2. 运行测试
3. 更新 `package.json` 版本号 + 创建 commit + 打 git tag
4. 推送 commit 和 tag 到 origin
5. 等待 CI 发布结果（需要 `gh` CLI）

CI workflow (`.github/workflows/publish-npm.yml`) 监听 `v*.*.*` tag，自动发布到 npm。

## 日常开发提交

正常的代码提交不会触发发布：

```bash
git add <files>
git commit -m "feat: description"
git push origin main
```

## 用户更新

用户通过 npm 更新到最新版：

```bash
npm install -g @geminilight/mindos@latest
```
