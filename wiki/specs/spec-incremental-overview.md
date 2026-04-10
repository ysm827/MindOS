# Spec: Space 概述增量刷新

## 目标
Space 概述刷新时，只扫描上次生成后变更的文件，生成增量 patch 合并到现有 README，减少 LLM token 消耗和生成时间。

## 现状分析
`compileSpaceOverview()` 每次全量收集所有文件（最多 80 个 × 800 字符 = ~40K token），全量发送给 LLM 重写整个 README.md。无论空间改了 1 个文件还是 80 个文件，消耗相同。没有任何上次生成时间的记录。

## 数据流 / 状态流

```
[用户点击刷新]
     │
     ▼
[POST /api/space-overview]
     │
     ▼
[compileSpaceOverview(space, signal)]
     │
     ├─ 读 README.md 底部 HTML 注释获取 lastCompiled 时间戳
     │
     ├─ collectSpaceFiles() 收集所有文件
     │
     ├─ 按 mtime 过滤出 changedFiles（mtime > lastCompiled）
     │
     ├─ changedFiles.length === 0 → 返回 { unchanged: true }
     │
     ├─ changedFiles.length / totalFiles > 0.5 → 全量重写（走旧逻辑）
     │
     ├─ 否则 → 增量模式：
     │    ├─ 构建 incremental prompt：现有 README + 变更文件内容
     │    ├─ LLM 返回更新后的 README
     │    └─ 写入 README.md（底部追加新时间戳注释）
     │
     ▼
[前端 router.refresh() 显示新内容]
```

**元数据存储**：在 README.md 末尾追加 HTML 注释：
```
<!-- mindos:compiled 2026-04-10T12:00:00Z files:25 -->
```
- 不需要额外文件
- 不影响渲染（HTML 注释在 Markdown 中不可见）
- 简单可靠

## 方案

### 方案 A（选定）：README 内嵌时间戳 + mtime 对比增量
- **用户体验质量**：⭐⭐⭐⭐⭐（无变更时秒返回，有少量变更时快速增量）
- **实现复杂度**：中
- **可维护性**：高（无额外文件/数据库）
- **风险**：用户手动编辑 README 可能丢失注释 → fallback 全量

### 方案 B：Sidecar JSON 文件
- **用户体验质量**：⭐⭐⭐⭐⭐（同上）
- **实现复杂度**：中高（需要处理 .overview-meta.json 的生命周期）
- **可维护性**：中（额外文件 = 额外维护）
- **风险**：文件同步问题、用户困惑

→ 选 A，因为零额外文件，README 自身即元数据载体。

## 影响范围
- `app/lib/compile.ts`：增量逻辑核心
- `app/app/api/space-overview/route.ts`：返回 unchanged 状态
- `app/components/DirView.tsx`：显示上次刷新时间 + unchanged 提示
- `app/lib/i18n/modules/knowledge.ts`：新增 i18n keys
- `app/lib/core/types.ts`：SpacePreview 增加 lastCompiled 字段
- `app/lib/fs.ts`：buildSpacePreview 解析 lastCompiled

## 边界 case 与风险
1. **README 无时间戳注释**（首次或手动编辑后）→ fallback 全量重写
2. **所有文件都变了**（>50% 变更）→ 自动切换全量模式
3. **无文件变更**→ 秒返回 `{ unchanged: true }`，前端 toast 提示
4. **空间内有大量文件但只改 1 个**→ 只发送 1 个文件 + 现有 README ≈ 2K token vs 40K
5. **并发刷新**→ 无锁，最后一次写入 wins（可接受）
6. **README 被用户手编辑**→ 时间戳可能丢失，fallback 全量

## 验收标准
- [ ] 首次生成后 README 末尾有 `<!-- mindos:compiled ... -->` 注释
- [ ] 无文件变更时刷新返回 unchanged，前端显示"概述已是最新"
- [ ] 部分文件变更时只发送变更文件给 LLM（可通过 token 计数验证）
- [ ] >50% 文件变更时自动切换全量模式
- [ ] 前端显示上次刷新时间
- [ ] 所有现有测试通过 + 新增增量逻辑测试
