/**
 * Structural validation tests for SKILL.md
 *
 * These tests validate that the SKILL.md file maintains its required structure
 * and invariants. They catch obvious breaks from refactors or doc edits, NOT
 * content/style issues.
 */

import { readFileSync, existsSync, lstatSync, readlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { describe, test, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');

// Canonical location (real file)
const SKILL_PATH = join(PROJECT_ROOT, 'SKILL.md');

// Symlink locations (for tool compatibility)
const SYMLINK_PATHS = {
  claude: join(PROJECT_ROOT, '.claude/skills/memory-forge/SKILL.md'),
  opencode: join(PROJECT_ROOT, '.opencode/skill/memory-forge/SKILL.md'),
};

// Valid MCP tool names (from mcp-server.ts)
const VALID_MCP_TOOLS = [
  'search_knowledge',
  'index_knowledge',
  'knowledge_stats',
  'audit_knowledge',
  'forget_knowledge',
  'save_knowledge',
];

// Required sections that must exist
const REQUIRED_SECTIONS = [
  'With MCP',
  'Without MCP',
  'Knowledge Extraction Process',
];

// Required path mentions
const REQUIRED_PATHS = ['knowledge/', 'CLAUDE.md', 'AGENTS.md', '.claude/skills/'];

// Anti-patterns that violate core philosophy
const ANTI_PATTERNS = [
  /index(?:ing)?\s+(?:CLAUDE\.md|AGENTS\.md|autoload)/i, // Don't index autoload files
  /embeddings?\s+(?:as|is|are)\s+(?:the\s+)?source\s+of\s+truth/i, // Embeddings are NOT source of truth
];

function loadSkill(): { content: string; frontmatter: Record<string, unknown> } {
  const raw = readFileSync(SKILL_PATH, 'utf-8');
  const { data } = matter(raw);
  return { content: raw, frontmatter: data };
}

describe('SKILL.md Validation', () => {
  describe('File structure', () => {
    test('canonical SKILL.md exists at project root', () => {
      expect(existsSync(SKILL_PATH)).toBe(true);
    });

    test('claude symlink exists and points to root SKILL.md', () => {
      expect(existsSync(SYMLINK_PATHS.claude)).toBe(true);
      expect(lstatSync(SYMLINK_PATHS.claude).isSymbolicLink()).toBe(true);
      expect(readlinkSync(SYMLINK_PATHS.claude)).toBe('../../../SKILL.md');
    });

    test('opencode symlink exists and points to root SKILL.md', () => {
      expect(existsSync(SYMLINK_PATHS.opencode)).toBe(true);
      expect(lstatSync(SYMLINK_PATHS.opencode).isSymbolicLink()).toBe(true);
      expect(readlinkSync(SYMLINK_PATHS.opencode)).toBe('../../../SKILL.md');
    });
  });

  describe('Frontmatter validation', () => {
    const { frontmatter } = loadSkill();

    test('frontmatter parses as valid YAML', () => {
      expect(frontmatter).toBeDefined();
      expect(typeof frontmatter).toBe('object');
    });

    test('has required "name" field', () => {
      expect(frontmatter.name).toBeDefined();
      expect(typeof frontmatter.name).toBe('string');
      expect((frontmatter.name as string).length).toBeGreaterThan(0);
    });

    test('name is in kebab-case', () => {
      const name = frontmatter.name as string;
      expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    });

    test('has required "description" field', () => {
      expect(frontmatter.description).toBeDefined();
      expect(typeof frontmatter.description).toBe('string');
      expect((frontmatter.description as string).length).toBeGreaterThan(0);
    });
  });

  describe('Required sections', () => {
    const { content } = loadSkill();

    test.each(REQUIRED_SECTIONS)('has section: %s', (section) => {
      // Match as heading (# With MCP, ## With MCP, ### With MCP, etc.)
      // or as bold text (**With MCP**)
      const headingPattern = new RegExp(`^#+\\s+.*${escapeRegex(section)}|\\*\\*${escapeRegex(section)}\\*\\*`, 'im');
      expect(content).toMatch(headingPattern);
    });
  });

  describe('Required path mentions', () => {
    const { content } = loadSkill();

    test.each(REQUIRED_PATHS)('mentions path: %s', (path) => {
      expect(content).toContain(path);
    });
  });

  describe('MCP tool names validation', () => {
    const { content } = loadSkill();

    test('only uses valid MCP tool names', () => {
      // Find all tool-like names (snake_case with _knowledge suffix)
      const toolMentions = content.match(/\b[a-z]+_knowledge\b/g) || [];
      const uniqueTools = [...new Set(toolMentions)];

      for (const tool of uniqueTools) {
        expect(VALID_MCP_TOOLS).toContain(tool);
      }
    });

    test('mentions save_knowledge (core tool)', () => {
      expect(content).toContain('save_knowledge');
    });

    test('mentions search_knowledge (core tool)', () => {
      expect(content).toContain('search_knowledge');
    });
  });

  describe('Core philosophy protection', () => {
    const { content } = loadSkill();

    test.each(ANTI_PATTERNS)('does not contain anti-pattern: %s', (pattern) => {
      expect(content).not.toMatch(pattern);
    });
  });
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
