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

    // Create skill directory structure
    const skillDir = join(tempDir, '.claude', 'skills', 'test-skill');
    mkdirSync(skillDir, { recursive: true });

    // Write a test skill
    writeFileSync(
      join(skillDir, 'SKILL.md'),
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

    // Write a CLAUDE.md
    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      `# CLAUDE.md

## Code Style

Use TypeScript with strict mode enabled.

## Testing

Run tests with npm test.
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
    it('should find relevant skills by semantic search', async () => {
      await syncProject(tempDir);

      const results = await search(tempDir, 'webhook validation error');

      expect(results.length).toBeGreaterThan(0);

      // Should find the stripe webhook skill
      const hasStripeSkill = results.some(
        (r) => r.chunk.metadata.skillName === 'stripe-webhook-fix'
      );
      expect(hasStripeSkill).toBe(true);
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

      const skillResults = await search(tempDir, 'test', { sourceTypes: ['skill'] });
      const claudeResults = await search(tempDir, 'test', { sourceTypes: ['claude-md'] });

      for (const r of skillResults) {
        expect(r.chunk.sourceType).toBe('skill');
      }
      for (const r of claudeResults) {
        expect(r.chunk.sourceType).toBe('claude-md');
      }
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
});
