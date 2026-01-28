/**
 * Forge module - Handles creation and formatting of knowledge files
 *
 * According to SPEC:
 * - Knowledge is saved to knowledge/ directory (source of truth)
 * - CLAUDE.md, AGENTS.md, .claude/, .codex/, .opencode/ are NOT indexed but audited
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, relative, basename } from 'path';
import { createHash } from 'crypto';
import { syncProject } from './sync.js';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeInput {
  type: 'skill' | 'context';
  name: string;
  content: string;
  description?: string;
  trigger?: string;
  problem?: string;
  importance?: number;
}

export interface AuditResult {
  warnings: AuditWarning[];
  critical: AuditWarning[];
  summary: {
    totalAutoloadTokens: number;
    autoloadFiles: number;
    knowledgeFiles: number;
  };
}

export interface AuditWarning {
  file: string;
  tokens: number;
  level: 'warning' | 'critical';
  message: string;
}

// ============================================================================
// THRESHOLDS (from SPEC)
// ============================================================================

export const THRESHOLDS = {
  CLAUDE_MD_WARNING: 500,
  CLAUDE_MD_CRITICAL: 1000,
  AGENTS_MD_WARNING: 500,
  AGENTS_MD_CRITICAL: 1000,
  SKILL_MD_WARNING: 300,
  SKILL_MD_CRITICAL: 600,
  TOTAL_AUTOLOAD_WARNING: 2000,
  TOTAL_AUTOLOAD_CRITICAL: 5000,
};

// ============================================================================
// PATH CLASSIFICATION (from SPEC)
// ============================================================================

/**
 * Check if a file path should be indexed (only knowledge/ directory)
 */
export function isIndexable(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  // Must be in knowledge/ directory
  if (!normalized.includes('knowledge/')) return false;

  // Must be a markdown file
  if (!normalized.endsWith('.md')) return false;

  return true;
}

/**
 * Check if a file path should be audited (autoload files)
 */
export function isAuditable(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = basename(normalized);

  // Root context files
  if (fileName === 'CLAUDE.md' || fileName === 'AGENTS.md') return true;

  // Special agent directories
  if (normalized.includes('.claude/')) return true;
  if (normalized.includes('.codex/')) return true;
  if (normalized.includes('.opencode/')) return true;

  return false;
}

// ============================================================================
// NORMALIZATION AND HASHING (from SPEC)
// ============================================================================

/**
 * Normalize content before hashing to avoid unnecessary re-indexing
 */
export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .split('\n')
    .map((line) => line.trimEnd()) // Remove trailing spaces
    .join('\n');
}

/**
 * Compute hash of normalized content
 */
export function computeHash(content: string): string {
  const normalized = normalizeContent(content);
  return createHash('sha256').update(normalized).digest('hex');
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * Find all markdown files in knowledge/ directory
 */
export function findKnowledgeFiles(projectRoot: string): string[] {
  const knowledgeDir = join(projectRoot, 'knowledge');
  if (!existsSync(knowledgeDir)) return [];

  const files: string[] = [];

  function walkDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(knowledgeDir);
  return files;
}

/**
 * Find all auditable files (autoload files)
 */
export function findAuditableFiles(projectRoot: string): string[] {
  const files: string[] = [];

  // Check root context files
  const claudeMd = join(projectRoot, 'CLAUDE.md');
  const agentsMd = join(projectRoot, 'AGENTS.md');
  if (existsSync(claudeMd)) files.push(claudeMd);
  if (existsSync(agentsMd)) files.push(agentsMd);

  // Check special directories
  const specialDirs = ['.claude', '.codex', '.opencode'];
  for (const dir of specialDirs) {
    const dirPath = join(projectRoot, dir);
    if (existsSync(dirPath)) {
      walkForMarkdown(dirPath, files);
    }
  }

  return files;
}

function walkForMarkdown(dir: string, files: string[]) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkForMarkdown(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
}

// ============================================================================
// AUDIT (from SPEC)
// ============================================================================

/**
 * Audit autoload files and report token usage
 */
export function audit(projectRoot: string): AuditResult {
  const auditableFiles = findAuditableFiles(projectRoot);
  const knowledgeFiles = findKnowledgeFiles(projectRoot);

  const warnings: AuditWarning[] = [];
  const critical: AuditWarning[] = [];
  let totalTokens = 0;

  for (const file of auditableFiles) {
    const content = readFileSync(file, 'utf-8');
    const tokens = estimateTokens(content);
    totalTokens += tokens;

    const fileName = basename(file);
    const relPath = relative(projectRoot, file);

    let warningThreshold: number;
    let criticalThreshold: number;

    if (fileName === 'CLAUDE.md') {
      warningThreshold = THRESHOLDS.CLAUDE_MD_WARNING;
      criticalThreshold = THRESHOLDS.CLAUDE_MD_CRITICAL;
    } else if (fileName === 'AGENTS.md') {
      warningThreshold = THRESHOLDS.AGENTS_MD_WARNING;
      criticalThreshold = THRESHOLDS.AGENTS_MD_CRITICAL;
    } else {
      // SKILL.md or other files in special dirs
      warningThreshold = THRESHOLDS.SKILL_MD_WARNING;
      criticalThreshold = THRESHOLDS.SKILL_MD_CRITICAL;
    }

    if (tokens > criticalThreshold) {
      critical.push({
        file: relPath,
        tokens,
        level: 'critical',
        message: `${relPath}: ${tokens} tokens (CRITICAL, threshold: ${criticalThreshold})`,
      });
    } else if (tokens > warningThreshold) {
      warnings.push({
        file: relPath,
        tokens,
        level: 'warning',
        message: `${relPath}: ${tokens} tokens (WARNING, threshold: ${warningThreshold})`,
      });
    }
  }

  // Check total autoload
  if (totalTokens > THRESHOLDS.TOTAL_AUTOLOAD_CRITICAL) {
    critical.push({
      file: 'TOTAL',
      tokens: totalTokens,
      level: 'critical',
      message: `Total autoload: ${totalTokens} tokens (CRITICAL, threshold: ${THRESHOLDS.TOTAL_AUTOLOAD_CRITICAL})`,
    });
  } else if (totalTokens > THRESHOLDS.TOTAL_AUTOLOAD_WARNING) {
    warnings.push({
      file: 'TOTAL',
      tokens: totalTokens,
      level: 'warning',
      message: `Total autoload: ${totalTokens} tokens (WARNING, threshold: ${THRESHOLDS.TOTAL_AUTOLOAD_WARNING})`,
    });
  }

  return {
    warnings,
    critical,
    summary: {
      totalAutoloadTokens: totalTokens,
      autoloadFiles: auditableFiles.length,
      knowledgeFiles: knowledgeFiles.length,
    },
  };
}

/**
 * Format audit result for display
 */
export function formatAuditResult(result: AuditResult, projectRoot: string): string {
  const lines: string[] = [];

  lines.push(`Audit for: ${projectRoot}`);
  lines.push('');

  if (result.critical.length > 0) {
    lines.push('CRITICAL:');
    for (const c of result.critical) {
      lines.push(`  - ${c.message}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS:');
    for (const w of result.warnings) {
      lines.push(`  - ${w.message}`);
    }
    lines.push('');
  }

  if (result.critical.length === 0 && result.warnings.length === 0) {
    lines.push('No issues found.');
    lines.push('');
  }

  lines.push('Summary:');
  lines.push(`  Autoload files: ${result.summary.autoloadFiles}`);
  lines.push(`  Autoload tokens: ${result.summary.totalAutoloadTokens}`);
  lines.push(`  Knowledge files: ${result.summary.knowledgeFiles}`);

  if (result.summary.totalAutoloadTokens > 0) {
    lines.push('');
    lines.push('Recommendation:');
    lines.push('  Move stable knowledge to knowledge/ directory');
    lines.push('  Keep CLAUDE.md/AGENTS.md as minimal stubs (< 500 tokens)');
  }

  return lines.join('\n');
}

// ============================================================================
// SAVE KNOWLEDGE (updated for SPEC)
// ============================================================================

/**
 * Create a standardized knowledge file content
 */
function formatKnowledgeContent(input: KnowledgeInput): string {
  const date = new Date().toISOString().split('T')[0];
  const name = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const title = input.name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  if (input.type === 'skill') {
    return `---
name: ${name}
description: |
  ${(input.description || 'No description provided').replace(/\n/g, '\n  ')}
author: Memory Forge
version: 1.0.0
date: ${date}
importance: ${input.importance || 5}
---

# ${title}

## Problem

${input.problem || 'No problem description provided.'}

## Trigger Conditions

${input.trigger || 'No trigger conditions provided.'}

## Solution

${input.content}

## Verification

(Add verification steps here)
`;
  } else {
    // Context type - simpler format
    return `# ${title}

${input.content}

---
_Added: ${date}_
`;
  }
}

/**
 * Save knowledge to the knowledge/ directory (source of truth)
 */
export async function saveKnowledge(
  projectRoot: string,
  input: KnowledgeInput
): Promise<{ success: boolean; path: string; message: string }> {
  try {
    const knowledgeDir = join(projectRoot, 'knowledge');

    // Ensure knowledge directory exists
    if (!existsSync(knowledgeDir)) {
      mkdirSync(knowledgeDir, { recursive: true });
    }

    // Determine file name
    const fileName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const filePath = join(knowledgeDir, `${fileName}.md`);

    // Check if file already exists
    if (existsSync(filePath)) {
      return {
        success: false,
        path: filePath,
        message: `Knowledge file already exists at ${filePath}. Use a different name or update manually.`,
      };
    }

    // Format and write content
    const content = formatKnowledgeContent(input);
    writeFileSync(filePath, content, 'utf-8');

    // Index immediately
    await syncProject(projectRoot);

    return {
      success: true,
      path: filePath,
      message: `Knowledge saved to ${filePath} and indexed.`,
    };
  } catch (error) {
    return {
      success: false,
      path: '',
      message: `Error saving knowledge: ${(error as Error).message}`,
    };
  }
}
