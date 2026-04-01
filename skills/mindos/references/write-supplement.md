# MindOS Write & Workflow Supplement

<!-- Read this when handling any write, organize, SOP, structural, or retrospective task. -->
<!-- Skip for read-only lookups, Q&A, and summarization. -->

---

## Write tool selection

| Intent | Best tool | Avoid |
|--------|-----------|-------|
| Small text edit | `mindos_update_section` / `mindos_update_lines` / `mindos_insert_after_heading` | `mindos_write_file` for small changes |
| Append to end | `mindos_append_to_file` | Rewriting entire file to add a line |
| Full file replacement | `mindos_write_file` | Using this when a section edit suffices |
| New file | `mindos_create_file` | Creates parent dirs but does NOT scaffold Space files |
| New Mind Space (zone + README + INSTRUCTION) | `mindos_create_space` | The only way to create a Space. `create_file` creates plain folders |
| Rename a Space directory | `mindos_rename_space` | `rename_file` (files only; does not rename folders) |
| Add CSV row | `mindos_append_csv` (validates header) | Manual string append without header check |
| Check impact before rename | `mindos_get_backlinks` | Renaming without checking references |
| Inspect recent changes | `mindos_get_recent` | Guessing what changed recently |
| Recover old version | `mindos_get_file_at_version` | Asking user to recall what was there |

**Fallback:** Line/section tools unavailable → read + constrained `mindos_write_file` (simulate minimal edit).

---

## Startup protocol

Run this before executing any write path:

1. **Bootstrap** — `mindos_bootstrap` (preferred) or manually read root `INSTRUCTION.md` + `README.md`.
2. **Discover structure** — `mindos_list_spaces` (top-level zones + README blurbs) and/or `mindos_list_files` + targeted `mindos_search_notes`. Never assume top-level names.
3. **Load local governance** — Read `README.md` / `INSTRUCTION.md` near the target path. Local conventions override global assumptions.
4. **Match existing SOP** — If the task is procedural: scan tree for a procedure-holding directory (names like `Workflows/`, `SOPs/`, `流程/` are hints — don't assume). Search by keywords + `<!-- keywords: -->` metadata. If found, read and follow. If execution diverges, propose updating the SOP after.
5. **Pre-write checks** — Confirm: target path exists or should be created; location is under a subdirectory (not root); current content is read; edit scope is minimal; backlink impact assessed for path changes.
6. **Execute edits.**

If context is missing, continue with best effort and state assumptions.

---

## Execution patterns

| Pattern | When | Key steps |
|---------|------|-----------|
| **Single-file edit** | One clear target file | Startup → read target + local conventions → minimal edit → verify → summarize |
| **Multi-file routing** | Unstructured input, multiple destinations | Parse into semantic units → routing table → confirm → edit → summarize |
| **Conversation retrospective** | Distill / capture session | Confirm scope → extract decisions/pitfalls/actions → route → trace changes |
| **SOP execution** | Repeatable procedure | Read SOP fully → execute stepwise → update stale sections → propose SOP update if diverged |
| **Structural change** | Rename / move / delete | `get_backlinks` → impact report → confirm → execute → update refs → sync READMEs |
| **CSV append** | Add row to a table | Read header → validate fields → `mindos_append_csv` |
| **Cross-agent handoff** | Continue another agent's work | Read task state + decisions → continue without re-discovery → write back progress |
| **Periodic review** | Summarize recent changes | `get_recent`/`get_history` → read changed files → structured summary |
| **Handoff doc** | Create a briefing | Read sources → synthesize (background, decisions, status, open items) → place in project dir |

---

## Detailed execution steps

### Single-file edit
Search → read target + read 1-2 sibling files for local conventions → apply minimal edit (prefer `update_section` / `update_lines` / `insert_after_heading` over full rewrite) → verify heading/style match → summarize what changed.

### Multi-file routing
Parse unstructured input into discrete semantic units → for each unit: search 2-4 keyword variants to find best-fit file → **present routing table** (content snippet → target file → insertion point) → wait for user confirmation → execute edits one file at a time → summarize all changes with file paths.

### Conversation retrospective
Confirm scope (which session? which topics?) → extract: decisions made, rationale, pitfalls encountered, next actions → for each artifact, find the best existing file via search → route each to the right place → append a one-line change trace per file touched.

### SOP execution
Read the full SOP before starting (never skim) → execute step by step, checking off as you go → if a step is stale or diverges from current KB state, note it → after completion, propose a targeted SOP update for any diverged steps.
**Creating a new SOP** → first read [sop-template.md](./sop-template.md) for required structure.

### Structural changes
`get_backlinks` on the path being changed → present impact report (N files will need updates) → wait for confirmation → execute rename/move/delete → update every backlink → sync affected `README.md` files.

### Handoff / cross-agent continuation
Read the handoff document or last agent's progress notes → identify: current state, decisions already made, open items → continue from that state without re-running discovery already done → write progress back to the same handoff doc when done.
