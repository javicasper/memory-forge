/**
 * Sync module - File discovery and change detection
 *
 * According to SPEC:
 * - Only index files in knowledge/ directory
 * - CLAUDE.md, AGENTS.md, .claude/, .codex/, .opencode/ are NOT indexed
 */

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { SyncResult } from './types.js';
import { calculateFileHash, parseFile } from './chunker.js';
import { generateEmbeddings, getModelId } from './embeddings.js';
import {
  upsertFileChunks,
  removeFile,
  getAllFileIndexes,
  initDatabase,
  getIndexMetadata,
  setEmbeddingModel,
  clearDatabase,
} from './db.js';
import { isIndexable, computeHash } from './forge.js';

// ============================================================================
// MANIFEST (for incremental indexing)
// ============================================================================

interface Manifest {
  files: Record<string, string>; // path -> content hash
  lastIndexed: string;
}

function getManifestPath(projectRoot: string): string {
  return join(projectRoot, '.memory-forge', 'manifest.json');
}

function loadManifest(projectRoot: string): Manifest {
  const manifestPath = getManifestPath(projectRoot);
  if (existsSync(manifestPath)) {
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      // Invalid manifest, start fresh
    }
  }
  return { files: {}, lastIndexed: '' };
}

function saveManifest(projectRoot: string, manifest: Manifest): void {
  const manifestPath = getManifestPath(projectRoot);
  const dir = join(projectRoot, '.memory-forge');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

// ============================================================================
// FILE DISCOVERY (updated for SPEC)
// ============================================================================

/**
 * Recursively find markdown files in knowledge/ directory only
 */
function findKnowledgeFiles(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        results.push(...findKnowledgeFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

/**
 * Discover all indexable files in a project
 * According to SPEC: Only files in knowledge/ directory
 */
export function discoverFiles(projectRoot: string): string[] {
  const knowledgeDir = join(projectRoot, 'knowledge');
  const files = findKnowledgeFiles(knowledgeDir);

  // Filter to ensure only indexable files (double-check)
  return files.filter((file) => {
    const relativePath = relative(projectRoot, file);
    return isIndexable(relativePath);
  });
}

// ============================================================================
// MODEL CHANGE DETECTION
// ============================================================================

/**
 * Check if the embedding model has changed since last index
 * If model changed, clear database and manifest to force full reindex
 *
 * Returns true if model changed and index was cleared
 */
export function checkModelConsistency(projectRoot: string): boolean {
  const metadata = getIndexMetadata(projectRoot);
  const currentModel = getModelId();

  // No previous metadata = fresh index, no clearing needed
  if (!metadata || !metadata.embeddingModel) {
    return false;
  }

  // Model matches = no clearing needed
  if (metadata.embeddingModel === currentModel) {
    return false;
  }

  // Model mismatch - clear everything for full reindex
  console.log(`Model changed: ${metadata.embeddingModel} → ${currentModel}`);
  console.log('Clearing index for full reindex...');

  clearDatabase(projectRoot);

  // Also clear manifest
  const manifestPath = getManifestPath(projectRoot);
  if (existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify({ files: {}, lastIndexed: '' }, null, 2), 'utf-8');
  }

  return true;
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Get files that need indexing (new or changed) using content hash
 * Uses relative paths in manifest for portability
 */
export function getFilesToIndex(
  projectRoot: string,
  files: string[]
): { toIndex: string[]; toRemove: string[]; unchanged: string[] } {
  const manifest = loadManifest(projectRoot);
  const indexed = getAllFileIndexes(projectRoot);

  const toIndex: string[] = [];
  const unchanged: string[] = [];

  // Build set of current relative paths for comparison
  const currentRelativePaths = new Set(files.map(f => relative(projectRoot, f)));

  // Check each file
  for (const file of files) {
    const relativePath = relative(projectRoot, file);
    const content = readFileSync(file, 'utf-8');
    const contentHash = computeHash(content);
    const manifestHash = manifest.files[relativePath];

    if (!manifestHash || manifestHash !== contentHash) {
      // New or changed file
      toIndex.push(file);
    } else {
      // Unchanged
      unchanged.push(file);
    }
  }

  // Find removed files (in manifest but not in current files)
  const toRemove: string[] = [];
  for (const existingRelPath of Object.keys(manifest.files)) {
    if (!currentRelativePaths.has(existingRelPath)) {
      // Convert back to absolute for removal operations
      toRemove.push(join(projectRoot, existingRelPath));
    }
  }

  // Also check indexed files not in current set
  for (const existing of indexed) {
    const existingRelPath = relative(projectRoot, existing.path);
    if (!currentRelativePaths.has(existingRelPath) && !toRemove.includes(existing.path)) {
      toRemove.push(existing.path);
    }
  }

  return { toIndex, toRemove, unchanged };
}

// ============================================================================
// INDEXING
// ============================================================================

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

// ============================================================================
// SYNC
// ============================================================================

/**
 * Ensure index is fresh by checking for changes since last index
 * Called automatically before search to guarantee up-to-date results
 *
 * Returns true if any reindexing was done
 */
export async function ensureIndexFresh(projectRoot: string): Promise<boolean> {
  // Initialize database if needed
  initDatabase(projectRoot);

  // Check if model changed - if so, force full reindex
  const modelChanged = checkModelConsistency(projectRoot);

  // Discover current files
  const files = discoverFiles(projectRoot);

  // Get files that need indexing
  const { toIndex, toRemove } = getFilesToIndex(projectRoot, files);

  // If nothing changed and model didn't change, return early
  if (toIndex.length === 0 && toRemove.length === 0 && !modelChanged) {
    return false;
  }

  // Load manifest for updates
  const manifest = loadManifest(projectRoot);

  // Remove deleted files
  for (const file of toRemove) {
    removeFile(projectRoot, file);
    const relativePath = relative(projectRoot, file);
    delete manifest.files[relativePath];
  }

  // Index new/changed files
  for (const file of toIndex) {
    await indexFile(projectRoot, file);

    // Update manifest with new hash (using relative path for portability)
    const relativePath = relative(projectRoot, file);
    const content = readFileSync(file, 'utf-8');
    manifest.files[relativePath] = computeHash(content);
  }

  // Save updated manifest and record model
  manifest.lastIndexed = new Date().toISOString();
  saveManifest(projectRoot, manifest);
  setEmbeddingModel(projectRoot, getModelId());

  return true;
}

/**
 * Full sync: discover, detect changes, and index
 * According to SPEC: Only indexes knowledge/ directory
 */
export async function syncProject(projectRoot: string): Promise<SyncResult> {
  // Initialize database
  initDatabase(projectRoot);

  // Check if model changed - if so, force full reindex
  checkModelConsistency(projectRoot);

  // Discover files in knowledge/ only
  const files = discoverFiles(projectRoot);
  console.log(`Found ${files.length} knowledge file(s) in knowledge/`);

  // Determine what needs indexing
  const { toIndex, toRemove, unchanged } = getFilesToIndex(projectRoot, files);

  const result: SyncResult = {
    added: [],
    updated: [],
    removed: [],
    unchanged,
  };

  // Update manifest
  const manifest = loadManifest(projectRoot);

  // Remove deleted files
  for (const file of toRemove) {
    removeFile(projectRoot, file);
    const relativePath = relative(projectRoot, file);
    delete manifest.files[relativePath];
    result.removed.push(file);
    console.log(`Removed: ${relativePath}`);
  }

  // Index new/changed files
  for (const file of toIndex) {
    const relativePath = relative(projectRoot, file);
    const wasIndexed = manifest.files[relativePath] !== undefined;

    console.log(
      `${wasIndexed ? 'Re-indexing' : 'Indexing'}: ${relativePath}`
    );

    const chunkCount = await indexFile(projectRoot, file);

    // Update manifest with new hash (using relative path for portability)
    const content = readFileSync(file, 'utf-8');
    manifest.files[relativePath] = computeHash(content);

    if (wasIndexed) {
      result.updated.push(file);
    } else {
      result.added.push(file);
    }

    console.log(`  → ${chunkCount} chunk(s)`);
  }

  // Save updated manifest and record model
  manifest.lastIndexed = new Date().toISOString();
  saveManifest(projectRoot, manifest);
  setEmbeddingModel(projectRoot, getModelId());

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
