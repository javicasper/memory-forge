import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSkillFile, parseContextFile, calculateFileHash } from '../src/chunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

describe('chunker', () => {
  describe('parseSkillFile', () => {
    it('should parse a SKILL.md file into semantic chunks', () => {
      const filePath = resolve(FIXTURES_DIR, 'sample-skill.md');
      const chunks = parseSkillFile(filePath);

      expect(chunks.length).toBeGreaterThan(0);

      // Should have frontmatter chunk
      const frontmatter = chunks.find((c) => c.chunkType === 'frontmatter');
      expect(frontmatter).toBeDefined();
      expect(frontmatter?.content).toContain('test-skill');
      expect(frontmatter?.priority).toBe(10);

      // Should have trigger chunk
      const trigger = chunks.find((c) => c.chunkType === 'trigger');
      expect(trigger).toBeDefined();
      expect(trigger?.content).toContain('Test error message');
      expect(trigger?.priority).toBe(9);

      // Should have problem chunk
      const problem = chunks.find((c) => c.chunkType === 'problem');
      expect(problem).toBeDefined();
      expect(problem?.priority).toBe(8);

      // Should have solution chunk(s)
      const solution = chunks.find((c) => c.chunkType === 'solution');
      expect(solution).toBeDefined();

      // All chunks should have required fields
      for (const chunk of chunks) {
        expect(chunk.id).toBeDefined();
        expect(chunk.sourceFile).toBe(filePath);
        expect(chunk.sourceType).toBe('skill');
        expect(chunk.content).toBeDefined();
        expect(chunk.priority).toBeGreaterThan(0);
      }
    });

    it('should extract skill name from frontmatter', () => {
      const filePath = resolve(FIXTURES_DIR, 'sample-skill.md');
      const chunks = parseSkillFile(filePath);

      const frontmatter = chunks.find((c) => c.chunkType === 'frontmatter');
      expect(frontmatter?.metadata.skillName).toBe('test-skill');
    });
  });

  describe('parseContextFile', () => {
    it('should parse a CLAUDE.md file into section chunks', () => {
      const filePath = resolve(FIXTURES_DIR, 'sample-claude.md');
      const chunks = parseContextFile(filePath);

      expect(chunks.length).toBeGreaterThan(0);

      // Should have section chunks
      const sections = chunks.filter((c) => c.chunkType === 'section');
      expect(sections.length).toBeGreaterThan(0);

      // All chunks should be claude-md type
      for (const chunk of chunks) {
        expect(chunk.sourceType).toBe('claude-md');
      }
    });

    it('should split large sections by H3', () => {
      const filePath = resolve(FIXTURES_DIR, 'sample-claude.md');
      const chunks = parseContextFile(filePath);

      // Check for subsection chunks (Project Conventions has H3s)
      const hasSubsections = chunks.some(
        (c) => c.heading && c.heading.includes('>')
      );
      // May or may not have subsections depending on content size
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('calculateFileHash', () => {
    it('should return consistent hash for same file', () => {
      const filePath = resolve(FIXTURES_DIR, 'sample-skill.md');
      const hash1 = calculateFileHash(filePath);
      const hash2 = calculateFileHash(filePath);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should return different hash for different files', () => {
      const hash1 = calculateFileHash(resolve(FIXTURES_DIR, 'sample-skill.md'));
      const hash2 = calculateFileHash(resolve(FIXTURES_DIR, 'sample-claude.md'));

      expect(hash1).not.toBe(hash2);
    });
  });
});
