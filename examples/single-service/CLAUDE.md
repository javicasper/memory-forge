# CLAUDE.md

Project instructions for Claude Code.

## Project Overview

This is a single-service Node.js application with Express.

## Conventions

### Code Style

- Use TypeScript strict mode
- Prefer async/await over callbacks
- Use dependency injection

### Testing

- Unit tests: `*.spec.ts`
- Integration tests: `*.test.ts`
- Run tests: `npm test`

## Key Patterns

### Error Handling

```typescript
// Use custom error classes
throw new NotFoundError(`User ${id} not found`);
```

### Logging

```typescript
// Always use structured logging
logger.info('User created', { userId, email });
```
