# Spec: File Tree 隐藏系统文件

## 目标

在 File Tree 中默认隐藏系统配置文件（INSTRUCTION.md、README.md、CONFIG.json、CHANGELOG.md、TODO.md），使文件树只展示用户内容，降低认知负荷。用户可通过 Settings → "Show Hidden Files" 切换恢复显示。

## 现状分析

当前 `filterVisibleNodes()` 仅在 `depth > 0` 时生效：
- Space 内：INSTRUCTION.md + README.md 已隐藏
- 非 Space 目录内：仅 README.md 隐藏
- **根级别（depth=0）**：所有文件可见 → CONFIG.json / CHANGELOG.md / TODO.md / README.md / INSTRUCTION.md 全部暴露

这违反 Design Principle #1 "Content is King" 和 #3 "Progressive Disclosure"。

## 数据流 / 状态流

```
[Server] buildFileTree() → FileNode[] → getFileTree()
          ↓
[Client] <FileTree nodes={fileTree} depth={0} />
          ↓
[Client] depth=0: 只过滤 dot-files（如果 show-hidden=false）
         depth>0: filterVisibleNodes() → 隐藏 SYSTEM_FILES
          ↓
[改动点] 让所有层级都过滤 SYSTEM_FILES（除非 show-hidden=true）
```

关键改动：`FileTree.tsx` 的根组件 render 路径（depth=0）和 `DirView.tsx` 的目录视图。

## 方案

### 1. 扩展 SYSTEM_FILES 集合

```typescript
// FileTree.tsx + DirView.tsx
const SYSTEM_FILES = new Set([
  'INSTRUCTION.md',
  'README.md',
  'CONFIG.json',
  'CHANGELOG.md',
  'TODO.md',
]);
```

### 2. 修改 filterVisibleNodes 使其在所有层级生效

```typescript
// FileTree.tsx — 将过滤逻辑统一
function filterVisibleNodes(nodes: FileNode[], parentIsSpace: boolean): FileNode[] {
  return nodes.filter(node => {
    if (node.type !== 'file') return true;
    if (SYSTEM_FILES.has(node.name)) return false;  // 所有层级都隐藏
    return true;
  });
}
```

### 3. 修改根级别渲染逻辑

```typescript
// FileTree.tsx — FileTree 根组件
// 当前：depth=0 不调用 filterVisibleNodes
// 改后：depth=0 也调用 filterVisibleNodes（show-hidden 时跳过）
let visibleNodes = filterVisibleNodes(nodes, !!parentIsSpace);
if (!isInsideDir && !showHidden) {
  visibleNodes = visibleNodes.filter(n => !n.name.startsWith('.'));
}
```

### 4. Show Hidden Files 作为 escape hatch

当 `showHidden = true` 时跳过系统文件过滤，所有文件重新可见。已有 Settings → Knowledge Tab 的 toggle。

### 5. DirView.tsx 同步扩展

目录视图页面的 `SYSTEM_FILES` 同步扩展，保持一致性。

## 影响范围

- `app/components/FileTree.tsx` — SYSTEM_FILES 扩展 + filterVisibleNodes 全层级生效
- `app/components/DirView.tsx` — SYSTEM_FILES 同步扩展
- `app/lib/fs.ts` — 不需改动（server 端返回所有文件，客户端过滤）

不受影响：
- MCP/API 层：仍然返回所有文件，过滤只在 UI 层
- 搜索：搜索仍能找到系统文件（搜索不受 File Tree 过滤影响）
- Space 功能：INSTRUCTION.md 仍然存在，只是不在树中显示

## 边界 case 与风险

1. **根级别只有系统文件** → File Tree 为空 → 可接受，首页 Spaces grid 仍有内容
2. **子目录中有同名文件**（如用户创建了 `notes/CONFIG.json`）→ 会被过滤 → 可接受，show-hidden 可恢复
3. **show-hidden 开关切换** → 即时生效（useSyncExternalStore 已保证）
4. **countContentFiles 计数** → 已正确排除 SYSTEM_FILES（line 77），新增文件名不影响

风险：
- 低风险：用户可能不知道 CONFIG.json 等文件的存在 → mitigation: 新用户不需要知道，高级用户使用 show-hidden
- 极低风险：i18n 相关 → 无新文案，无需翻译

## 验收标准

- [ ] 新建知识库后 File Tree 不显示 INSTRUCTION.md、README.md、CONFIG.json、CHANGELOG.md、TODO.md
- [ ] Space 内的 INSTRUCTION.md、README.md 仍然隐藏（不退化）
- [ ] 非 Space 目录内的 README.md 仍然隐藏（不退化）
- [ ] 开启 "Show Hidden Files" 后所有系统文件重新可见
- [ ] 关闭 "Show Hidden Files" 后系统文件再次隐藏
- [ ] DirView（目录页面视图）同步隐藏系统文件
- [ ] Space 右键 → "Edit Rules" 仍可正常跳转 INSTRUCTION.md
- [ ] Space hover → ScrollText 图标仍可正常跳转 INSTRUCTION.md
- [ ] 搜索（⌘K）仍能找到系统文件内容
- [ ] Space 的 contentCount 计数不受影响
- [ ] 现有测试全部通过
