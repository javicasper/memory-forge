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
SKILL.md                      # The main skill (canonical location)
hooks/
└── memory-forge-activator.sh # Auto-activation hook for Claude Code
.claude/skills/memory-forge/
└── SKILL.md → ../../../SKILL.md  # Symlink for Claude Code
.opencode/skill/memory-forge/
└── SKILL.md → ../../../SKILL.md  # Symlink for OpenCode

examples/
├── monorepo/                # Example monorepo with distributed CLAUDE.md files
└── single-service/          # Example single-service setup
```

## Key Files

- **`SKILL.md`**: The core skill containing the decision framework, activation triggers, and knowledge extraction process (canonical location at project root)
- **`.claude/skills/memory-forge/SKILL.md`**: Symlink for Claude Code compatibility
- **`.opencode/skill/memory-forge/SKILL.md`**: Symlink for OpenCode compatibility

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

The skill symlinks point to the canonical `SKILL.md` at the project root, so updates only need to be made in one place.
