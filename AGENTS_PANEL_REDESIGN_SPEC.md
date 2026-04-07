# 智能体面板重设计 Spec（精细版 v2）

版本：2.0
日期：2026-04-07
状态：精细检查完毕 + 切换逻辑已补充

---

## 一、精细检查结果

### 1.1 原 Spec 的 3 个问题

**问题 1：connectionMode 的持久化时机不清晰**
- 改动 1 中说"Setup 完成后写入"，但没说明什么时候**修改**
- 用户在 Settings 中改了连接模式，应该立即保存

**问题 2：Settings McpTab 已存在，但没有"启用/禁用 MCP"的开关**
- 现在 McpTab 只有 CLI/MCP 的"查看模式"切换（第 229-255 行）
- 没有"toggleMcp"的实际功能开关
- 需要新增

**问题 3：Onboarding 后的"切换"入口不清晰**
- 用户在哪里可以"打开 MCP"或"关闭 MCP"？
- 应该在 Settings → Connections 标签

### 1.2 需要补充的细节

**Detail 1：Settings McpTab 中新增 Connection Mode Toggle**

改动 5 中的 ConnectCard（第 218-272 行）应该变成：

改前：只有 CLI/MCP 的**查看模式**切换
```
┌─ CLI        MCP ┐  ← 切换查看哪个指南
│ Recommended     │
│ Claude Code     │
└─────────────────┘
```

改后：保留查看模式，上方新增**启用/禁用**切换

```
┌──────────────────────────────────────────────────┐
│ Connection Mode                                  │
│                                                  │
│ ☑ CLI (Always enabled)                          │
│ ☐ MCP (Optional)                                │
│                                                  │
│ Using CLI mode has lower token usage.           │
│ Enable MCP only if you use Claude Desktop, etc. │
└──────────────────────────────────────────────────┘

┌─ CLI        MCP ┐  ← 查看模式（已有）
│ ...              │
└──────────────────┘
```

**Detail 2：Connection Mode 的持久化路径**

改动 1 中不清楚的是"修改后如何保存"。应该是：

```
Settings McpTab
    ↓
用户打开/关闭 MCP 切换开关
    ↓
触发 onChange 事件
    ↓
调用 POST /api/settings，更新 connectionMode
    ↓
Agents Panel 订阅变化，自动重新渲染
```

**Detail 3：Migration 逻辑需要更精细**

改动 1 中的推断逻辑太简单：
- 旧配置推断为"CLI + MCP"可能不对
- 应该检查：mcpPort 是否显式设置（不是 0）
- 应该检查：是否有 agent 被配置为 MCP 模式

---

## 二、修正后的改动清单

### 改动 1.1：在 Settings 中持久化 connectionMode（修正版）

**改动文件**：`/app/lib/settings.ts`

```typescript
export interface ServerSettings {
  // ... 已有字段 ...
  
  // 新增：用户的连接模式偏好
  connectionMode?: {
    cli: boolean;      // 始终为 true（CLI 是基础）
    mcp: boolean;      // 用户显式选择
  };
}
```

**迁移逻辑（更精细）**：

```typescript
function inferConnectionMode(settings: ServerSettings): { cli: boolean; mcp: boolean } {
  // 如果已有显式 connectionMode，直接返回
  if (settings.connectionMode) {
    return settings.connectionMode;
  }
  
  // 旧配置推断逻辑
  const mcpPortConfigured = settings.mcpPort && settings.mcpPort > 0 && settings.mcpPort !== 8600; // 8600 是默认值
  const hasAgentsConfigured = (settings.agents ?? []).length > 0;
  
  // 只有两个条件都满足，才认为用户启用了 MCP
  return {
    cli: true,
    mcp: mcpPortConfigured && hasAgentsConfigured,
  };
}
```

**何时保存**：
- Onboarding 完成时（改动 1 的现有逻辑）
- 用户在 Settings 中改变选择时（新增逻辑，见下）

---

### 改动 1.2：Settings McpTab 新增 Connection Mode Toggle（新增）

**改动文件**：`/app/components/settings/McpTab.tsx`

改动 `McpTab` 组件，在返回的 JSX 中，**ConnectCard 前面**新增一个 Connection Mode 选择卡片：

```tsx
export function McpTab({ t }: McpTabProps) {
  const mcp = useMcpDataOptional();
  const [mcpEnabled, setMcpEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    // 初始化：从 mcp store 读取当前的 connectionMode
    if (mcp && mcp.connectionMode) {
      setMcpEnabled(mcp.connectionMode.mcp);
    }
  }, [mcp?.connectionMode]);

  const handleToggleMcp = async (enabled: boolean) => {
    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionMode: { cli: true, mcp: enabled },
        }),
      });
      setMcpEnabled(enabled);
      // 刷新 MCP store，使 Agents Panel 收到变化
      mcp?.refresh();
      toast.success();
    } catch (err) {
      toast.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Connection Mode Toggle —— 新增 */}
      <ConnectionModeCard
        mcpEnabled={mcpEnabled}
        onToggle={handleToggleMcp}
        saving={saving}
        m={t.settings?.mcp}
      />

      {/* 2. Auth Token —— 已有 */}
      <AuthTokenCard status={mcp.status} m={m} />

      {/* 3. Connect Agents —— 已有，但需要条件渲染 */}
      {mcpEnabled !== null && (
        <ConnectCard
          mode={mode}
          // ... 其他 props
        />
      )}

      {/* 4. Skills —— 已有 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* ... */}
      </div>
    </div>
  );
}
```

**新增组件 ConnectionModeCard**：

```tsx
function ConnectionModeCard({
  mcpEnabled,
  onToggle,
  saving,
  m,
}: {
  mcpEnabled: boolean | null;
  onToggle: (enabled: boolean) => Promise<void>;
  saving: boolean;
  m: Record<string, any> | undefined;
}) {
  if (mcpEnabled === null) return null; // 加载中

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--amber-subtle)] flex items-center justify-center shrink-0">
          <Plug size={14} className="text-[var(--amber)]" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          {m?.modeCardTitle ?? 'Connection Mode'}
        </h3>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 space-y-3">
        {/* 两个选项 */}
        <div className="space-y-2">
          {/* CLI Always On */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="w-4 h-4 rounded"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">
                {m?.cliLabel ?? 'CLI'}
              </span>
              <p className="text-2xs text-muted-foreground">
                {m?.cliDesc ?? 'Always enabled. Connect to Claude Code, Gemini CLI, etc.'}
              </p>
            </div>
            <span className="text-2xs px-1.5 py-0.5 rounded bg-success/10 text-success font-medium shrink-0">
              {m?.always ?? 'Always On'}
            </span>
          </div>

          {/* MCP Toggle */}
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              mcpEnabled
                ? 'border-[var(--amber)] bg-[var(--amber)]/[0.04]'
                : 'border-border/50 bg-muted/30 hover:bg-muted/50'
            }`}
          >
            <input
              type="checkbox"
              checked={mcpEnabled}
              disabled={saving}
              onChange={(e) => onToggle(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">
                {m?.mcpLabel ?? 'MCP'}
              </span>
              <p className="text-2xs text-muted-foreground">
                {m?.mcpDesc ?? 'Optional. Connect to Claude Desktop, Cursor, etc.'}
              </p>
            </div>
            {saving && <Loader2 size={14} className="animate-spin text-[var(--amber)] shrink-0" />}
          </div>
        </div>

        {/* 说明文案 */}
        <div className="rounded-lg bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
          {mcpEnabled
            ? m?.mcpEnabledHint ?? 'MCP server is running. You can connect to Desktop clients. Disable to reduce token usage.'
            : m?.mcpDisabledHint ?? 'Using CLI mode only. You can always enable MCP later if you need it.'}
        </div>

        {/* 风险提示（如果启用但 MCP 未运行） */}
        {mcpEnabled && mcp?.status && !mcp.status.running && (
          <div className="rounded-lg bg-[var(--amber)]/[0.04] border border-[var(--amber)]/20 px-3 py-2.5 flex items-start gap-2.5">
            <AlertCircle size={13} className="text-[var(--amber)] shrink-0 mt-0.5" />
            <p className="text-2xs text-[var(--amber-text)]">
              {m?.mcpNotRunning ?? 'MCP server is not running. Click "Connections" tab in Agents panel to start it.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**改动文件**：`/app/components/settings/types.ts`

添加 McpTab 的 Props 类型：
```typescript
export interface McpTabProps {
  t: LocaleStrings;
}
```

---

### 改动 2：Settings API 端点支持修改 connectionMode

**改动文件**：`/app/app/api/settings/route.ts`

POST handler 新增对 `connectionMode` 的处理：

```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const currentSettings = await readSettings();

    // 检查是否修改了 connectionMode
    if (body.connectionMode !== undefined) {
      const newConnectionMode = body.connectionMode;
      
      // 验证：connectionMode 格式合法
      if (typeof newConnectionMode.mcp !== 'boolean' || typeof newConnectionMode.cli !== 'boolean') {
        return NextResponse.json({ error: 'Invalid connectionMode' }, { status: 400 });
      }
      
      // 保存新的 connectionMode
      const updatedSettings = {
        ...currentSettings,
        connectionMode: newConnectionMode,
      };
      
      await writeSettings(updatedSettings);
      
      // 如果禁用了 MCP，但 MCP 仍在运行，考虑是否需要警告
      // （暂不自动关闭 MCP server，让用户手动操作）
    }

    // ... 处理其他字段 ...

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

---

### 改动 3：Agents Panel 响应 connectionMode 变化

**改动文件**：`/app/components/agents/AgentsContentPage.tsx`

MCP store 变化时，自动重新计算 UI 的条件渲染：

```tsx
const mcpEnabled = mcp.connectionMode?.mcp ?? false;

// 这会自动触发依赖项中包含 mcpEnabled 的所有 useMemo
const riskQueue = useMemo(
  () =>
    buildRiskQueue({
      mcpRunning: !!mcp.status?.running,
      mcpEnabled,  // ← 如果这个变了，riskQueue 会重新计算
      // ...
    }),
  [mcp.skills, mcp.status?.running, mcpEnabled, /* ... */],
);
```

---

### 改动 4：MCP Store 响应 connectionMode 变化

**改动文件**：`/app/lib/stores/mcp-store.ts`

当 connectionMode 在 Settings 中被修改时，确保 store 的 `refresh()` 会立即重新获取最新的配置：

```typescript
export const useMcpData = create<McpStoreState>((set, get) => ({
  connectionMode: { cli: true, mcp: false },
  // ... other state ...

  refresh: async () => {
    set({ loading: true });
    try {
      // 重新获取所有数据，包括 connectionMode
      const [statusData, agentsData, skillsData] = await Promise.all([
        apiFetch('/api/mcp/status'),
        apiFetch('/api/mcp/agents'),
        apiFetch('/api/skills'),
      ]);

      set({
        status: statusData,
        agents: agentsData.agents,
        skills: skillsData.skills,
        connectionMode: statusData.connectionMode ?? { cli: true, mcp: false },
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      console.error('Failed to refresh MCP data:', err);
    }
  },
}));
```

---

### 改动 5：i18n 新增连接模式切换的文案

**改动文件**：`/app/lib/i18n/modules/settings.ts`（假设这个文件存在）

```typescript
settings: {
  mcp: {
    // ... 已有文案 ...

    // 新增：Connection Mode Card
    modeCardTitle: 'Connection Mode',
    cliLabel: 'CLI',
    cliDesc: 'Always enabled. Connect to Claude Code, Gemini CLI, Codex, etc.',
    mcpLabel: 'MCP',
    mcpDesc: 'Optional. Connect to Claude Desktop, Cursor, Windsurf, etc.',
    always: 'Always On',
    
    mcpEnabledHint: 'MCP server is running. You can connect Desktop clients. Disable to reduce token usage.',
    mcpDisabledHint: 'Using CLI mode only. You can enable MCP anytime from Settings.',
    mcpNotRunning: 'MCP server is not running. Start it in Agents panel → MCP tab.',
  },
}
```

中文版本：
```typescript
settings: {
  mcp: {
    modeCardTitle: '连接模式',
    cliLabel: 'CLI',
    cliDesc: '始终启用。连接到 Claude Code、Gemini CLI、Codex 等。',
    mcpLabel: 'MCP',
    mcpDesc: '可选。连接到 Claude Desktop、Cursor、Windsurf 等。',
    always: '始终开启',
    
    mcpEnabledHint: 'MCP 服务器正在运行。您可以连接桌面客户端。禁用可降低 Token 消耗。',
    mcpDisabledHint: '目前使用 CLI 模式。您可以随时在设置中启用 MCP。',
    mcpNotRunning: 'MCP 服务器未运行。请在智能体面板 → MCP 标签中启动。',
  },
}
```

---

## 三、用户切换场景

### 场景 A：用户从 CLI-only 启用 MCP

```
1. 用户在 /setup 选了 ☑ CLI  ☐ MCP
   → config: { connectionMode: { cli: true, mcp: false } }
   → Agents Panel 干净（无 MCP 相关 UI）
   ↓
2. 后来用户想用 Claude Desktop
   → 打开 Settings（Cmd+,）
   → 找到 Connections Tab
   ↓
3. 在 Connection Mode Card 中勾选 ☑ MCP
   ↓
4. POST /api/settings { connectionMode: { cli: true, mcp: true } }
   ↓
5. mcpTab 调用 mcp.refresh()
   ↓
6. MCP Store 读取新的 connectionMode
   ↓
7. Agents Panel 自动刷新：
   - MCP Tab 出现在侧边栏
   - Hero Stats 显示 MCP 端口
   - Quick Nav 显示 MCP 卡片
   - Agent Cards 显示 MCP 计数
   ↓
8. 用户去 Agents Panel → MCP Tab → 启动 MCP Server
   ↓
9. 连接 Claude Desktop，完成！
```

### 场景 B：用户禁用 MCP 以节省 Token

```
1. 用户原本用 CLI + MCP 模式
   → Agents Panel 显示所有 MCP UI
   ↓
2. 用户发现 Token 消耗很快
   → 打开 Settings → Connections
   ↓
3. 取消勾选 ☐ MCP
   ↓
4. POST /api/settings { connectionMode: { cli: true, mcp: false } }
   ↓
5. MCP Store 更新 connectionMode
   ↓
6. Agents Panel 实时变化：
   - MCP Tab 消失
   - Hero Stats 无 MCP 列
   - Quick Nav 只显示 Skills
   - Agent Cards 无 MCP 计数
   - Risk Queue 无"MCP 未运行"的警告
   ↓
7. 用户点击"Agents"面板，看到清爽的 CLI 模式 UI
   ↓
8. 用户仍可以在 Settings 中重新启用 MCP（不用重新 setup）
```

### 场景 C：来回切换（高级用户）

```
用户可以随时在 Settings 中启用/禁用 MCP
  ↓
每次切换都是即时的（无需重启 App）
  ↓
Agents Panel 的 UI 会立即适应
  ↓
如果启用 MCP，Agents Panel 会提示"启动 MCP Server"
  ↓
用户在 MCP Tab 中操作启动/停止
```

---

## 四、状态转移图

```
┌─────────────────────────────────────┐
│ Settings McpTab                     │
│                                     │
│ ☑ CLI    ☐ MCP                     │ ← 改前（无此开关）
│          ☑ MCP  (新增!)            │ ← 改后
│                                     │
│ [保存]                              │
└─────────────┬───────────────────────┘
              │ POST /api/settings
              ↓
┌─────────────────────────────────────┐
│ /api/settings                       │
│                                     │
│ - 更新 config.json                  │
│ - connectionMode 字段               │
└─────────────┬───────────────────────┘
              │ 响应成功
              ↓
┌─────────────────────────────────────┐
│ MCP Store (useMcpData)              │
│                                     │
│ store.connectionMode 改变           │
│ → 所有订阅者收到通知               │
└─────────────┬───────────────────────┘
              │
      ┌───────┴───────┐
      ↓               ↓
  AgentsOverview  AgentsMcpSection
  (改动 3-10)     (条件渲染)
      │               │
      └───────┬───────┘
              ↓
        Agents Panel 重新渲染
```

---

## 五、精细检查清单

### 5.1 后端逻辑

- [ ] `settings.ts` 中 ServerSettings 新增 connectionMode 字段
- [ ] `/api/setup/route.ts` POST handler 保存 connectionMode
- [ ] `/api/settings/route.ts` POST handler 支持修改 connectionMode
- [ ] `/api/mcp/status` 返回当前 connectionMode
- [ ] 迁移逻辑：旧配置正确推断 connectionMode
- [ ] 防护：connectionMode 值合法性验证

### 5.2 前端状态管理

- [ ] mcp-store.ts 中 McpStoreState 包含 connectionMode
- [ ] mcp-store 的 fetchAll / refresh 正确获取 connectionMode
- [ ] connectionMode 变化时，依赖它的组件自动重新渲染

### 5.3 Settings UI

- [ ] McpTab 中新增 ConnectionModeCard 组件
- [ ] CLI toggle 永久禁用（始终 checked）
- [ ] MCP toggle 可交互（onChange 保存）
- [ ] 保存过程中显示加载状态
- [ ] 保存失败时显示错误提示
- [ ] 帮助文案根据当前状态变化

### 5.4 Agents Panel 条件渲染

- [ ] AgentsPanelHubNav：MCP Tab 条件渲染
- [ ] AgentsOverviewSection：Stats / QuickNav / AgentCards 条件渲染
- [ ] buildRiskQueue：MCP 风险只在 mcpEnabled 时生成
- [ ] 快速导航卡片：1 列 vs 2 列布局根据 mcpEnabled 调整

### 5.5 迁移和兼容性

- [ ] 旧配置自动推断 connectionMode
- [ ] 首次读取时推断逻辑正确
- [ ] 重新运行 setup 时 connectionMode 被显式保存
- [ ] Settings 中 re-run setup 功能不受影响

### 5.6 测试

- [ ] 单元测试：inferConnectionMode() 多个场景
- [ ] 集成测试：Settings 保存 → MCP Store 更新 → UI 变化
- [ ] E2E 测试：完整的启用/禁用/重启用户流程
- [ ] 响应式：Settings 在移动端也能正常切换

### 5.7 文案和国际化

- [ ] 英文文案完整
- [ ] 中文文案完整
- [ ] Settings 中 MCP Card 的所有文案已本地化
- [ ] 没有硬编码的英文字符串

---

## 六、与 Onboarding 的协调

**Onboarding 的 StepAgents 无需改动**，因为：
- 它已经正确地让用户选择 CLI / MCP
- Setup 完成时会把选择保存到 config
- 之后用户在 Settings 中可以修改这个选择

**Setup 的完整流程**：
```
Onboarding:
  StepAgents 中选择 CLI / MCP
    ↓
  Setup 完成 → POST /api/setup { connectionMode: ... }
    ↓
  connectionMode 保存到 config.json
    ↓
  重定向到 /agents
    ↓

之后：
  Settings 中可随时改变 connectionMode
    ↓
  POST /api/settings { connectionMode: ... }
    ↓
  Agents Panel 实时反应
```

---

## 七、文件改动总览（修正版）

| 序号 | 文件 | 改动 | 优先级 |
|------|------|------|--------|
| 1 | `/app/lib/settings.ts` | 新增 connectionMode 字段 + 迁移逻辑 | P0 |
| 2 | `/app/app/api/setup/route.ts` | 保存 connectionMode 到 config | P0 |
| 3 | `/app/app/api/settings/route.ts` | 支持修改 connectionMode | P0 |
| 4 | `/app/app/api/mcp/status/route.ts` | 返回 connectionMode | P0 |
| 5 | `/app/lib/stores/mcp-store.ts` | 存储 + 刷新 connectionMode | P0 |
| 6 | `/app/components/settings/McpTab.tsx` | 新增 Connection Mode Card | P1 |
| 7 | `/app/components/settings/types.ts` | 更新 Props 类型 | P1 |
| 8 | `/app/components/panels/AgentsPanelHubNav.tsx` | MCP Tab 条件渲染 | P1 |
| 9 | `/app/components/agents/AgentsOverviewSection.tsx` | Stats/QuickNav/Cards 条件渲染 | P1 |
| 10 | `/app/components/agents/agents-content-model.ts` | buildRiskQueue 新增 mcpEnabled 参数 | P1 |
| 11 | `/app/components/agents/AgentsContentPage.tsx` | 传递 mcpEnabled 给子组件 | P1 |
| 12 | `/app/lib/i18n/modules/settings.ts` | 新增 Connection Mode 的文案 | P2 |

**P0 = 核心逻辑，必须**
**P1 = UI 改动，必须**
**P2 = 文案，补充**

---

## 八、实现顺序（改正版）

### Phase 1：后端基础（1 天）
1. 在 settings.ts 中新增 connectionMode 字段
2. 修改 setup 的 API 保存 connectionMode
3. 修改 settings 的 API 支持修改 connectionMode
4. 修改 mcp/status API 返回 connectionMode
5. 修改 mcp-store 存储 connectionMode

### Phase 2：Settings UI（1 天）
6. 在 McpTab 中新增 Connection Mode Card
7. 实现切换逻辑，调用 POST /api/settings

### Phase 3：Agents Panel 条件渲染（1-2 天）
8. AgentsPanelHubNav 条件渲染 MCP Tab
9. AgentsOverviewSection 条件渲染所有相关 UI
10. buildRiskQueue 新增 mcpEnabled 参数
11. AgentsContentPage 串联传递

### Phase 4：文案和测试（0.5 天）
12. 添加所有 i18n 文案
13. 单元 + 集成 + E2E 测试

**总时间**：3-4 天

---

## 九、风险分析（补充）

| 风险 | 发生率 | 影响 | 兜底方案 |
|------|--------|------|---------|
| Settings 中改变模式后，Agents Panel 没立即更新 | 中 | 用户困惑 | 确保 refresh() 后立即重新渲染（deps 数组） |
| 用户启用 MCP 但忘了启动 Server | 高 | 显示红色警告 | 在 mcpEnabled 且 !mcpRunning 时，ConnectionModeCard 显示友好提示 |
| 旧配置推断错误（推断为 MCP 但实际没用） | 低 | 显示多余 UI | 测试覆盖多个旧配置格式；用户可在 Settings 中修正 |
| 用户快速切换开关（点击 10 次） | 低 | 多次 POST 请求 | 添加防抖（debounce）或节流（throttle），200ms |
| Settings 保存失败但 UI 已更新 | 低 | 状态不一致 | 只有服务器响应成功后才 setState；失败时 rollback |

---

## 十、验收标准（完整版）

### 必须通过

✅ **Backend**
- [ ] connectionMode 字段在 config.json 中正确保存
- [ ] 旧配置自动推断 connectionMode 正确
- [ ] POST /api/settings 可修改 connectionMode
- [ ] /api/mcp/status 返回 connectionMode

✅ **Settings UI**
- [ ] Connection Mode Card 显示
- [ ] CLI toggle 禁用（始终 checked）
- [ ] MCP toggle 可交互
- [ ] 点击保存后，状态在 Agents Panel 中立即反映

✅ **Agents Panel CLI-only**
- [ ] MCP Tab 隐藏
- [ ] Hero Stats 无 MCP 列
- [ ] Quick Nav 只显示 Skills
- [ ] Agent Cards 只显示 Skills
- [ ] Risk Queue 无 MCP 警告

✅ **Agents Panel CLI + MCP**
- [ ] MCP Tab 显示
- [ ] Hero Stats 显示 MCP
- [ ] Quick Nav 显示 MCP + Skills
- [ ] Agent Cards 显示 MCP + Skills
- [ ] 若 MCP 未运行，Risk Queue 显示警告

✅ **用户流程**
- [ ] 从 CLI 切到 MCP 时，Agents Panel 实时更新
- [ ] 从 MCP 切到 CLI 时，所有 MCP UI 消失
- [ ] 来回切换多次，UI 始终正确

✅ **兼容性**
- [ ] 旧用户升级后无感知
- [ ] 重新运行 setup 时 connectionMode 被正确保存

### 不应该发生

❌ 用户改了 Settings 但 Agents Panel 没反应  
❌ 快速切换导致多个 POST 请求堆积  
❌ 用户在 CLI-only 模式下看到"MCP 未运行"的红色警告  
❌ 用户禁用 MCP 后，MCP Tab 仍然可以访问  
❌ Settings 保存失败但 UI 已更新  

---

结束
