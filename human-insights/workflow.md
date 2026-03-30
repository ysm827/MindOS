# 工作流发现

## spec → 实现 → code review → tests 的完整节奏效果好

**时间：** 2026-03-15  **来源：** SPEC-OB-04 完整实现过程

这次严格按照 CLAUDE.md 的任务执行流程走完了一个完整循环：写 spec → human review（plan mode）→ 执行 → code review → tests → 更新 spec。发现：

- **code review 步骤发现了 3 个实现 bug**，如果直接上线会导致「再次 onboard 无变更也触发重启」和「变量名误导」
- **写 tests 时再次验证了边界条件**，14 个 needsRestart cases 全部通过，给实现建立了回归保障
- **spec 更新在最后做**，此时实现已确定，写出的 spec 是真实状态的文档，不是预期

节奏：实现 → review → tests → 文档，每步有明确产出，不会互相干扰。

**状态：** 待提炼

---

## unit test 的「复制纯逻辑 + 独立验证」模式在 Next.js 项目中特别实用

**时间：** 2026-03-15  **来源：** tests/unit/ 目录建立

Next.js route handler 难以在 Node.js 直接运行，但其中的纯逻辑（如 `needsRestart` 计算、`detectSystemLang`）完全可以提取出来单独测试。做法：

1. 在 `tests/unit/*.test.ts` 中复制该函数（注释标明来源文件）
2. 用 vitest 直接测，不需要 mock 任何框架
3. 复用 `tests/integration/node_modules` 里已有的 vitest，不额外装依赖

运行速度 100ms 级别，CI 友好，维护成本低。

**状态：** 待提炼

---

## CLI 功能改进（语言检测、文案）适合附带在相关 spec task 里一起做，不需要单独 spec

**时间：** 2026-03-15  **来源：** detectSystemLang + CLI UX 改进

CLI 的小型 UX 改进（`detectSystemLang`、mode 选项文案、`langHint` 单向提示）在用户提问后就地实现，附在 SPEC-OB-04 之后记录进 wiki 即可。不需要为每个小改动开独立 spec，降低了文档维护成本。

判断标准：改动范围 < 20 行、不改接口契约、有明确用户意图 → 附带实现 + 附带记录。

**状态：** 待提炼
