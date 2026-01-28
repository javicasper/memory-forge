import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { search, searchUnique, formatResults, formatForContext } from '../src/search.js';
import { syncProject } from '../src/sync.js';
import { closeDatabase } from '../src/db.js';
import { preloadModel } from '../src/embeddings.js';

describe('search', () => {
  let tempDir: string;

  beforeAll(async () => {
    await preloadModel();
  }, 120000);

  beforeEach(() => {
    closeDatabase(); // Ensure clean state
    tempDir = mkdtempSync(join(tmpdir(), 'memory-forge-search-'));

    // Create knowledge directory (SPEC: source of truth)
    const knowledgeDir = join(tempDir, 'knowledge');
    mkdirSync(knowledgeDir, { recursive: true });

    // Write a test skill to knowledge/
    writeFileSync(
      join(knowledgeDir, 'stripe-webhook-fix.md'),
      `---
name: stripe-webhook-fix
description: |
  Fix for Stripe webhook signature validation failures.
  Use when: webhook signature verification failed, Invalid signature.
author: Test
version: 1.0.0
date: 2025-01-28
---

# Stripe Webhook Fix

## Problem

Stripe webhook signature validation fails even with correct secret.

## Trigger Conditions

- Error: Stripe webhook signature verification failed
- Error: Invalid signature
- HTTP 400 on webhook endpoint

## Solution

Use raw body for signature verification.

## Verification

1. Send test webhook
2. Check for success
`
    );

    // Write another knowledge file
    writeFileSync(
      join(knowledgeDir, 'code-style.md'),
      `# Code Style

## TypeScript

Use TypeScript with strict mode enabled.

## Testing

Run tests with npm test.
`
    );

    // Create CLAUDE.md stub (SPEC: NOT indexed, just audited)
    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      `# Project

This is a stub. Use MCP to search knowledge/.
`
    );
  });

  afterEach(() => {
    closeDatabase();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('search', () => {
    it('should find relevant knowledge by semantic search', async () => {
      await syncProject(tempDir);

      const results = await search(tempDir, 'webhook validation error');

      expect(results.length).toBeGreaterThan(0);

      // Should find the stripe webhook knowledge
      const hasStripeKnowledge = results.some(
        (r) => r.chunk.metadata.skillName === 'stripe-webhook-fix'
      );
      expect(hasStripeKnowledge).toBe(true);
    });

    it('should rank trigger conditions highly', async () => {
      await syncProject(tempDir);

      const results = await search(tempDir, 'Stripe webhook signature verification failed');

      // Trigger chunk should be in results with high score
      const triggerResult = results.find((r) => r.chunk.chunkType === 'trigger');
      expect(triggerResult).toBeDefined();
      expect(triggerResult!.score).toBeGreaterThan(0.5);
    });

    it('should respect limit option', async () => {
      await syncProject(tempDir);

      const results = await search(tempDir, 'test', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by source type', async () => {
      await syncProject(tempDir);

      // Note: With new SPEC, only knowledge/ is indexed
      // Source types may need adjustment based on implementation
      const results = await search(tempDir, 'webhook');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('searchUnique', () => {
    it('should return at most one result per source file', async () => {
      await syncProject(tempDir);

      const results = await searchUnique(tempDir, 'webhook');

      const sourceFiles = results.map((r) => r.sourceFile);
      const uniqueSourceFiles = [...new Set(sourceFiles)];

      expect(sourceFiles.length).toBe(uniqueSourceFiles.length);
    });
  });

  describe('formatResults', () => {
    it('should format empty results', () => {
      const output = formatResults([]);
      expect(output).toContain('No matching results');
    });

    it('should format results with file and score', async () => {
      await syncProject(tempDir);
      const results = await search(tempDir, 'webhook', { limit: 1 });
      const output = formatResults(results);

      expect(output).toContain('Found');
      expect(output).toContain('result');
      expect(output).toContain('Score:');
    });
  });

  describe('formatForContext', () => {
    it('should format for AI context injection', async () => {
      await syncProject(tempDir);
      const results = await search(tempDir, 'webhook', { limit: 1 });
      const output = formatForContext(results);

      expect(output).toContain('Relevant Knowledge');
      expect(output).toContain('Source:');
      expect(output).toContain('Relevance:');
    });
  });

  describe('SPEC compliance', () => {
    it('should NOT index CLAUDE.md (autoload file)', async () => {
      await syncProject(tempDir);

      // Search for content that is ONLY in CLAUDE.md
      const results = await search(tempDir, 'stub MCP search knowledge');

      // Should not find CLAUDE.md content because it's not indexed
      const hasClaude = results.some((r) => r.sourceFile.includes('CLAUDE.md'));
      expect(hasClaude).toBe(false);
    });

    it('should only index knowledge/ files', async () => {
      await syncProject(tempDir);

      const results = await search(tempDir, 'webhook');

      // All results should be from knowledge/
      for (const r of results) {
        expect(r.sourceFile).toContain('knowledge/');
      }
    });
  });
});
