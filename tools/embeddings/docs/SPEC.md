# Memory Forge — Indexing and Auditing SPEC

## Objective

Ensure **real and sustainable token savings** in AI agents through:

* A **single source of truth versioned in git**.
* Use of **embeddings as a derived index**, never as source of truth.
* Active prevention of context duplication via autoload.

Key principle:

> **We ignore autoload for embeddings, but we audit it to protect savings.**

---

## Project Structure

```
project/
├── CLAUDE.md              # Minimal stub (autoload)
├── AGENTS.md              # Minimal stub (autoload)
├── .claude/skills/        # Legacy skills (autoload)
├── .codex/                # Legacy skills (autoload)
├── .opencode/             # Legacy skills (autoload)
├── knowledge/             # Source of truth (git)
│   ├── README.md          # Human index
│   └── *.md               # Actual knowledge
└── .memory-forge/         # Local cache (gitignore)
    ├── index.db           # Embeddings (derived)
    └── manifest.json      # File hashes (derived)
```

---

## Indexing Rules

### Root Context Files

`CLAUDE.md` and `AGENTS.md` files at project root are **automatically loaded** by AI agents.

**Rule:**

* ❌ Never indexed for embeddings.
* ⚠️ Always audited.
* 📌 Not source of truth for extensive knowledge.

### Special Directories (.claude / .codex / .opencode)

Some agents introduce hidden directories with knowledge or context that is **automatically loaded**:

* `.claude/`
* `.codex/`
* `.opencode/`

These directories are **considered equivalent** and are part of **agent autoload**.

**Common rule:**

* ❌ Never indexed for embeddings.
* ⚠️ Always audited.
* 📌 Not source of truth.

### What IS Indexed

* ✅ **Only** Markdown files inside `knowledge/**`.

### What is NOT Indexed (but audited)

* ❌ `CLAUDE.md`
* ❌ `AGENTS.md`
* ❌ `.claude/**`
* ❌ `.codex/**`
* ❌ `.opencode/**`

### Source of Truth

* Content in `knowledge/` is the **only source of truth**.
* The embeddings database and `manifest.json` are **derived artifacts, regenerable**.

---

## Autoload Rules

| Location            | Agent autoloads | MCP indexes | Searchable |
|---------------------|-----------------|-------------|------------|
| `CLAUDE.md`         | ✅ Yes          | ❌ No       | ❌ No      |
| `AGENTS.md`         | ✅ Yes          | ❌ No       | ❌ No      |
| `.claude/skills/**` | ✅ Yes          | ❌ No       | ❌ No      |
| `.codex/**`         | ✅ Yes          | ❌ No       | ❌ No      |
| `.opencode/**`      | ✅ Yes          | ❌ No       | ❌ No      |
| `knowledge/**`      | ❌ No           | ✅ Yes      | ✅ Yes     |

---

## Audit Thresholds

### Per File

| File                | Warning      | Critical      |
|---------------------|--------------|---------------|
| `CLAUDE.md`         | > 500 tokens | > 1000 tokens |
| `AGENTS.md`         | > 500 tokens | > 1000 tokens |
| `SKILL.md` (each)   | > 300 tokens | > 600 tokens  |

### Global

| Metric              | Warning       | Critical      |
|---------------------|---------------|---------------|
| Total autoload      | > 2000 tokens | > 5000 tokens |

> Tokens estimated via consistent tokenizer (GPT-2 or similar).

---

## Commands

### `memory-forge index`

**Function:** Incrementally index `knowledge/`.

**Behavior:**

* Computes normalized hash per file.
* If hash unchanged → skip.
* If changed → reindex and remove old chunks.
* If file deleted → remove its chunks from index.

**Output (example):**

```
✓ knowledge/api-patterns.md (unchanged)
↻ knowledge/error-handling.md (reindexed)
✗ knowledge/old-doc.md (removed from index)

Summary: 1 indexed, 1 updated, 1 removed
```

---

### `memory-forge audit`

**Function:** Detect risks of token savings loss.

**Checks:**

* Size of `CLAUDE.md` and `AGENTS.md`.
* Size of files in `.claude/`, `.codex/`, `.opencode/`.
* Total autoload tokens.
* New or modified skills since last audit.
* Files in `knowledge/` not indexed.

**Output (example):**

```
⚠️  Autoload detected:
  - CLAUDE.md: 1,284 tokens (CRITICAL)
  - .claude/skills/payments/SKILL.md: 742 tokens (CRITICAL)

⚠️  Total autoload: 2,981 tokens (WARNING)

ℹ️  Recommendation:
  - Move stable knowledge to knowledge/
  - Reduce CLAUDE.md to stub (< 500 tokens)
```

Does not modify anything. Only reports.

---

### `memory-forge doctor --fix`

**Function:** Apply **opt-in** corrections based on audit.

**Possible actions:**

* Generate recommended stub for `CLAUDE.md`/`AGENTS.md`.
* Copy excess content to `knowledge/legacy/<source>.md`.
* Update `knowledge/README.md` (optional).

**Rules:**

* Never deletes content without explicit confirmation.
* Always preserves original file.

**Output (example):**

```
✓ Stub generated in CLAUDE.md
✓ Legacy content moved to knowledge/legacy/CLAUDE.md
✓ Index updated
```

---

## Normalization and Hashing

Before computing hash:

* Normalize line endings (`\r\n` → `\n`).
* Remove trailing spaces per line.

This avoids unnecessary re-indexing from cosmetic changes.

---

## Edge Cases

### File in knowledge/ moved or renamed

* Treated as: delete + add.
* Old chunks removed by `path`.

### User adds knowledge to CLAUDE.md or AGENTS.md

* Agent always loads it.
* MCP **does not index it**.
* `audit` must warn if it exceeds thresholds.

### New SKILL.md created in .claude/skills/

* Agent always loads it.
* MCP **does not index it**.
* `audit` reports it as new/modified.

### Knowledge without MCP installed

* Repo remains readable and usable by humans.
* `knowledge/README.md` acts as manual index.
* Devs can search with `grep`/`rg` directly.

---

## Golden Rule

> **If something must be semantically searchable and loaded on-demand, it lives in `knowledge/`.**
>
> **If something lives in autoload, it must be small or audited.**

---

## Mental Model

```
┌─────────────────────────────────────────────────────────┐
│                   AUTOLOAD (AI Agents)                   │
│  ┌───────────────────┐ ┌──────────────────────────────┐ │
│  │ CLAUDE.md         │ │ .claude/  .codex/  .opencode/│ │
│  │ AGENTS.md         │ │ skills/                      │ │
│  └───────────────────┘ └──────────────────────────────┘ │
│      ❌ Not indexed │  ⚠️ Audited  │  📌 Not source    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 ON-DEMAND (Memory Forge)                 │
│  ┌─────────────────────────────────────────────────────┐│
│  │                    knowledge/                        ││
│  └─────────────────────────────────────────────────────┘│
│      ✅ Indexed  │  ✅ Searchable │  📌 Source of truth │
└─────────────────────────────────────────────────────────┘
```

This SPEC defines the stable contract for implementing Memory Forge without ambiguities.

---

## Implemented Enhancements

### 1. Automatic Rehash in search_knowledge (v1.1)

`search_knowledge` guarantees the index is up-to-date before searching:

1. Compares hashes of `knowledge/*.md` with `manifest.json`
2. If differences found, reindexes only affected files
3. If no changes, proceeds directly to search

No watchers (fs.watch) are used. Verification is on-demand.
