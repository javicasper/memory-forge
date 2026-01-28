# Memory Forge

A **CLI-agnostic** continuous learning system that forges knowledge from work sessions into permanent memory. Works with **Claude Code, OpenCode, Codex, Cursor, GitHub Copilot**, and any tool supporting the [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) standard.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Supported Tools

| Tool | Context File | Status |
|------|--------------|--------|
| [Claude Code](https://claude.ai/code) | CLAUDE.md | ✅ Full support |
| [OpenCode](https://opencode.ai/) | AGENTS.md / CLAUDE.md | ✅ Full support |
| [Codex (OpenAI)](https://openai.com/codex) | AGENTS.md | ✅ Full support |
| [Cursor](https://cursor.sh/) | AGENTS.md | ✅ Full support |
| [GitHub Copilot](https://github.com/features/copilot) | AGENTS.md | ✅ Full support |
| [Gemini CLI](https://ai.google.dev/) | AGENTS.md | ✅ Full support |

> **Note**: Memory Forge uses the universal [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) standard (SKILL.md) which is supported by 14+ tools. For context files, it detects and updates both CLAUDE.md and AGENTS.md as needed.

## What Makes Memory Forge Different?

While other learning systems focus solely on creating skills, Memory Forge understands that **knowledge lives in different places**:

| Knowledge Type | Where It Goes | Example |
|----------------|---------------|---------|
| **Patterns & Architecture** | CLAUDE.md files | "Always use Libio3 for HTTP requests" |
| **Workarounds & Fixes** | Skills | "Fix for MongoDB connection pool exhaustion" |
| **Project-wide conventions** | Root CLAUDE.md | "Commit message format: type(scope): desc" |
| **Module-specific patterns** | Distributed CLAUDE.md | "Booking app uses 14 bounded contexts" |

### Key Features

- **Smart Routing**: Automatically decides whether to update CLAUDE.md or create a skill
- **Monorepo Support**: Detects which app/module you're working in and updates the right CLAUDE.md
- **Context-Aware**: Uses directory structure to determine the appropriate documentation location
- **Distributed CLAUDE.md**: Supports hierarchical documentation that loads based on working directory
- **Non-Invasive**: Only activates when genuinely valuable knowledge is discovered

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/memory-forge.git

# Run the installer
cd memory-forge
./install.sh
```

Or manually copy to your project:

```bash
# Copy to your project's .claude directory
cp -r memory-forge/.claude/skills/memory-forge /path/to/your/project/.claude/skills/
cp memory-forge/.claude/hooks/memory-forge-activator.sh /path/to/your/project/.claude/hooks/

# Add hook to your .claude/settings.json
```

### Configuration

Add the hook to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/memory-forge-activator.sh"
          }
        ]
      }
    ]
  }
}
```

## How It Works

### 1. Continuous Evaluation

After each task, Memory Forge evaluates whether the work produced extractable knowledge:

```
┌─────────────────────────────────────────────────────────┐
│  Did this task require:                                 │
│  • Non-trivial investigation or debugging?              │
│  • Discovery of something not obvious from docs?        │
│  • A workaround or pattern that would help others?      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  YES → Extract        │
              │  NO  → Skip           │
              └───────────────────────┘
```

### 2. Smart Routing Decision

When knowledge is worth extracting, Memory Forge decides the best destination:

```
┌─────────────────────────────────────────────────────────┐
│  Is this knowledge:                                     │
│                                                         │
│  A) A reusable fix/workaround with clear triggers?      │
│     → Create a SKILL                                    │
│                                                         │
│  B) An architectural pattern or convention?             │
│     → Update CLAUDE.md                                  │
│                                                         │
│  C) Specific to a module/app in a monorepo?             │
│     → Update the module's CLAUDE.md                     │
│                                                         │
│  D) Project-wide knowledge?                             │
│     → Update root CLAUDE.md                             │
└─────────────────────────────────────────────────────────┘
```

### 3. Context Detection (Monorepos)

For monorepos, Memory Forge detects your working context for both **CLAUDE.md files** and **skills**:

```
/my-monorepo/
├── CLAUDE.md                    ← Project-wide patterns (always loaded)
├── .claude/
│   └── skills/
│       └── shared-skill/        ← Project-wide skills (always loaded)
├── apps/
│   ├── api/
│   │   ├── CLAUDE.md            ← API-specific patterns
│   │   └── .claude/
│   │       └── skills/
│   │           └── api-auth/    ← Only when working in apps/api/
│   ├── web/
│   │   ├── CLAUDE.md            ← Web app patterns
│   │   └── .claude/
│   │       └── skills/
│   │           └── ssr-caching/ ← Only when working in apps/web/
│   └── worker/
│       └── CLAUDE.md            ← Worker service patterns
└── libs/
    └── shared/
        └── CLAUDE.md            ← Shared library patterns
```

**Key insight**: Claude Code automatically discovers skills from nested `.claude/skills/` directories when you work with files in those subdirectories. This means module-specific skills only load when relevant!

When you're working in `apps/api/`:
- `apps/api/CLAUDE.md` loads automatically
- `apps/api/.claude/skills/*` becomes available
- Root `.claude/skills/*` is also available

## Usage

### Automatic Mode (Recommended)

The hook reminds you to evaluate learning opportunities. After completing a task:

1. Ask yourself the evaluation questions
2. If YES to any, invoke: `/memory-forge`
3. Memory Forge will guide you through extraction

### Manual Invocation

```
/memory-forge                    # Review session and extract knowledge
/memory-forge skill              # Force creation of a new skill
/memory-forge update-docs        # Force update to CLAUDE.md
```

### Natural Language

You can also use natural language:

- "What did we learn from this?"
- "Save this pattern"
- "Extract a skill from this debugging session"
- "Update the docs with this convention"

## Monorepo Setup

For monorepos, create distributed CLAUDE.md files **and** distributed skills:

### Distributed Skills (Module-Specific)

Skills placed in module subdirectories only load when working in that module:

```bash
# Project-wide skills (always available)
.claude/skills/
├── memory-forge/           # The learning system itself
└── coding-standards/       # Project-wide conventions

# Module-specific skills (load on-demand)
apps/payments/.claude/skills/
├── stripe-webhooks/        # Only when working in payments
└── refund-processing/      # Only when working in payments

apps/notifications/.claude/skills/
├── email-templates/        # Only when working in notifications
└── push-notification-ios/  # Only when working in notifications
```

**How it works**: Claude Code automatically discovers skills from nested `.claude/skills/` directories when you edit files in those paths. This prevents context bloat from loading irrelevant skills.

### When Memory Forge Creates Module Skills

Memory Forge routes knowledge to the right location:

| Knowledge Type | Destination |
|----------------|-------------|
| Project-wide convention | Root `.claude/skills/` or root `CLAUDE.md` |
| Module-specific workaround | Module's `.claude/skills/` |
| Module architecture pattern | Module's `CLAUDE.md` |

### 1. Root CLAUDE.md

Contains project-wide conventions:

```markdown
# CLAUDE.md

> **Note**: This monorepo uses distributed CLAUDE.md files.
> App-specific docs load automatically when working in those directories.

## Project-Wide Conventions

- Use TypeScript strict mode
- All HTTP requests must use the internal HTTP client
- Commit format: type(scope): description
```

### 2. App/Module CLAUDE.md

Contains module-specific patterns:

```markdown
# CLAUDE.md - API Service

Specific instructions for the API service.

## Bounded Contexts

- Users: Authentication and authorization
- Orders: Order processing and fulfillment
- Payments: Payment processing

## Patterns

- All endpoints use DTOs for request/response
- Repository pattern for data access
```

### 3. Configure Memory Forge

Create `.claude/skills/memory-forge/config.json`:

```json
{
  "monorepo": {
    "enabled": true,
    "structure": {
      "apps": "apps/*/CLAUDE.md",
      "libs": "libs/*/CLAUDE.md",
      "root": "CLAUDE.md"
    }
  }
}
```

## Skill Template

When Memory Forge creates a skill, it uses this structure:

```markdown
---
name: descriptive-name-in-kebab-case
description: |
  Clear description for semantic search.
  Use when: [trigger conditions]
  Helps with: [what it solves]
author: Memory Forge
version: 1.0.0
date: YYYY-MM-DD
---

# Skill Title

## Problem

What issue does this solve?

## Trigger Conditions

- Specific error message
- Observable symptom
- Environment condition

## Solution

Step-by-step instructions...

## Verification

How to confirm it worked...

## Example

Before/after code...

## Notes

Caveats, related skills, limitations...
```

## Cross-Tool Compatibility

### The Context File Problem

Different AI coding tools use different context files:

- **CLAUDE.md**: Used by Claude Code (Anthropic)
- **AGENTS.md**: Used by Codex, Cursor, Copilot, and [60,000+ projects](https://agents.md/)

Both are now under the [Agentic AI Foundation (AAIF)](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) within the Linux Foundation.

### Memory Forge Solution

Memory Forge automatically detects and updates the appropriate file(s):

```
Project has only CLAUDE.md?  → Updates CLAUDE.md
Project has only AGENTS.md?  → Updates AGENTS.md
Project has both?            → Updates BOTH (keeps them in sync)
Project has neither?         → Creates based on your primary tool
```

### Sync Script

For teams using multiple tools, use the sync script:

```bash
# Keep CLAUDE.md and AGENTS.md in sync
./scripts/sync-context-files.sh

# Add to pre-commit hook for automatic sync
echo './scripts/sync-context-files.sh' >> .git/hooks/pre-commit
```

### Skills Are Universal

The good news: **SKILL.md files are universal**. The [Agent Skills standard](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) works across all major tools:

- Claude Code: `.claude/skills/*/SKILL.md`
- OpenCode: `.opencode/skill/*/SKILL.md` + `.claude/skills/*/SKILL.md`
- Codex: Agent Skills standard
- Cursor, Copilot: Agent Skills standard

Memory Forge creates skills that work everywhere.

## Research Background

Memory Forge builds on academic research in AI learning systems:

- **[Voyager](https://arxiv.org/abs/2305.16291)** (Wang et al., 2023): Demonstrated skill libraries for game-playing agents
- **[CASCADE](https://arxiv.org/abs/2407.00170)** (2024): Introduced "meta-skills" concept
- **[SEAgent](https://arxiv.org/abs/2501.00000)** (2025): Learning through trial and error
- **[Reflexion](https://arxiv.org/abs/2303.11366)** (Shinn et al., 2023): Self-reflection improves agent performance

## Related Projects

- [Claudeception](https://github.com/blader/Claudeception) - Autonomous skill extraction
- [Claude-Reflect](https://github.com/BayramAnnakov/claude-reflect) - Captures corrections to CLAUDE.md
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills) - Curated skill collection

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Inspired By

Memory Forge builds on ideas from these excellent projects:

### Learning Systems

- **[Claudeception](https://github.com/blader/Claudeception)** by [@blader](https://github.com/blader) - The original autonomous skill extraction system for Claude Code. Pioneered the concept of "skills that create skills" and inspired our extraction logic.

- **[Claude-Reflect](https://github.com/BayramAnnakov/claude-reflect)** by [@BayramAnnakov](https://github.com/BayramAnnakov) - Introduced the pattern of capturing corrections and syncing to both CLAUDE.md and AGENTS.md. Inspired our cross-tool compatibility approach.

- **[Claude-Reflect-System](https://github.com/haddock-development/claude-reflect-system)** by [@haddock-development](https://github.com/haddock-development) - Combined skill creation with correction learning. Influenced our decision framework.

### Research & Standards

- **[Voyager](https://arxiv.org/abs/2305.16291)** (Wang et al., 2023) - Demonstrated skill libraries for game-playing agents, proving that agents can build reusable knowledge over time.

- **[CASCADE](https://arxiv.org/abs/2407.00170)** (2024) - Introduced "meta-skills" (skills for acquiring skills), which inspired automatic skill extraction.

- **[Reflexion](https://arxiv.org/abs/2303.11366)** (Shinn et al., 2023) - Showed that self-reflection improves agent performance, influencing our evaluation protocol.

- **[AGENTS.md Standard](https://agents.md/)** - The open standard under the [Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) (Linux Foundation) that enables cross-tool compatibility.

- **[Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)** by Anthropic - The open standard for portable skills across AI coding tools.

### Resources

- **[Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)** - Curated collection of Claude Code skills
- **[Claude Code Skills Deep Dive](https://mikhail.io/2025/10/claude-code-skills/)** - Technical analysis of skills architecture
- **[CLAUDE.md in Monorepos](https://github.com/shanraisshan/claude-code-best-practice)** - Best practices for distributed documentation

## What Memory Forge Adds

While standing on the shoulders of these projects, Memory Forge contributes:

1. **Monorepo-native design** - First-class support for distributed CLAUDE.md/AGENTS.md and module-specific skills
2. **True CLI agnosticism** - Works identically across Claude Code, OpenCode, Codex, Cursor, and others
3. **Automatic context file sync** - Keeps CLAUDE.md and AGENTS.md in sync for mixed-tool teams
4. **Smart routing** - Decides whether knowledge belongs in docs or skills, and which module's docs

## Acknowledgments

- Anthropic for Claude Code and the Agent Skills standard
- OpenAI for AGENTS.md and contributing it to the Linux Foundation
- The Agentic AI Foundation for stewarding open standards
- All the developers who built and shared the projects above
