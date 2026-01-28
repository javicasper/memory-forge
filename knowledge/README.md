# Knowledge Base

This directory contains the project's indexable knowledge.

## Structure

```
knowledge/
├── README.md          # This file (human index)
├── <topic>.md         # Documentation by topic
└── <subdirs>/         # Organization by area (optional)
```

## How It Works

- `.md` files here are indexed by Memory Forge
- They can be searched semantically via MCP
- This is the **only source of truth** for searchable knowledge

## Without MCP Installed

If you don't have MCP, you can search manually:

```bash
# Search by keyword
rg "your-search" knowledge/

# List all topics
ls knowledge/
```

## Conventions

- One file per topic/area
- Clear titles with `# Heading`
- Sections with `## Subheading`
- TL;DR at the beginning of each document

## Files NOT Indexed

The following files are automatically loaded by the agent (autoload) and are **not** indexed here:

- `CLAUDE.md` - Project stub
- `AGENTS.md` - Stub for other agents
- `.claude/skills/` - Legacy skills
- `.opencode/skill/` - Legacy skills
