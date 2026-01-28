# Memory Forge

A knowledge system that teaches AI coding agents how to learn from work sessions and forge that knowledge into permanent memory.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Memory Forge?

Memory Forge is **not a tool** - it's a **skill** (a set of instructions) that teaches AI agents to:

1. **Recognize** when valuable knowledge has been discovered
2. **Decide** where that knowledge belongs (CLAUDE.md, AGENTS.md, or a new skill)
3. **Route** knowledge correctly in monorepos (which module's docs?)
4. **Format** knowledge for maximum future retrieval

## Quick Start

Copy the skill to your project:

```bash
# For Claude Code
mkdir -p .claude/skills
curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/main/.claude/skills/memory-forge/SKILL.md \
  -o .claude/skills/memory-forge/SKILL.md

# For OpenCode (also reads .claude/skills/)
mkdir -p .opencode/skill
curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/main/.claude/skills/memory-forge/SKILL.md \
  -o .opencode/skill/memory-forge/SKILL.md
```

That's it. The skill is now available.

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

## License

MIT
