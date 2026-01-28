# CLAUDE.md

Project instructions for Claude Code in this monorepo.

> **Note**: This monorepo uses distributed CLAUDE.md files. App-specific docs load automatically when working in those directories:
> - `apps/payments/CLAUDE.md` - Payment processing, Stripe integration
> - `apps/notifications/CLAUDE.md` - Email, SMS, push notifications
> - `libs/shared/CLAUDE.md` - Shared utilities and types

## Project-Wide Conventions

### Commit Messages

```
type(scope): description

Types: feat, fix, refactor, chore, docs, test
Scope: app or lib name (payments, notifications, shared)
```

### Code Organization

All apps follow DDD structure:
```
src/
├── domain/         # Entities, value objects, interfaces
├── application/    # Use cases, services
└── infrastructure/ # Controllers, repositories, external APIs
```

### Testing

- Unit tests: `*.spec.ts` (alongside source)
- Integration tests: `*.test.ts` (alongside source)

## Build Commands

```bash
npm run build           # Build all apps
npm run build:payments  # Build specific app
npm run test            # Run all tests
```
