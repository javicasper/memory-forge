/**
 * Sync module - File discovery and change detection
 */

import { readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { SyncResult } from './types.js';
import { calculateFileHash, parseFile, ParseResult } from './chunker.js';
import { generateEmbeddings } from './embeddings.js';
import { upsertFileChunks, removeFile, getAllFileIndexes, initDatabase } from './db.js';

const CONTEXT_FILE_NAMES = ['CLAUDE.md', 'AGENTS.md'];

/**
 * Recursively find files in directory
 */
function findFiles(dir: string): string[] {
  const results: string[] = [];

  // Simple recursive search for now
  function walkDir(currentDir: string) {
    if (!existsSync(currentDir)) {
      return;
    }

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip common ignored directories
          if (
            ['node_modules', '.git', 'dist', 'build', '.memory-forge'].includes(
              entry.name
            )
          ) {
            continue;
          }
          walkDir(fullPath);
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walkDir(dir);
  return results;
}

/**
 * Discover all indexable files in a project
 */
export function discoverFiles(projectRoot: string): string[] {
  const allFiles = findFiles(projectRoot);
  const indexableFiles: string[] = [];

  for (const file of allFiles) {
    const fileName = file.split('/').pop() || '';
    const relativePath = relative(projectRoot, file);

    // Check for SKILL.md files in skill directories
    if (fileName === 'SKILL.md') {
      const pathParts = relativePath.split('/');
      // Must be in a skills directory structure
      if (
        pathParts.some((p) => ['skills', 'skill'].includes(p)) ||
        pathParts.includes('.claude') ||
        pathParts.includes('.opencode') ||
        pathParts.includes('.codex')
      ) {
        indexableFiles.push(file);
      }
    }

    // Check for context files (CLAUDE.md, AGENTS.md)
    if (CONTEXT_FILE_NAMES.includes(fileName)) {
      indexableFiles.push(file);
    }
  }

  return indexableFiles;
}

/**
 * Get files that need indexing (new or changed)
 */
export function getFilesToIndex(
  projectRoot: string,
  files: string[]
): { toIndex: string[]; toRemove: string[]; unchanged: string[] } {
  const indexed = getAllFileIndexes(projectRoot);
  const indexedMap = new Map(indexed.map((f) => [f.path, f]));

  const toIndex: string[] = [];
  const unchanged: string[] = [];
  const currentFiles = new Set(files);

  // Check each file
  for (const file of files) {
    const existing = indexedMap.get(file);

    if (!existing) {
      // New file
      toIndex.push(file);
    } else {
      // Check if changed
      const currentHash = calculateFileHash(file);
      if (currentHash !== existing.hash) {
        toIndex.push(file);
      } else {
        unchanged.push(file);
      }
    }
  }

  // Find removed files
  const toRemove: string[] = [];
  for (const existing of indexed) {
    if (!currentFiles.has(existing.path)) {
      toRemove.push(existing.path);
    }
  }

  return { toIndex, toRemove, unchanged };
}

/**
 * Index a single file
 */
export async function indexFile(
  projectRoot: string,
  filePath: string
): Promise<number> {
  // Parse file into chunks (and get importance if specified)
  const { chunks, importance } = parseFile(filePath);

  if (chunks.length === 0) {
    return 0;
  }

  // Generate embeddings for all chunks
  const contents = chunks.map((c) => c.content);
  const embeddings = await generateEmbeddings(contents);

  // Combine chunks with embeddings
  const chunksWithEmbeddings = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  // Calculate file hash
  const fileHash = calculateFileHash(filePath);

  // Store in database (with importance from frontmatter if available)
  upsertFileChunks(projectRoot, filePath, fileHash, chunksWithEmbeddings, importance);

  return chunks.length;
}

/**
 * Full sync: discover, detect changes, and index
 */
export async function syncProject(projectRoot: string): Promise<SyncResult> {
  // Initialize database
  initDatabase(projectRoot);

  // Discover files
  const files = discoverFiles(projectRoot);
  console.log(`Found ${files.length} knowledge file(s)`);

  // Determine what needs indexing
  const { toIndex, toRemove, unchanged } = getFilesToIndex(projectRoot, files);

  const result: SyncResult = {
    added: [],
    updated: [],
    removed: [],
    unchanged,
  };

  // Remove deleted files
  for (const file of toRemove) {
    removeFile(projectRoot, file);
    result.removed.push(file);
    console.log(`Removed: ${relative(projectRoot, file)}`);
  }

  // Index new/changed files
  for (const file of toIndex) {
    const existing = getAllFileIndexes(projectRoot).find((f) => f.path === file);
    const isNew = !existing;

    console.log(
      `${isNew ? 'Indexing' : 'Re-indexing'}: ${relative(projectRoot, file)}`
    );

    const chunkCount = await indexFile(projectRoot, file);

    if (isNew) {
      result.added.push(file);
    } else {
      result.updated.push(file);
    }

    console.log(`  → ${chunkCount} chunk(s)`);
  }

  return result;
}

/**
 * Format sync result for display
 */
export function formatSyncResult(result: SyncResult, projectRoot: string): string {
  const lines: string[] = [];

  lines.push('Sync completed:\n');

  if (result.added.length > 0) {
    lines.push(`✅ Added: ${result.added.length} file(s)`);
    for (const f of result.added) {
      lines.push(`   + ${relative(projectRoot, f)}`);
    }
  }

  if (result.updated.length > 0) {
    lines.push(`🔄 Updated: ${result.updated.length} file(s)`);
    for (const f of result.updated) {
      lines.push(`   ~ ${relative(projectRoot, f)}`);
    }
  }

  if (result.removed.length > 0) {
    lines.push(`🗑️  Removed: ${result.removed.length} file(s)`);
    for (const f of result.removed) {
      lines.push(`   - ${relative(projectRoot, f)}`);
    }
  }

  if (result.unchanged.length > 0) {
    lines.push(`⏸️  Unchanged: ${result.unchanged.length} file(s)`);
  }

  const total =
    result.added.length + result.updated.length + result.unchanged.length;
  lines.push(`\nTotal indexed: ${total} file(s)`);

  return lines.join('\n');
}
