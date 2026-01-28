# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memory Forge is a **knowledge system**, not a tool. It's a skill (set of instructions in SKILL.md) that teaches AI coding agents how to:
- Recognize when valuable knowledge has been discovered during work sessions
- Decide where knowledge belongs (CLAUDE.md, AGENTS.md, or a new skill)
- Route knowledge correctly in monorepos
- Format knowledge for maximum future retrieval

## Repository Structure

```
.claude/skills/memory-forge/
├── SKILL.md                 # The main skill - core decision framework
└── resources/
    └── skill-template.md    # Template for creating new skills

.opencode/skill/memory-forge/ # Mirror for OpenCode compatibility

examples/
├── monorepo/                # Example monorepo with distributed CLAUDE.md files
└── single-service/          # Example single-service setup
```

## Key Files

- **`.claude/skills/memory-forge/SKILL.md`**: The core skill containing the decision framework, activation triggers, and knowledge extraction process
- **`.opencode/skill/memory-forge/SKILL.md`**: Identical copy for OpenCode compatibility (keep in sync)

## Development Guidelines

This project is documentation-focused. Contributions should improve:
- Decision heuristics for skills vs docs
- Routing logic for monorepos
- Examples of knowledge extraction
- The skill template clarity

Avoid adding complex tooling or CLI-specific features.

## CLI Compatibility

Memory Forge supports multiple AI coding tools through the Agent Skills standard:

| Tool | Context File | Skills Location |
|------|--------------|-----------------|
| Claude Code | CLAUDE.md | .claude/skills/ |
| OpenCode | AGENTS.md (priority) | .opencode/skill/ |
| Codex | AGENTS.md | .codex/skills/ |
| Cursor, Copilot | AGENTS.md | Agent Skills standard |

When updating the skill, update both `.claude/skills/` and `.opencode/skill/` to maintain sync.
