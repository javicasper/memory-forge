# Contributing to Memory Forge

Memory Forge is a **knowledge system**, not a tool. Contributions should focus on improving the knowledge and decision framework, not on building complex tooling.

## How to Contribute

### Improving the Core Skill

The main skill is in `.claude/skills/memory-forge/SKILL.md`. Improvements could include:

- Better decision heuristics for skills vs docs
- Clearer routing logic for monorepos
- Additional examples of knowledge extraction
- Edge cases we haven't considered

### Adding Examples

Examples help users understand patterns. Good examples show:

- Monorepo structures with distributed CLAUDE.md/AGENTS.md
- Module-specific skills that only load in context
- Real-world knowledge extraction scenarios

### Improving the Skill Template

The template in `resources/skill-template.md` guides skill creation. Make it clearer, add better examples, or improve the structure.

## What NOT to Contribute

- Complex installers or tooling
- CLI-specific features that fragment the project
- Features that don't directly improve knowledge capture

## Pull Request Process

1. Fork and create a feature branch
2. Make your changes
3. Ensure the skill still reads well as documentation
4. Submit PR with clear description of what knowledge you're adding

## Philosophy

The best contribution is **better knowledge**, not more code.
