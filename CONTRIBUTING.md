# Contributing to Memory Forge

Thank you for your interest in contributing to Memory Forge! This document provides guidelines for contributing.

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Use clear, descriptive titles
- Include steps to reproduce for bugs
- Include Claude Code version and OS

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the use case and expected behavior
- Consider how it affects both single-repo and monorepo setups

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test in both single-repo and monorepo scenarios
5. Commit with clear messages: `feat: add monorepo detection`
6. Push and create a Pull Request

## Development Guidelines

### Skill Development

When modifying the main skill (`SKILL.md`):

- Keep instructions clear and actionable
- Test the decision tree with various scenarios
- Ensure monorepo routing logic is correct
- Update examples if behavior changes

### Hook Development

When modifying the activation hook:

- Keep output concise (Claude's context is limited)
- Ensure cross-platform compatibility (bash)
- Test with different shell configurations

### Documentation

- Update README.md for user-facing changes
- Add examples for new features
- Keep the skill template up to date

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on the technical merits

## Questions?

Open an issue with the `question` label or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
