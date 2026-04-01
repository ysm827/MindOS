---
name: mindos
description: >
  Operate a MindOS knowledge base: update notes, search, organize files, execute SOPs/workflows,
  retrospective, append CSV, cross-agent handoff, route unstructured input to the right files,
  distill experience, sync related docs. 更新笔记, 搜索知识库, 整理, 执行SOP, 复盘, 追加CSV, 交接, 路由到文件, 提炼经验.
  Use when the task targets files inside the user's MindOS KB (mindRoot).
  NOT for editing app source, project docs, or paths outside the KB.
  Core concepts: Space, Instruction (INSTRUCTION.md), Skill (SKILL.md); notes can embody both.
---

# MindOS Skill

<!-- version: 1.3.1 -->

**Before every task, internalize these 5 rules:**

1. The **bootstrap directory tree is the primary index** — reason from names and hierarchy before calling search. Most questions can be answered by reading what's already in context.
2. **Default to read-only.** Only invoke write tools when the user explicitly asks to save, record, organize, or edit. Lookup / summarize / quote = no writes.
3. **Rule precedence** (highest wins): user's current-turn instruction → `user-skill-rules.md` → nearest directory `INSTRUCTION.md` → root `INSTRUCTION.md` → this SKILL's defaults.
4. **Multi-file edits require a plan first.** Present the full change list; execute only after approval.
5. After create/delete/move/rename → **sync affected READMEs** automatically.

---

## NEVER do (hard-won pitfalls)

- **NEVER write to the KB root** unless the user explicitly says so. Root is for governance files only (`README.md`, `INSTRUCTION.md`, `CONFIG`). New content goes under the most semantically fitting subdirectory.
- **NEVER assume directory names.** Don't hardcode `Workflows/`, `Projects/`, `Contacts/` — always infer from the bootstrap tree you actually received. The user's KB may use Chinese names, flat layout, or unconventional hierarchy.
- **NEVER use `mindos_write_file` for a small edit.** Use `update_section`, `update_lines`, or `insert_after_heading` — full-file rewrites destroy git diffs and make changes unauditable.
- **NEVER search with a single keyword.** Always fire 2-4 parallel searches (synonyms, abbreviations, Chinese/English variants). One keyword misses too much.
- **NEVER modify `INSTRUCTION.md` or `README.md` without confirmation.** These are governance docs — treat as high-sensitivity even for trivial-looking typo fixes.
- **NEVER create a file without checking siblings first.** Read at least 1-2 files in the target directory to learn local naming, heading style, and CSV schema. Inventing a new convention is a common cause of inconsistency.
- **NEVER leave orphan references.** After any rename/move, run `get_backlinks` and update every referring file. Missing this is the #1 source of broken links in a KB.
- **NEVER skip the routing confirmation for multi-file writes.** Even when the destinations seem obvious — the user's mental model may differ from yours.

---

## MindOS concepts

- **Space** — Knowledge partitions organized the way you think. Agents follow the same structure.
- **Instruction** — A rules file all connected agents obey. Written once, enforced everywhere.
- **Skill** — Teaches agents how to read, write, and organize the KB. Agents execute installed Skills, not guesses.

**Notes as Instruction and Skill** — `INSTRUCTION.md` and `SKILL.md` are just Markdown files in the tree. A note can be free-form text, governance rules agents must follow, or a procedure package agents execute.

---

## Thinking framework

Before acting, ask yourself:

1. **What is the user's intent category?** → read-only lookup | single-file edit | multi-file routing | structural change | SOP execution. This determines which path to take below.
2. **Where does this content belong?** → Scan the directory tree. If you can't place it in <5 seconds of looking at names, the user probably needs to confirm.
3. **What already exists nearby?** → Read 1-2 sibling files before writing. Match their style.
4. **What will break if I change this?** → For renames/moves: `get_backlinks`. For content edits: think about who else cites this fact.
5. **Am I being asked, or am I volunteering?** → If the user didn't ask you to write, don't write.

---

## Task routing decision tree

```
User request
  │
  ├─ Only asks to look up / summarize / quote?
  │   └─ YES → [Read-only path]: search + read + cite sources. No writes. Skip hooks.
  │
  └─ Any write / organize / SOP / structural intent?
      └─ YES → Read references/write-supplement.md FIRST, then proceed.
               (covers: startup protocol, write tools, all write execution patterns)
```

---

## Tool selection — discovery & read

| Intent | Best tool | Avoid |
|--------|-----------|-------|
| Load context at start | `mindos_bootstrap` | Reading random files without bootstrap |
| List top-level Mind Spaces | `mindos_list_spaces` | Full `mindos_list_files` when you only need zone names and README blurbs |
| Find files | `mindos_search_notes` (2-4 parallel keyword variants) | Single-keyword search |
| Read content | `mindos_read_file` or `mindos_read_lines` (for large files) | Reading entire large file when you need 10 lines |

### Fallbacks

- `mindos_bootstrap` unavailable → manual reads of root `INSTRUCTION.md` + `README.md`.
- Search returns empty → don't give up: (1) scan tree in context, (2) read candidate files directly, (3) `mindos_list_files` on specific subdirectories, (4) try synonym/alternate-language keywords.

---

## Execution pattern — read-only Q&A

Tree reasoning → search → read → answer with file citations → state gaps explicitly.

---

## Interaction rules

- **Ambiguous request?** Ask first. Propose 2-3 options based on KB state (recent changes, directory structure). Never start reorganizing without understanding scope.
- **Cite sources.** Every fact from the KB gets a file path so the user can verify.
- **Brevity first.** Show the most likely match, not an exhaustive list.

---

## Post-task hooks

After **write tasks**, read [references/post-task-hooks.md](./references/post-task-hooks.md) for one-line follow-up proposals (experience capture, consistency sync, SOP drift, etc.).
**Read-only tasks: skip hooks.** If the user asked for quiet mode, skip all hooks for the session.
**Do NOT read** post-task-hooks for simple single-file edits or read-only lookups.

## Preference capture

When the user expresses a standing preference ("don't do X", "always put Y in Z"), read [references/preference-capture.md](./references/preference-capture.md) and follow the confirm-then-write flow to `user-skill-rules.md`.
**Do NOT read** preference-capture unless the user actually expressed a preference to persist.

## SOP authoring

When creating or rewriting a workflow SOP, **MANDATORY — read [references/sop-template.md](./references/sop-template.md)** for required structure (prerequisites, steps with branches, exit conditions, pitfall log).
**Do NOT read** sop-template for SOP execution (only for SOP creation/editing).
