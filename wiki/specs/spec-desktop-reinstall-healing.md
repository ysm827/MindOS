# Spec: Desktop Reinstall Silent Healing

> **Status**: Draft
> **Author**: AI
> **Created**: 2026-04-06

## Problem

When macOS users delete MindOS.app by dragging to Trash (the standard uninstall method), the app leaves behind:

1. **Orphaned processes** — Next.js (port 3456) and MCP (port 8781) keep running
2. **launchd daemon** — `com.mindos.app` service auto-restarts indefinitely
3. **Stale PID files** — `~/.mindos/desktop-children.pid`, `~/.mindos/mindos.pid`
4. **CLI shim** — `~/.mindos/bin/mindos` points to deleted .app path
5. **Private Node.js** — `~/.mindos/node/` may be incompatible with new version
6. **Build cache** — `app/.next/` may be corrupted or version-mismatched
7. **PATH injection** — `~/.zshenv`, `~/.zshrc`, etc. still reference `~/.mindos/bin`
8. **MCP client configs** — `~/.claude.json`, `~/.cursor/mcp.json` etc. use old ports

On reinstall, these cause: port conflicts (web runs on 3457 instead of 3456), MCP client breakage, build errors, and confusing skip-setup behavior.

## Solution: Boot-time Silent Healing

Add a `healPreviousInstallation()` function to the Desktop startup flow that detects and silently fixes all residual issues before normal startup proceeds.

### Design Principles

1. **Zero UI** — No dialogs, no user decisions. Everything is silent.
2. **Preserve user data** — Never touch `config.json` values, knowledge base, or auth tokens.
3. **Prefer configured ports** — Wait for port release rather than immediately jumping to alternatives.
4. **Idempotent** — Safe to run on every boot, even when nothing needs healing.

## User Flow

```
Step 1: User opens new MindOS.app
  → Splash screen shows normal "starting" progress
  → healPreviousInstallation() runs silently

Step 2: Healing checks (all silent):
  a. Kill launchd daemon (com.mindos.app) + remove plist
  b. Kill orphaned processes from PID files
  c. Wait for configured ports to free (up to 5s with backoff)
  d. Validate private Node.js version compatibility
  e. Validate .next build cache integrity
  f. Update CLI shim to point to new .app

Step 3: Normal startup proceeds
  → Ports available → use configured ports (not alternatives)
  → All services start on expected ports
  → MCP client configs remain valid
```

## Implementation Plan

### 1. New function: `healPreviousInstallation()` in `main.ts`

Called at `app.whenReady()` BEFORE `ensureMindosCliShim()` and `ProcessManager.cleanupOrphanedChildren()`.

```typescript
async function healPreviousInstallation(): Promise<void> {
  // 1. Stop launchd daemon (already exists as cleanupConflictingLaunchdService)
  //    → Already handled, just ensure it runs first
  
  // 2. Kill orphaned processes from BOTH pid files
  //    → Extend cleanupOrphanedChildren to also handle mindos.pid
  //    → Add port-based cleanup as fallback
  
  // 3. Wait for configured ports to release (new)
  //    → After killing processes, wait with backoff for ports to free
  //    → Prevents port-jumping on reinstall
  
  // 4. Validate private Node.js (new)
  //    → Check if ~/.mindos/node/ version meets minimum requirement
  //    → If not, delete it (downloadNode will re-download)
  
  // 5. Validate .next build cache (new)
  //    → If build version doesn't match AND build appears corrupted, delete .next
}
```

### 2. Port release waiting (new logic in `main.ts`)

After killing orphaned processes, wait for configured ports to free before calling `findAvailablePort()`:

```typescript
async function waitForPortRelease(port: number, maxWaitMs = 5000): Promise<boolean> {
  const interval = 300;
  const maxAttempts = Math.ceil(maxWaitMs / interval);
  for (let i = 0; i < maxAttempts; i++) {
    if (!(await isPortInUse(port))) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false; // still in use after timeout
}
```

Call this for both webPort and mcpPort BEFORE `findAvailablePort`. If the configured port frees up within 5s, use it directly. Otherwise fall back to `findAvailablePort`.

### 3. Port-change MCP config sync (enhance existing)

Currently `updateMcpClientConfigs()` only triggers on MCP port change via dialog. Enhance:
- Also trigger when web port shifts during startup
- Also trigger when web port is used to derive MCP endpoint URL

### 4. Private Node.js version validation

```typescript
function validatePrivateNode(): boolean {
  const nodeBin = path.join(app.getPath('home'), '.mindos', 'node', 'bin', 'node');
  if (!existsSync(nodeBin)) return true; // will be downloaded fresh
  try {
    const version = execSync(`"${nodeBin}" --version`, { encoding: 'utf-8', timeout: 3000 }).trim();
    const major = parseInt(version.replace('v', '').split('.')[0]);
    return major >= 18; // minimum Node version
  } catch {
    return false; // can't run, delete it
  }
}
```

If invalid, remove `~/.mindos/node/` — `downloadNode()` in `startLocalMode()` will re-download.

### 5. Build cache validation

```typescript
function validateBuildCache(appDir: string, projectRoot: string): boolean {
  // Already covered by isNextBuildCurrent() — but add corruption check
  const nextDir = path.join(appDir, '.next');
  if (!existsSync(nextDir)) return true; // will be rebuilt
  
  // Check for corrupt state: .next exists but BUILD_ID is missing
  const buildId = path.join(nextDir, 'BUILD_ID');
  if (!existsSync(buildId)) {
    // Corrupt .next — remove it
    rmSync(nextDir, { recursive: true, force: true });
    return false; // will trigger rebuild
  }
  return true;
}
```

### 6. CLI PID file cleanup (enhance existing)

`ProcessManager.cleanupOrphanedChildren()` only handles `desktop-children.pid`. Also clean up `mindos.pid` (CLI-started processes):

```typescript
static cleanupAllOrphanedProcesses(): void {
  // 1. desktop-children.pid (existing)
  cleanupOrphanedChildren();
  
  // 2. mindos.pid (new — CLI-started processes)
  const cliPidPath = path.join(app.getPath('home'), '.mindos', 'mindos.pid');
  // Same logic as cleanupOrphanedChildren but for CLI pid file
}
```

### 7. Port-based fallback kill (new)

If PID-based kill fails, use port-based detection:

```typescript
function killProcessesOnPort(port: number): void {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'darwin' || process.platform === 'linux') {
      execSync(`lsof -ti:${port} | xargs kill -TERM 2>/dev/null`, { timeout: 3000 });
    }
  } catch { /* no process on port, or already dead */ }
}
```

## Files Changed

| File | Change |
|------|--------|
| `desktop/src/main.ts` | Add `healPreviousInstallation()`, enhance startup flow |
| `desktop/src/process-manager.ts` | Add `cleanupCliPidFile()` static method |
| `desktop/src/port-finder.ts` | Add `waitForPortRelease()` |

## Acceptance Criteria

1. User deletes MindOS.app from /Applications while services are running → reinstalls → services start on same configured ports (3456/8781)
2. launchd daemon is stopped and plist removed before port allocation
3. Orphaned processes from both Desktop and CLI are killed
4. Port release is waited for (up to 5s) before falling back to alternatives
5. If port shifts, MCP client configs are auto-updated
6. Corrupt .next build cache is detected and removed
7. Incompatible private Node.js is detected and removed
8. All healing is silent — no dialogs or user decisions
9. Healing is idempotent — safe on every boot
10. No regression when launching fresh (no previous installation)

## Non-Goals

- Cleaning up PATH injection from shell rc files (handled by existing uninstall.sh)
- Cleaning up MCP client configs on uninstall (would require macOS uninstall hook)
- Prompting user about knowledge base cleanup
