---
name: mindos-mcp-skill-sync
description: >
  Detect and fix drift between MindOS App, MCP Server, and knowledge base.
  Use this skill whenever you modify files in the MindOS project (app/, mcp/, my-mind/,
  wiki/, or root config files) and need to ensure the MCP server, App API routes,
  renderers, and documentation stay in sync. Also use when the user mentions
  "sync MCP", "update MCP tools", "MCP out of date", "app and MCP mismatch",
  "drift", "sync skill", or when you notice that a feature exists in one layer
  but not others after making changes.
---

# MindOS MCP & Skill Sync

This skill detects and resolves drift between the three layers of the MindOS project:

1. **App Layer** (`app/`) — Next.js frontend: API routes, `lib/fs.ts` utilities, renderers, components
2. **MCP Layer** (`mcp/src/index.ts`) — MCP Server: tools exposed to AI agents
3. **Knowledge Base** (`my-mind/`) — User content, templates, and documentation

When any layer changes, the others may need to catch up. This skill automates detection and provides concrete patches.

## Project Layout

```
/data/home/geminitwang/code/mindos/
├── app/                          # Next.js 15 App
│   ├── app/api/                  # API routes (REST endpoints)
│   ├── lib/fs.ts                 # Core filesystem utilities (source of truth for capabilities)
│   ├── lib/renderers/index.ts    # Renderer plugin registry
│   └── components/renderers/     # Renderer implementations
├── mcp/
│   └── src/index.ts              # MCP Server (tools for AI agents)
├── my-mind/                      # Knowledge base content
├── wiki/                         # Project documentation
└── README.md                     # Public docs (lists MCP tools)
```

## How to Run a Sync Check

### Step 1: Inventory Both Layers

Read the three source-of-truth files and extract capabilities:

1. **`app/lib/fs.ts`** — Grep for `export function` to get all utility functions
2. **`mcp/src/index.ts`** — Grep for `server.registerTool` to get all MCP tool names
3. **`app/app/api/`** — List all API route directories
4. **`app/lib/renderers/index.ts`** — Grep for `registerRenderer` to get all renderer plugins

### Step 2: Build the Capability Map

Create a comparison table:

| Capability | app/lib/fs.ts | App API Route | MCP Tool | Notes |
|---|---|---|---|---|
| List files | `getFileTree` | `/api/files` | `mindos_list_files` | ✅ In sync |
| Read file | `getFileContent` | `/api/file` GET | `mindos_read_file` | ✅ In sync |
| Write file | `saveFileContent` | `/api/file` PUT | `mindos_write_file` | ✅ In sync |
| Create file | `createFile` | `/api/file` POST | `mindos_create_file` | ✅ In sync |
| Delete file | `deleteFile` | `/api/file` DELETE | `mindos_delete_file` | ✅ In sync |
| Search | `searchFiles` | `/api/search` | `mindos_search_notes` | ✅ In sync |
| Recent files | `getRecentlyModified` | `/api/recent-files` | `mindos_get_recent` | ✅ In sync |
| Append CSV | — | — | `mindos_append_csv` | ✅ In sync |
| Read lines | `readLines` | — | `mindos_read_lines` | ✅ |
| Insert lines | `insertLines` | — | `mindos_insert_lines` | ✅ |
| Update lines | `updateLines` | — | `mindos_update_lines` | ✅ |
| Delete lines | `deleteLines` | — | `mindos_delete_lines` | ✅ |
| Append to file | `appendToFile` | — | `mindos_append_to_file` | ✅ |
| Insert after heading | `insertAfterHeading` | — | `mindos_insert_after_heading` | ✅ |
| Update section | `updateSection` | — | `mindos_update_section` | ✅ |
| **Backlinks** | `getBacklinks` | `/api/backlinks` | — | Plugin feature, not MCP |
| **Rename file** | `renameFile` | — | `mindos_rename_file` | ✅ In sync |
| **Directory check** | `isDirectory` | — | ❌ MISSING | Low priority |
| **Dir entries** | `getDirEntries` | — | ❌ MISSING | Low priority |
| **Graph data** | — | `/api/graph` | — | Plugin feature, not MCP |
| **Settings** | — | `/api/settings` | ❌ MISSING | Internal only |

### Step 3: Classify the Drift

Rate each gap by impact:

- **High** — Agent-facing capability that users would expect (rename, file CRUD)
- **Medium** — Useful but not critical (dir entries, directory check)
- **Low** — Internal/admin only (settings)
- **N/A** — Plugin features that belong to App UI only, not MCP (backlinks, graph, renderers)

### Step 4: Generate Patches

For each High/Medium drift item, generate the appropriate code.

**If a new MCP tool is needed** → use `/mcp-builder` to create it following existing patterns in `mcp/src/index.ts`.

**If a new Skill is needed** → use `/skill-creator` to create it following the skill authoring workflow.

**If a new App API route is needed** → follow the existing pattern:
1. Create `app/app/api/<name>/route.ts`
2. Export HTTP method handlers (GET, POST, etc.)
3. Use utilities from `app/lib/fs.ts`

### Step 5: Update Documentation

After code changes, update:
1. **`README.md`** — The "Underlying Toolset for Agents" line listing all MCP tools
2. **`mcp/src/index.ts`** header comment if tool count changed
3. Rebuild MCP: `cd mcp && npm run build`

### Step 6: Verify

1. Run `cd mcp && npm run build` — must compile cleanly
2. Run `cd app && npm run build` — must compile cleanly (or at least `npx tsc --noEmit`)
3. Confirm `mcp/dist/index.js` is updated

## When Changes are Made in Specific Areas

### If `app/lib/fs.ts` changes (new export function added):
→ Check if MCP needs a corresponding tool

### If `app/app/api/` gets a new route:
→ Check if the underlying capability should also be an MCP tool

### If `mcp/src/index.ts` gets a new tool:
→ Check if app/lib/fs.ts has the underlying utility; if not, add it
→ Update README.md tool list

### If `app/lib/renderers/index.ts` changes (new renderer):
→ No MCP sync needed, but update wiki/plugins.md if it exists

### If `my-mind/` template structure changes:
→ Check if `template/` needs updating to match
→ Check if any MCP tool descriptions reference outdated paths

### If `README.md` is edited:
→ Verify the MCP tool list matches actual registered tools

## MCP Tool Naming Convention

All MCP tools follow the pattern `mindos_<action>` where action is snake_case:
- `mindos_list_files`, `mindos_read_file`, `mindos_write_file`
- `mindos_create_file`, `mindos_delete_file`
- `mindos_search_notes`, `mindos_get_recent`
- `mindos_append_csv`
- `mindos_read_lines`, `mindos_insert_lines`, `mindos_update_lines`, `mindos_delete_lines`
- `mindos_append_to_file`, `mindos_insert_after_heading`, `mindos_update_section`

New tools should follow this convention.

## Quick Sync Command

To run a full sync check without waiting for drift to accumulate:

> "Run mindos sync check" or "Check MCP drift"

This triggers the full Step 1–6 workflow above.
