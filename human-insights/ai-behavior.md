# AI 行为规律

## Code review 能发现实现中的语义 bug，但需要 prompt 明确触发

**时间：** 2026-03-15  **来源：** SPEC-OB-04 needsRestart 实现后 review

AI 自动实现时写出了功能正确的代码（逻辑结构对），但存在 3 个语义层面的 bug，都是在用户明确说"你再检查下 code"后才发现的：

1. **变量名残留旧语义**：本地变量仍叫 `didPortChange`，但逻辑已改为 `needsRestart`，误导后续维护
2. **undefined vs 空字符串误判**：`(authToken ?? '') !== (current.authToken ?? '')` 当前端不传 `authToken` 时，左边变 `''`，右边是原值，会误触发重启
3. **首次 onboard 误判**：`current.mindRoot` 为 `''`（默认值），`resolvedRoot` 是展开后的完整路径，会让 `needsRestart=true` 误触发

**关键规律**：AI 在实现阶段倾向于先跑通逻辑，边界条件和命名一致性是盲点。code review 步骤不能省，且需要明确说"检查边界条件"才能激活深度检查。

**状态：** 待提炼

---

## AI 倾向于把 unit test 写成集成测试，需要明确说"提取纯逻辑"

**时间：** 2026-03-15  **来源：** SPEC-OB-04 needsRestart unit test 编写

被问到"需要增加哪些 tests"时，AI 自然倾向于建议写 API integration test（mock Next.js request/response）。但本项目 unit test 的价值更高——把纯逻辑函数从实现文件中提取出来，放进 `tests/unit/` 单独验证，运行速度极快（100ms 级别），且不依赖任何框架。

用户说"写 unit test"后，AI 采用了「在测试文件中复制纯逻辑函数 + 只测该函数」的模式，效果很好。

**状态：** 待提炼
