# Memory Forge

> **Embeddings are a derived index. Knowledge lives in git.**

A skill that helps AI agents extract and organize knowledge from work sessions.
Works with Claude Code, OpenCode, Codex, Cursor, and any Agent Skills-compatible tool.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@memory-forge/embeddings.svg)](https://www.npmjs.com/package/@memory-forge/embeddings)

## What is Memory Forge?

Memory Forge is a **skill** (a set of instructions) that teaches AI agents to:

1. **Recognize** when valuable knowledge has been discovered during work
2. **Decide** where that knowledge belongs (CLAUDE.md, AGENTS.md, or a new skill)
3. **Route** knowledge correctly in monorepos (which module's docs?)
4. **Format** knowledge for maximum future retrieval

**It's not another RAG.** It's an architecture for coexisting with autoload context—helping you organize knowledge without bloating every session.

## Quick Start

### The Skill (Core)

The skill is the foundation. Copy it to your project:

```bash
# For Claude Code
mkdir -p .claude/skills/memory-forge
curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/master/SKILL.md \
  -o .claude/skills/memory-forge/SKILL.md

# For OpenCode / Codex / Others
mkdir -p .opencode/skill/memory-forge
curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/master/SKILL.md \
  -o .opencode/skill/memory-forge/SKILL.md
```

That's it. The agent now knows how to extract and route knowledge.

### + MCP Server (Optional Power-Up)

Add semantic search for large knowledge bases:

```bash
claude mcp add memory-forge -- npx -y @memory-forge/embeddings
```

This adds:
- `search_knowledge` - Semantic search (finds "auth errors" when you search "login problems")
- `save_knowledge` - Save knowledge (skills → autoload, context → `knowledge/`)
- `index_knowledge` - Manually trigger reindexing
- `audit_knowledge` - Check token usage in autoload files

**Why optional?** The skill works standalone. The MCP adds ~98% token reduction for projects with large knowledge bases by indexing `knowledge/` separately from autoload files.

### Skill vs MCP

These are **separate installations**. Installing one does not install the other.

| Component | What it does | Installed via |
|-----------|--------------|---------------|
| **Skill** | Teaches the agent *when* and *how* to extract knowledge | `curl ... SKILL.md` |
| **MCP** | Provides tools (`save_knowledge`, `search_knowledge`, `audit_knowledge`) | `claude mcp add ...` |

**What happens in each scenario:**

- **Only Skill** → Agent knows how to extract knowledge, saves to traditional autoload files (CLAUDE.md, `.claude/skills/`)
- **Only MCP** → Tools are available, but agent lacks guidance on when to use them
- **Skill + MCP** → Full experience (recommended). Agent knows when to extract, tools handle where to save and how to search.

### + Auto-Activation Hook (Claude Code only)

Make Claude automatically evaluate every task for extractable knowledge:

```bash
# 1. Copy the hook script
mkdir -p ~/.claude/hooks
curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/master/hooks/memory-forge-activator.sh \
  -o ~/.claude/hooks/memory-forge-activator.sh
chmod +x ~/.claude/hooks/memory-forge-activator.sh

# 2. Add to ~/.claude/settings.json
```

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/memory-forge-activator.sh"
          }
        ]
      }
    ]
  }
}
```

This injects a reminder after each prompt, so Claude evaluates whether the task produced knowledge worth preserving. Without this, you need to manually call `/memory-forge`.

## Usage

After completing a task that required investigation or discovery:

```
/memory-forge
```

Or use natural language:
- "What did we learn from this?"
- "Save this pattern"
- "Extract a skill from this debugging session"

## The Core Decision Framework

```
┌─────────────────────────────────────────────────────────────┐
│ Is there extractable knowledge?                             │
│                                                             │
│ • Did this require non-trivial investigation?               │
│ • Did I discover something not obvious from docs?           │
│ • Would this help someone facing a similar situation?       │
│                                                             │
│ YES to any → Continue                                       │
│ NO to all  → Nothing to extract                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ What type of knowledge is it?                               │
│                                                             │
│ ERROR/WORKAROUND with specific triggers?                    │
│   → Create a SKILL                                          │
│                                                             │
│ ARCHITECTURAL PATTERN or CONVENTION?                        │
│   → Update context file (CLAUDE.md / AGENTS.md)             │
│                                                             │
│ MODULE-SPECIFIC knowledge (monorepo)?                       │
│   → Update that module's context file                       │
│                                                             │
│ PROJECT-WIDE knowledge?                                     │
│   → Update root context file                                │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo Support

Memory Forge understands distributed documentation:

```
/my-monorepo/
├── CLAUDE.md                    ← Project-wide patterns
├── AGENTS.md                    ← Same content, for other tools
├── apps/
│   ├── payments/
│   │   ├── CLAUDE.md            ← Payment-specific patterns
│   │   └── .claude/skills/      ← Payment-specific skills
│   └── notifications/
│       ├── CLAUDE.md            ← Notification patterns
│       └── .claude/skills/      ← Notification skills
```

When working in `apps/payments/`, Memory Forge routes knowledge to the right place.

## Context File Compatibility

Memory Forge works with both standards:

| Standard | Used By | Notes |
|----------|---------|-------|
| **CLAUDE.md** | Claude Code | Original format |
| **AGENTS.md** | Codex, Cursor, Copilot, 60k+ projects | [Linux Foundation standard](https://agents.md/) |

If your project has both, keep them in sync. If it has only one, use that one.

## Skill Template

When Memory Forge creates a skill, it uses this structure:

```markdown
---
name: descriptive-kebab-case-name
description: |
  Clear description for semantic search.
  Use when: [trigger conditions]
  Helps with: [what it solves]
---

# Skill Title

## Problem
What issue does this solve?

## Trigger Conditions
- Specific error message
- Observable symptom

## Solution
Step-by-step instructions...

## Verification
How to confirm it worked...
```

See the full template in [`resources/skill-template.md`](.claude/skills/memory-forge/resources/skill-template.md).

## Inspired By

Memory Forge builds on ideas from:

- **[Claudeception](https://github.com/blader/Claudeception)** - Autonomous skill extraction
- **[Claude-Reflect](https://github.com/BayramAnnakov/claude-reflect)** - Correction capture to CLAUDE.md/AGENTS.md
- **[Voyager](https://arxiv.org/abs/2305.16291)** - Skill libraries for AI agents
- **[AGENTS.md](https://agents.md/)** - Open standard under the Linux Foundation

## What Memory Forge Adds

1. **Monorepo-native** - Routes knowledge to the correct module's docs
2. **CLI-agnostic** - Works with any tool that supports Agent Skills
3. **Decision framework** - Clear rules for skills vs docs

## Architecture Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│  AUTOLOAD (always in context)     │  INDEXED (on-demand)   │
├───────────────────────────────────┼────────────────────────┤
│  CLAUDE.md                        │  knowledge/*.md        │
│  AGENTS.md                        │                        │
│  .claude/skills/                  │                        │
│  .opencode/skill/                 │                        │
├───────────────────────────────────┼────────────────────────┤
│  ~500-2000 tokens (stub)          │  Unlimited (searched)  │
│  Every session                    │  Only when relevant    │
└───────────────────────────────────┴────────────────────────┘
```

**Key insight:** Autoload files are already loaded every session. Indexing them would duplicate tokens. Instead:
- Keep autoload files **small** (stubs, pointers)
- Put detailed knowledge in `knowledge/`
- Search semantically when needed

**What goes where:**
- `save_knowledge(type=skill)` → `.claude/skills/` and `.opencode/skill/` (autoload, never indexed)
- `save_knowledge(type=context)` → `knowledge/` (indexed, searchable)

Skills are procedures the agent needs *before* acting. They must be in autoload, not searched on-demand.

The MCP's `audit_knowledge` tool helps monitor autoload bloat.

## License

MIT
