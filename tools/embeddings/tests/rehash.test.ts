/**
 * Tests for Automatic Rehash in search_knowledge
 *
 * According to specification:
 * - search_knowledge must guarantee index is up-to-date before searching
 * - Hashes of knowledge/*.md are compared with manifest.json
 * - If differences found, only affected files are reindexed
 * - No watchers (fs.watch) are used
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { search } from '../src/search.js';
import { syncProject } from '../src/sync.js';
import { closeDatabase } from '../src/db.js';
import { preloadModel } from '../src/embeddings.js';

describe('Rehash automático en search_knowledge', () => {
  let tempDir: string;

  beforeAll(async () => {
    await preloadModel();
  }, 120000);

  beforeEach(() => {
    closeDatabase();
    tempDir = mkdtempSync(join(tmpdir(), 'memory-forge-rehash-'));

    // Create knowledge/ with an initial file
    const knowledgeDir = join(tempDir, 'knowledge');
    mkdirSync(knowledgeDir, { recursive: true });

    writeFileSync(
      join(knowledgeDir, 'test-doc.md'),
      `# Test Document

## Original Content

This is the original content about API errors.
`
    );
  });

  afterEach(() => {
    closeDatabase();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('reindexes when knowledge changes', () => {
    it('should reindex when knowledge file is modified', async () => {
      // Index initially
      await syncProject(tempDir);

      // Search for original content
      const resultsBefore = await search(tempDir, 'original content API');
      expect(resultsBefore.length).toBeGreaterThan(0);
      expect(resultsBefore.some(r => r.chunk.content.includes('original'))).toBe(true);

      // Modify the file
      writeFileSync(
        join(tempDir, 'knowledge/test-doc.md'),
        `# Test Document

## Updated Content

This is the UPDATED content about database migrations.
`
      );

      // Search for new content (should reindex automatically)
      const resultsAfter = await search(tempDir, 'database migrations');

      // Should find updated content
      expect(resultsAfter.length).toBeGreaterThan(0);
      expect(resultsAfter.some(r => r.chunk.content.includes('UPDATED') || r.chunk.content.includes('database'))).toBe(true);
    });

    it('should update manifest.json after reindex', async () => {
      // Index initially
      await syncProject(tempDir);

      // Read original manifest
      const manifestPath = join(tempDir, '.memory-forge/manifest.json');
      const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const hashBefore = manifestBefore.files[join(tempDir, 'knowledge/test-doc.md')];

      // Modify file
      writeFileSync(
        join(tempDir, 'knowledge/test-doc.md'),
        `# Modified Content\n\nCompletely different text.`
      );

      // Execute search (trigger rehash)
      await search(tempDir, 'different text');

      // Verify manifest updated
      const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const hashAfter = manifestAfter.files[join(tempDir, 'knowledge/test-doc.md')];

      expect(hashAfter).not.toBe(hashBefore);
    });
  });

  describe('does not reindex if no changes', () => {
    it('should not reindex when knowledge is unchanged', async () => {
      // Index initially
      await syncProject(tempDir);

      // Read manifest
      const manifestPath = join(tempDir, '.memory-forge/manifest.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const lastIndexedBefore = manifestData.lastIndexed;

      // Small pause to ensure different timestamp if reindex occurred
      await new Promise(resolve => setTimeout(resolve, 100));

      // Search without changes
      await search(tempDir, 'API errors');

      // Manifest should not have changed
      const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      // lastIndexed should not change if no reindex occurred
      expect(manifestAfter.lastIndexed).toBe(lastIndexedBefore);
    });
  });

  describe('ignores changes outside knowledge', () => {
    it('should not reindex when CLAUDE.md changes', async () => {
      // Create CLAUDE.md
      writeFileSync(join(tempDir, 'CLAUDE.md'), '# Stub\n\nOriginal stub.');

      // Index
      await syncProject(tempDir);

      // Read manifest
      const manifestPath = join(tempDir, '.memory-forge/manifest.json');
      const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      // Modify CLAUDE.md
      writeFileSync(join(tempDir, 'CLAUDE.md'), '# Stub\n\nModified stub with lots of new content.');

      // Search
      await search(tempDir, 'test');

      // Manifest should not include CLAUDE.md
      const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      // Should not have entry for CLAUDE.md
      const hasClaude = Object.keys(manifestAfter.files).some(k => k.includes('CLAUDE.md'));
      expect(hasClaude).toBe(false);
    });

    it('should not reindex when .opencode/ changes', async () => {
      // Create .opencode/skill/
      const opencodePath = join(tempDir, '.opencode/skill/test');
      mkdirSync(opencodePath, { recursive: true });
      writeFileSync(join(opencodePath, 'SKILL.md'), '# Skill\n\nOriginal.');

      // Index
      await syncProject(tempDir);

      // Modify .opencode/
      writeFileSync(join(opencodePath, 'SKILL.md'), '# Skill\n\nModified content.');

      // Search
      await search(tempDir, 'test');

      // Manifest should not include .opencode/
      const manifestPath = join(tempDir, '.memory-forge/manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      const hasOpencode = Object.keys(manifest.files).some(k => k.includes('.opencode'));
      expect(hasOpencode).toBe(false);
    });
  });

  describe('detects new and deleted files', () => {
    it('should index new files in knowledge/', async () => {
      // Index initially
      await syncProject(tempDir);

      // Add new file
      writeFileSync(
        join(tempDir, 'knowledge/new-doc.md'),
        `# New Document\n\n## Kubernetes\n\nInfo about k8s deployments.`
      );

      // Search for new content (should detect and index)
      const results = await search(tempDir, 'kubernetes deployments');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.sourceFile.includes('new-doc.md'))).toBe(true);
    });

    it('should remove deleted files from index', async () => {
      // Add second file
      writeFileSync(
        join(tempDir, 'knowledge/to-delete.md'),
        `# To Delete\n\n## Temporary\n\nThis will be deleted.`
      );

      // Index
      await syncProject(tempDir);

      // Verify it exists
      const resultsBefore = await search(tempDir, 'temporary deleted');
      expect(resultsBefore.some(r => r.sourceFile.includes('to-delete.md'))).toBe(true);

      // Delete file
      rmSync(join(tempDir, 'knowledge/to-delete.md'));

      // Search again (should detect deletion)
      const resultsAfter = await search(tempDir, 'temporary deleted');

      // Should not find deleted file
      expect(resultsAfter.every(r => !r.sourceFile.includes('to-delete.md'))).toBe(true);
    });
  });
});
