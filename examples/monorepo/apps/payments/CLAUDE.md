# CLAUDE.md - Payments App

Specific instructions for the payments service.

## Overview

Handles payment processing, refunds, and Stripe integration.

## Key Patterns

### Stripe Integration

- Always use webhook signature validation
- Store Stripe customer IDs, not card details
- Use idempotency keys for all payment operations

### Payment States

```
PENDING → PROCESSING → COMPLETED
                    → FAILED
                    → REFUNDED (from COMPLETED)
```

### Error Handling

```typescript
// Use domain-specific errors
throw new PaymentDeclinedError(stripeError.code, stripeError.message);
```

## Testing

```bash
# Run payments tests
npm run test:payments

# Test with Stripe CLI
stripe listen --forward-to localhost:3001/webhooks/stripe
```
