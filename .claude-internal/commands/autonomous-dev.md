你正在执行全自治开发流程。任务：$ARGUMENTS

严格遵循 CLAUDE.md 的"全自治执行流程"12 步，按顺序执行，不要跳过任何步骤，不要中途停下来等确认。

## 阶段 1：调研 + Spec

1. 读 `wiki/85-backlog.md`、相关代码和已有 spec，理解上下文
2. 按 CLAUDE.md 的 **Spec 模板** 写 spec 到 `wiki/specs/`，每段不能为空
3. 自我 review spec ≥2 轮：
   - 轮 1：完整性 — 边界 case 列够了吗？数据流图画了吗？与现有架构有冲突吗？
   - 轮 2：可行性 — 涉及的 API 存在吗？版本兼容吗？性能影响？
   - 有空白段落 → 补全。有问题 → 修改后重新 review

## 阶段 2：测试

4. 根据 spec 验收标准写测试（先于实现）
5. 必须覆盖三类 case：正常路径 + 边界 case + 错误路径
6. 过一遍 CLAUDE.md 的"边界 case 发现清单"（空值/类型/字符串/集合/时序/环境/状态）
7. 确认测试可运行且全部 fail（红灯状态）

## 阶段 3：实现

8. 写代码让测试变绿
9. 遵循 CLAUDE.md 代码规范（设计系统合规、前端状态变更检查等）

## 阶段 4：Code Review

10. 自我 code review ≥3 轮，使用 `code-review-quality` skill 的评分框架（🔴🟡🟢💡）：
    - 轮 1：**正确性** — 对照 spec 逐条验收 + 查 `wiki/80-known-pitfalls.md`
    - 轮 2：**健壮性** — 错误处理、输入验证、超时、竞态
    - 轮 3：**可维护性** — 死代码、重复代码、命名、缓存失效三层覆盖
    - 有 🔴 Blocker → 修复后重新 review，直到零 🔴

## 阶段 5：验证

11. 跑全量测试（`npx vitest run`），必须全部通过
12. 如果改动涉及 UI → 用 Playwright 截图关键页面，保存到 `/tmp/`

## 阶段 6：交付

13. 更新文档：`wiki/`（架构变更、新坑记入 `80-known-pitfalls.md`）、`85-backlog.md`（打勾）
14. commit + push（遵循 CLAUDE.md Git 流程，Conventional Commits）
15. 如果涉及 release → 执行冒烟验证（临时目录 `npx @geminilight/mindos@latest --version`）

## 最终呈现

向用户展示：
- 变更摘要（改了什么、为什么）
- 关键 diff
- 测试覆盖情况
- 截图（如有 UI 改动）
- 冒烟结果（如有 release）
