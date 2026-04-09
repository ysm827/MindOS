# Spec: Desktop Update Toast Notification

**Date**: 2026-04-09  
**Status**: Ready for Implementation  
**Owner**: Autonomous Dev  

---

## 1. Overview

Add a non-intrusive toast notification in bottom-right corner to alert Desktop users when new updates are available (Desktop shell or MindOS Core runtime). Toast persists until dismissed, supports skip-version logic, and links directly to Settings > Update tab.

**Desktop-only**: Web/CLI users see existing red dot badge in Settings.

---

## 2. User Flow

### Main Flow: Update Detected → User Sees Toast

```
Step 1: Electron detects update available
  → System: Desktop bridge (updater.ts) receives update event
  → System: Dispatches IPC message to renderer
  → System: UpdateToast component receives onUpdateAvailable callback

Step 2: Toast appears in bottom-right corner after 10s (non-intrusive timing)
  → User sees: Warm amber toast with update info + 2 action buttons
  → User can read: "MindOS Desktop v0.1.14 available" or "Updates available (Desktop + Core)"
  → System: Toast does NOT auto-dismiss

Step 3a: User clicks "View Details" button
  → System: Dispatches event to open Settings with 'update' tab
  → System: Toast dismisses
  → User sees: Settings modal opens directly to Update tab
  → Result: User can now see full update info, download, view changelog

Step 3b: User clicks "Skip Version" button
  → System: Stores version ID in localStorage ("mindos_update_skip_desktop" / "mindos_update_skip_core")
  → System: Toast dismisses
  → System: Won't show again for this version
  → Result: User sees it again only when a NEWER version is available

Step 3c: User clicks "×" (close) button
  → System: Same behavior as "Skip Version"
  → System: Toast dismisses
```

### Anomaly: Both Desktop and Core Updates Available

```
Toast shows combined message: "Updates available — Desktop v0.1.14 · Core v0.6.28"
Buttons: "View Details" + "Skip All"
  → "Skip All": Stores BOTH versions as skipped
  → "View Details": Opens Settings (user can see both in Update tab)
```

### Boundary Cases

- **Network offline**: IPC may fail silently → toast doesn't appear (graceful degradation)
- **Update already downloading**: Toast doesn't appear (UpdateTab handles this state)
- **User closes Settings after "View Details"**: Toast already dismissed, no double-dismiss
- **Multiple versions skipped over time**: localStorage stores latest skipped per type independently

---

## 3. UI Specification

### Visual Design

| Aspect | Value | Reason |
|--------|-------|--------|
| **Position** | `fixed bottom-4 right-4` | Above content, below regular toasts |
| **Z-index** | `z-40` | Below Toaster (z-50), above page content |
| **Width** | `max-w-[320px]` | Compact, non-intrusive |
| **Background** | `bg-card` | Consistent with existing toast system |
| **Border** | `border border-border` | Subtle separation from background |
| **Shadow** | `shadow-lg` | Card-level elevation (subtle) |
| **Radius** | `rounded-xl` | Matches project's design system |
| **Animation** | `slide-in-from-bottom-4 fade-in` | Gentle entrance (200ms) |
| **Auto-dismiss** | **No** | Persists until user action |

### Component Structure

```
┌────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐  │
│ │ ● MindOS Desktop v0.1.14 available        × │  │
│ │                                            │  │
│ │ ┌─────────────────┐ ┌──────────────────┐ │  │
│ │ │ View Details    │ │ Skip Version     │ │  │
│ │ └─────────────────┘ └──────────────────┘ │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

Design details:
├─ Amber dot (indicator): w-2 h-2 rounded-full bg-[var(--amber)]
├─ Title text: text-sm font-medium text-foreground
├─ Version info: text-xs font-mono text-muted-foreground
├─ Primary button: bg-[var(--amber)] text-[var(--amber-foreground)] px-3 py-1.5 rounded-lg
├─ Secondary button: border border-border text-muted-foreground px-3 py-1.5 rounded-lg
├─ Close button: p-0.5 rounded text-muted-foreground hover:text-foreground
├─ Padding: px-4 py-3
└─ Gap between elements: gap-2.5 (consistent with existing toasts)
```

### Dual Update State

```
┌────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐  │
│ │ ● Updates available                       × │  │
│ │   Desktop v0.1.14 · Core v0.6.28            │  │
│ │                                            │  │
│ │ ┌─────────────────┐ ┌──────────────────┐ │  │
│ │ │ View Details    │ │ Skip All         │ │  │
│ │ └─────────────────┘ └──────────────────┘ │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### Types

```typescript
interface UpdateInfo {
  type: 'desktop' | 'core';
  currentVersion: string;
  latestVersion: string;
  size?: number;
}

interface DualUpdateInfo {
  desktop?: UpdateInfo;
  core?: UpdateInfo;
}

type UpdateToastState = 'hidden' | 'visible' | 'dismissing';

interface SkipVersions {
  desktop?: string;
  core?: string;
}
```

### Local Storage Keys

- `mindos_update_skip_desktop` — stores skipped Desktop version (e.g., "0.1.14")
- `mindos_update_skip_core` — stores skipped Core version (e.g., "0.6.28")

### IPC Events (from Electron bridge)

From `window.mindos` bridge (defined in `desktop/src/preload.ts`):

```typescript
// Desktop Shell Update
window.mindos.onUpdateAvailable((info: { version?: string }) => void)

// MindOS Core Update
window.mindos.onCoreUpdateAvailable((info: { current: string, latest: string, ready?: boolean }) => void)
```

### Custom Events (from UpdateToast)

- `mindos:open-settings` — CustomEvent with `detail: { tab: 'update' }`
  - Dispatched when user clicks "View Details"
  - Caught by SidebarLayout to open Settings modal to update tab

---

## 5. Implementation Details

### Component: `UpdateToast.tsx`

**File**: `app/components/UpdateToast.tsx`

**Responsibilities**:
1. Detect if running in Desktop (check `window.mindos` bridge exists)
2. Listen to `onUpdateAvailable` and `onCoreUpdateAvailable` IPC callbacks
3. Compare versions with localStorage skipped versions
4. Show/hide toast based on skip logic
5. Handle button clicks: "View Details" → dispatch Settings event
6. Handle skip: Store version + hide toast
7. Render toast UI using Tailwind + design tokens

**Key Logic**:
```
- Skip logic: 
  if (latest > skipped) show toast
  else hide toast

- Combined updates:
  desktop && core available? Show "Updates available" + "Skip All"
  else show individual type

- Delayed appearance:
  setTimeout 10s before showing toast (non-intrusive)
```

### i18n Strings

Add to `app/lib/i18n/modules/settings.ts`:

**English** (around line 465):
```typescript
updateToast: {
  titleSingle: (type: string, version: string) => `${type} v${version} available`,
  titleMultiple: 'Updates available',
  desktopLabel: 'Desktop',
  coreLabel: 'Core',
  viewDetails: 'View Details',
  skipVersion: 'Skip Version',
  skipAll: 'Skip All',
}
```

**Chinese** (around line 955):
```typescript
updateToast: {
  titleSingle: (type: string, version: string) => `${type} v${version} 可用`,
  titleMultiple: '有可用更新',
  desktopLabel: '桌面版',
  coreLabel: '运行时',
  viewDetails: '查看详情',
  skipVersion: '跳过此版本',
  skipAll: '全部跳过',
}
```

### Mounting

Add to `app/app/layout.tsx` root:

```typescript
import UpdateToast from '@/components/UpdateToast';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster />
        <UpdateToast />  {/* NEW */}
      </body>
    </html>
  );
}
```

---

## 6. Acceptance Criteria

### Functional Requirements

- [x] Toast appears when Desktop update available
- [x] Toast appears when Core update available
- [x] Toast combines both when both available
- [x] Toast respects skip versions (uses localStorage)
- [x] Toast doesn't show if version skipped
- [x] Toast reappears when newer version available
- [x] "View Details" opens Settings > Update tab
- [x] "Skip Version" / "×" dismiss toast and store skip
- [x] Toast only shows in Desktop mode (not web/CLI)

### UX Requirements

- [x] Toast appears non-intrusively (bottom-right, 10s delay)
- [x] Toast doesn't auto-dismiss (user controls it)
- [x] Clear, actionable button text
- [x] Amber visual indicator (dot)
- [x] Consistent with existing design system (colors, fonts, radius, shadows)
- [x] Smooth slide-in animation

### Technical Requirements

- [x] Zero console errors or warnings
- [x] Proper TypeScript types
- [x] i18n support (EN + ZH)
- [x] Works with existing Toaster component
- [x] Doesn't break Settings modal
- [x] localStorage persistence works
- [x] No memory leaks (cleanup event listeners)

### Accessibility

- [x] Buttons are keyboard-navigable
- [x] Focus ring visible
- [x] Close button has semantic label
- [x] No color-only information (amber dot + text)

---

## 7. Testing Strategy

### Unit Tests

1. **Skip version logic**: latest > skipped?
2. **Combined update detection**: desktop + core both available?
3. **localStorage management**: read/write skip versions
4. **Version parsing**: handle "0.1.14" format

### Integration Tests

1. **IPC event flow**: onUpdateAvailable → toast appears
2. **Settings navigation**: "View Details" → dispatch event with tab='update'
3. **Skip persistence**: dismiss → reload page → doesn't appear
4. **New version detection**: skip 0.1.14, then 0.1.15 available → toast reappears

### Manual Tests

1. Trigger Desktop update: check toast appears
2. Trigger Core update: check toast appears
3. Both together: verify combined message
4. Skip → Settings > Update → version still shows in table (not deleted)
5. Mobile responsiveness: toast fits in bottom-right on small screens

---

## 8. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| IPC bridge unavailable | Toast never shows | Graceful: returns null, no error |
| localStorage quota exceeded | Skip not saved | Unlikely; fallback: show again on next session |
| Network timeout | IPC callback delayed | Toast appears later or not at all (OK) |
| Settings modal closed before toast dismissed | No issue | Toast already dismissed when "View Details" clicked |
| Multiple bridge listeners registered | Memory leak | Cleanup all listeners in useEffect return |

---

## 9. Future Enhancements

- [ ] Auto-dismiss after 60s if user ignores (optional UX polish)
- [ ] Download button on toast (skip Settings step)
- [ ] Toast shows download progress (ambitious)
- [ ] Remind user if update available but manually skipped for 7+ days

---

## 10. References

- Existing Toaster: `app/components/ui/Toaster.tsx`
- Toast API: `app/lib/toast.ts`
- Settings Architecture: `wiki/specs/spec-settings-modal.md`
- Electron Updater: `desktop/src/updater.ts`
- Core Updater: `desktop/src/core-updater.ts`
