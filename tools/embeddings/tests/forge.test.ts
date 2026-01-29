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

  describe('saveKnowledge - skills go to autoload, NOT knowledge/', () => {
    it('should save skill to .claude/skills/ and .opencode/skill/ (autoload)', async () => {
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

      // Skill goes to autoload directories
      const claudePath = join(tempDir, '.claude/skills/test-skill/SKILL.md');
      const opencodePath = join(tempDir, '.opencode/skill/test-skill/SKILL.md');

      expect(existsSync(claudePath)).toBe(true);
      expect(existsSync(opencodePath)).toBe(true);

      const content = readFileSync(claudePath, 'utf-8');
      expect(content).toContain('name: test-skill');
      expect(content).toContain('Test description');
      expect(content).toContain('## Problem\n\nTest problem');
      expect(content).toContain('## Solution\n\nTest content for solution');
    });

    it('should NEVER save skill to knowledge/ directory', async () => {
      const input = {
        type: 'skill' as const,
        name: 'my-skill',
        content: 'Skill content',
        description: 'A skill',
      };

      await saveKnowledge(tempDir, input);

      // CRITICAL: skills must NOT go to knowledge/
      const knowledgePath = join(tempDir, 'knowledge/my-skill.md');
      expect(existsSync(knowledgePath)).toBe(false);

      // Verify it went to autoload instead
      expect(existsSync(join(tempDir, '.claude/skills/my-skill/SKILL.md'))).toBe(true);
    });

    it('should save context to knowledge/ directory (indexed)', async () => {
      const input = {
        type: 'context' as const,
        name: 'New Pattern',
        content: 'Details about the pattern',
        importance: 10,
      };

      const result = await saveKnowledge(tempDir, input);

      expect(result.success).toBe(true);

      // Context goes to knowledge/
      const expectedPath = join(tempDir, 'knowledge/new-pattern.md');
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      const content = readFileSync(expectedPath, 'utf-8');
      expect(content).toContain('# New Pattern');
      expect(content).toContain('Details about the pattern');
    });

    it('should not overwrite existing skill', async () => {
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

    it('should create knowledge/ directory for context if it does not exist', async () => {
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

  describe('CRITICAL: skills are NEVER indexed', () => {
    it('isIndexable returns false for .claude/skills/', () => {
      expect(isIndexable('.claude/skills/foo/SKILL.md')).toBe(false);
      expect(isIndexable('.claude/skills/bar/SKILL.md')).toBe(false);
      expect(isIndexable('/project/.claude/skills/test/SKILL.md')).toBe(false);
    });

    it('isIndexable returns false for .opencode/skill/', () => {
      expect(isIndexable('.opencode/skill/foo/SKILL.md')).toBe(false);
      expect(isIndexable('.opencode/skill/bar/SKILL.md')).toBe(false);
      expect(isIndexable('/project/.opencode/skill/test/SKILL.md')).toBe(false);
    });

    it('isIndexable returns false for .codex/skills/', () => {
      expect(isIndexable('.codex/skills/foo/SKILL.md')).toBe(false);
    });

    it('isIndexable returns true ONLY for knowledge/', () => {
      expect(isIndexable('knowledge/api.md')).toBe(true);
      expect(isIndexable('knowledge/nested/file.md')).toBe(true);
      expect(isIndexable('/project/knowledge/doc.md')).toBe(true);

      // Everything else is false
      expect(isIndexable('CLAUDE.md')).toBe(false);
      expect(isIndexable('AGENTS.md')).toBe(false);
      expect(isIndexable('src/code.ts')).toBe(false);
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
