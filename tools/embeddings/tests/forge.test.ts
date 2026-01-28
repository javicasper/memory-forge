import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveKnowledge, audit, isIndexable, isAuditable, THRESHOLDS } from '../src/forge.js';

// Mock syncProject to avoid full indexing during unit tests
vi.mock('../src/sync.js', () => ({
  syncProject: vi.fn().mockResolvedValue({
    added: [],
    updated: [],
    removed: [],
    unchanged: [],
  }),
}));

describe('forge', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-forge-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('saveKnowledge (SPEC: saves to knowledge/)', () => {
    it('should save a new skill to knowledge/ directory', async () => {
      const input = {
        type: 'skill' as const,
        name: 'test-skill',
        content: 'Test content for solution',
        description: 'Test description',
        trigger: 'Test trigger',
        problem: 'Test problem',
        importance: 8,
      };

      const result = await saveKnowledge(tempDir, input);

      expect(result.success).toBe(true);

      // According to SPEC: knowledge is saved to knowledge/<name>.md
      const expectedPath = join(tempDir, 'knowledge/test-skill.md');
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      const content = readFileSync(expectedPath, 'utf-8');
      expect(content).toContain('name: test-skill');
      expect(content).toContain('description: |');
      expect(content).toContain('Test description');
      expect(content).toContain('importance: 8');
      expect(content).toContain('# Test Skill');
      expect(content).toContain('## Problem\n\nTest problem');
      expect(content).toContain('## Trigger Conditions\n\nTest trigger');
      expect(content).toContain('## Solution\n\nTest content for solution');
    });

    it('should save context knowledge to knowledge/ directory', async () => {
      const input = {
        type: 'context' as const,
        name: 'New Pattern',
        content: 'Details about the pattern',
        importance: 10,
      };

      const result = await saveKnowledge(tempDir, input);

      expect(result.success).toBe(true);

      // According to SPEC: all knowledge goes to knowledge/
      const expectedPath = join(tempDir, 'knowledge/new-pattern.md');
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      const content = readFileSync(expectedPath, 'utf-8');
      expect(content).toContain('# New Pattern');
      expect(content).toContain('Details about the pattern');
    });

    it('should not overwrite existing knowledge file', async () => {
      const input = {
        type: 'skill' as const,
        name: 'duplicate-skill',
        content: 'Original content',
        importance: 5,
      };

      // First save
      await saveKnowledge(tempDir, input);

      // Second save
      const result = await saveKnowledge(tempDir, {
        ...input,
        content: 'New content',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('should create knowledge/ directory if it does not exist', async () => {
      const input = {
        type: 'context' as const,
        name: 'first-knowledge',
        content: 'First content',
      };

      expect(existsSync(join(tempDir, 'knowledge'))).toBe(false);

      await saveKnowledge(tempDir, input);

      expect(existsSync(join(tempDir, 'knowledge'))).toBe(true);
    });
  });

  describe('isIndexable (SPEC: only knowledge/)', () => {
    it('should return true for files in knowledge/', () => {
      expect(isIndexable('knowledge/api.md')).toBe(true);
      expect(isIndexable('knowledge/nested/file.md')).toBe(true);
    });

    it('should return false for CLAUDE.md', () => {
      expect(isIndexable('CLAUDE.md')).toBe(false);
    });

    it('should return false for files in .claude/', () => {
      expect(isIndexable('.claude/skills/foo/SKILL.md')).toBe(false);
    });

    it('should return false for non-markdown files', () => {
      expect(isIndexable('knowledge/data.json')).toBe(false);
    });
  });

  describe('isAuditable (SPEC: autoload files)', () => {
    it('should return true for CLAUDE.md', () => {
      expect(isAuditable('CLAUDE.md')).toBe(true);
    });

    it('should return true for AGENTS.md', () => {
      expect(isAuditable('AGENTS.md')).toBe(true);
    });

    it('should return true for files in .claude/', () => {
      expect(isAuditable('.claude/skills/foo/SKILL.md')).toBe(true);
    });

    it('should return true for files in .codex/', () => {
      expect(isAuditable('.codex/skills/bar/SKILL.md')).toBe(true);
    });

    it('should return true for files in .opencode/', () => {
      expect(isAuditable('.opencode/skill/baz/SKILL.md')).toBe(true);
    });

    it('should return false for knowledge/', () => {
      expect(isAuditable('knowledge/api.md')).toBe(false);
    });
  });

  describe('audit', () => {
    it('should detect CLAUDE.md exceeding warning threshold', () => {
      // Create a large CLAUDE.md (> 500 tokens ≈ 2000 chars)
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, 'x'.repeat(2500));

      const result = audit(tempDir);

      expect(result.warnings.length + result.critical.length).toBeGreaterThan(0);
      expect(result.summary.totalAutoloadTokens).toBeGreaterThan(500);
    });

    it('should detect CLAUDE.md exceeding critical threshold', () => {
      // Create a very large CLAUDE.md (> 1000 tokens ≈ 4000 chars)
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, 'x'.repeat(5000));

      const result = audit(tempDir);

      expect(result.critical.length).toBeGreaterThan(0);
    });

    it('should not report issues for small files', () => {
      // Create a small CLAUDE.md (< 500 tokens)
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, '# Stub\n\nSmall content');

      const result = audit(tempDir);

      expect(result.warnings.length).toBe(0);
      expect(result.critical.length).toBe(0);
    });

    it('should audit .claude/ directory', () => {
      const skillDir = join(tempDir, '.claude/skills/big-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), 'x'.repeat(3000));

      const result = audit(tempDir);

      expect(result.summary.autoloadFiles).toBeGreaterThan(0);
    });
  });

  describe('THRESHOLDS', () => {
    it('should have correct values from SPEC', () => {
      expect(THRESHOLDS.CLAUDE_MD_WARNING).toBe(500);
      expect(THRESHOLDS.CLAUDE_MD_CRITICAL).toBe(1000);
      expect(THRESHOLDS.AGENTS_MD_WARNING).toBe(500);
      expect(THRESHOLDS.AGENTS_MD_CRITICAL).toBe(1000);
      expect(THRESHOLDS.SKILL_MD_WARNING).toBe(300);
      expect(THRESHOLDS.SKILL_MD_CRITICAL).toBe(600);
      expect(THRESHOLDS.TOTAL_AUTOLOAD_WARNING).toBe(2000);
      expect(THRESHOLDS.TOTAL_AUTOLOAD_CRITICAL).toBe(5000);
    });
  });
});
