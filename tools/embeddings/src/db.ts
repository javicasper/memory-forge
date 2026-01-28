/**
 * Database module - SQLite with vector search
 *
 * Uses better-sqlite3 for SQLite operations
 * Implements cosine similarity search in pure SQL/JS (no external vector extension needed)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { Chunk, FileIndex, IndexStats } from './types.js';

const DB_FILENAME = '.memory-forge/index.db';

// Default importance when not specified in frontmatter
const DEFAULT_IMPORTANCE = 5;

export interface DbChunk extends Chunk {
  embedding: string; // JSON serialized
  hash: string;
}

let db: Database.Database | null = null;

/**
 * Get database path for a project
 */
export function getDbPath(projectRoot: string): string {
  return join(projectRoot, DB_FILENAME);
}

/**
 * Initialize database connection and schema
 */
export function initDatabase(projectRoot: string): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getDbPath(projectRoot);
  const dbDir = dirname(dbPath);

  // Create directory if needed
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Indexed files tracking
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      last_accessed TEXT NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      importance INTEGER NOT NULL DEFAULT 5,
      chunk_count INTEGER NOT NULL
    );

    -- Chunks with embeddings
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_type TEXT NOT NULL,
      chunk_type TEXT NOT NULL,
      content TEXT NOT NULL,
      heading TEXT,
      priority INTEGER NOT NULL,
      metadata TEXT NOT NULL,
      embedding TEXT NOT NULL,
      FOREIGN KEY (source_file) REFERENCES files(path) ON DELETE CASCADE
    );

    -- Index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_chunks_source_file ON chunks(source_file);
    CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
    CREATE INDEX IF NOT EXISTS idx_chunks_priority ON chunks(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_files_last_accessed ON files(last_accessed);
  `);

  // Migration: add columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE files ADD COLUMN last_accessed TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE files ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE files ADD COLUMN importance INTEGER NOT NULL DEFAULT 5`);
  } catch { /* column already exists */ }

  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if database exists for a project
 */
export function databaseExists(projectRoot: string): boolean {
  return existsSync(getDbPath(projectRoot));
}

/**
 * Get file index entry
 */
export function getFileIndex(projectRoot: string, filePath: string): FileIndex | null {
  const database = initDatabase(projectRoot);
  const row = database.prepare('SELECT * FROM files WHERE path = ?').get(filePath) as any;

  if (!row) {
    return null;
  }

  return {
    path: row.path,
    hash: row.hash,
    indexedAt: new Date(row.indexed_at),
    chunkCount: row.chunk_count,
  };
}

/**
 * Get all indexed files
 */
export function getAllFileIndexes(projectRoot: string): FileIndex[] {
  const database = initDatabase(projectRoot);
  const rows = database.prepare('SELECT * FROM files').all() as any[];

  return rows.map((row) => ({
    path: row.path,
    hash: row.hash,
    indexedAt: new Date(row.indexed_at),
    chunkCount: row.chunk_count,
  }));
}

/**
 * Insert or update chunks for a file
 */
export function upsertFileChunks(
  projectRoot: string,
  filePath: string,
  fileHash: string,
  chunks: Array<Chunk & { embedding: number[] }>,
  importance?: number
): void {
  const database = initDatabase(projectRoot);

  // Use provided importance or default
  const fileImportance = importance ?? DEFAULT_IMPORTANCE;

  const transaction = database.transaction(() => {
    // Delete existing chunks for this file
    database.prepare('DELETE FROM chunks WHERE source_file = ?').run(filePath);

    // Delete existing file index
    database.prepare('DELETE FROM files WHERE path = ?').run(filePath);

    // Insert new file index
    const now = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO files (path, hash, indexed_at, last_accessed, access_count, importance, chunk_count) VALUES (?, ?, ?, ?, 0, ?, ?)'
      )
      .run(filePath, fileHash, now, now, fileImportance, chunks.length);

    // Insert chunks
    const insertChunk = database.prepare(`
      INSERT INTO chunks (id, source_file, source_type, chunk_type, content, heading, priority, metadata, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
      insertChunk.run(
        chunk.id,
        chunk.sourceFile,
        chunk.sourceType,
        chunk.chunkType,
        chunk.content,
        chunk.heading || null,
        chunk.priority,
        JSON.stringify(chunk.metadata),
        JSON.stringify(chunk.embedding)
      );
    }
  });

  transaction();
}

/**
 * Remove a file and its chunks from the index
 */
export function removeFile(projectRoot: string, filePath: string): void {
  const database = initDatabase(projectRoot);

  const transaction = database.transaction(() => {
    database.prepare('DELETE FROM chunks WHERE source_file = ?').run(filePath);
    database.prepare('DELETE FROM files WHERE path = ?').run(filePath);
  });

  transaction();
}

/**
 * Get all chunks (for vector search)
 */
export function getAllChunks(
  projectRoot: string,
  sourceTypes?: Array<'skill' | 'claude-md' | 'agents-md'>
): DbChunk[] {
  const database = initDatabase(projectRoot);

  let query = 'SELECT * FROM chunks';
  const params: any[] = [];

  if (sourceTypes && sourceTypes.length > 0) {
    const placeholders = sourceTypes.map(() => '?').join(', ');
    query += ` WHERE source_type IN (${placeholders})`;
    params.push(...sourceTypes);
  }

  query += ' ORDER BY priority DESC';

  const rows = database.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    sourceFile: row.source_file,
    sourceType: row.source_type,
    chunkType: row.chunk_type,
    content: row.content,
    heading: row.heading,
    priority: row.priority,
    metadata: JSON.parse(row.metadata),
    embedding: row.embedding,
    hash: '', // Not stored per chunk
  }));
}

/**
 * Get index statistics
 */
export function getIndexStats(projectRoot: string): IndexStats {
  if (!databaseExists(projectRoot)) {
    return {
      totalFiles: 0,
      totalChunks: 0,
      skillFiles: 0,
      claudeMdFiles: 0,
      agentsMdFiles: 0,
      lastIndexed: null,
    };
  }

  const database = initDatabase(projectRoot);

  const totalFiles = (
    database.prepare('SELECT COUNT(*) as count FROM files').get() as any
  ).count;
  const totalChunks = (
    database.prepare('SELECT COUNT(*) as count FROM chunks').get() as any
  ).count;

  const skillFiles = (
    database
      .prepare("SELECT COUNT(DISTINCT source_file) as count FROM chunks WHERE source_type = 'skill'")
      .get() as any
  ).count;
  const claudeMdFiles = (
    database
      .prepare("SELECT COUNT(DISTINCT source_file) as count FROM chunks WHERE source_type = 'claude-md'")
      .get() as any
  ).count;
  const agentsMdFiles = (
    database
      .prepare("SELECT COUNT(DISTINCT source_file) as count FROM chunks WHERE source_type = 'agents-md'")
      .get() as any
  ).count;

  const lastIndexedRow = database
    .prepare('SELECT indexed_at FROM files ORDER BY indexed_at DESC LIMIT 1')
    .get() as any;

  return {
    totalFiles,
    totalChunks,
    skillFiles,
    claudeMdFiles,
    agentsMdFiles,
    lastIndexed: lastIndexedRow ? new Date(lastIndexedRow.indexed_at) : null,
  };
}

/**
 * Clear all data from the database
 */
export function clearDatabase(projectRoot: string): void {
  const database = initDatabase(projectRoot);

  database.exec(`
    DELETE FROM chunks;
    DELETE FROM files;
  `);
}

/**
 * Update last_accessed timestamp for files that were accessed
 */
export function touchFiles(projectRoot: string, filePaths: string[]): void {
  if (filePaths.length === 0) return;

  const database = initDatabase(projectRoot);
  const now = new Date().toISOString();

  const update = database.prepare(
    'UPDATE files SET last_accessed = ?, access_count = access_count + 1 WHERE path = ?'
  );

  const transaction = database.transaction(() => {
    for (const path of filePaths) {
      update.run(now, path);
    }
  });

  transaction();
}

/**
 * Configuration for memory retention
 */
export interface RetentionConfig {
  maxFiles?: number; // Maximum number of files to keep
  maxAgeDays?: number; // Remove files not accessed in X days
  protectImportance?: number; // Files with importance >= this are NEVER deleted (default: 8)
}

/**
 * Get files that should be forgotten based on retention policy
 * Respects importance: lower importance files are forgotten first
 * Files with importance >= protectImportance are NEVER deleted
 */
export function getStaleFiles(
  projectRoot: string,
  config: RetentionConfig
): string[] {
  const database = initDatabase(projectRoot);
  const staleFiles: string[] = [];

  // Protection threshold (default 8 = root CLAUDE.md and app-level context files)
  const protectThreshold = config.protectImportance ?? 8;

  // Get files older than maxAgeDays (only non-protected files)
  if (config.maxAgeDays !== undefined) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.maxAgeDays);
    const cutoffIso = cutoffDate.toISOString();

    const oldFiles = database
      .prepare(
        `SELECT path FROM files
         WHERE (last_accessed < ? OR last_accessed = '')
           AND importance < ?
         ORDER BY importance ASC, access_count ASC, last_accessed ASC`
      )
      .all(cutoffIso, protectThreshold) as Array<{ path: string }>;

    for (const row of oldFiles) {
      staleFiles.push(row.path);
    }
  }

  // Get files exceeding maxFiles limit (only non-protected files)
  if (config.maxFiles !== undefined) {
    // Count only non-protected files
    const deletableFiles = (
      database
        .prepare('SELECT COUNT(*) as count FROM files WHERE importance < ?')
        .get(protectThreshold) as any
    ).count;

    const protectedFiles = (
      database
        .prepare('SELECT COUNT(*) as count FROM files WHERE importance >= ?')
        .get(protectThreshold) as any
    ).count;

    // Effective limit for deletable files
    const effectiveLimit = Math.max(0, config.maxFiles - protectedFiles);

    if (deletableFiles > effectiveLimit) {
      const toRemove = deletableFiles - effectiveLimit;
      // Forget least important, least used, oldest files first
      const lruFiles = database
        .prepare(
          `SELECT path FROM files
           WHERE importance < ?
           ORDER BY importance ASC, access_count ASC, last_accessed ASC
           LIMIT ?`
        )
        .all(protectThreshold, toRemove) as Array<{ path: string }>;

      for (const row of lruFiles) {
        if (!staleFiles.includes(row.path)) {
          staleFiles.push(row.path);
        }
      }
    }
  }

  return staleFiles;
}

/**
 * Forget (remove) stale files based on retention policy
 * Returns the list of removed file paths
 */
export function forgetStaleFiles(
  projectRoot: string,
  config: RetentionConfig
): string[] {
  const staleFiles = getStaleFiles(projectRoot, config);

  for (const filePath of staleFiles) {
    removeFile(projectRoot, filePath);
  }

  return staleFiles;
}

/**
 * Get memory usage statistics including access patterns
 */
export function getMemoryStats(projectRoot: string): {
  totalFiles: number;
  totalChunks: number;
  oldestAccess: Date | null;
  newestAccess: Date | null;
  neverAccessed: number;
  filesByAge: Array<{ path: string; lastAccessed: Date | null; accessCount: number }>;
} {
  if (!databaseExists(projectRoot)) {
    return {
      totalFiles: 0,
      totalChunks: 0,
      oldestAccess: null,
      newestAccess: null,
      neverAccessed: 0,
      filesByAge: [],
    };
  }

  const database = initDatabase(projectRoot);

  const totalFiles = (
    database.prepare('SELECT COUNT(*) as count FROM files').get() as any
  ).count;

  const totalChunks = (
    database.prepare('SELECT COUNT(*) as count FROM chunks').get() as any
  ).count;

  const oldest = database
    .prepare(
      `SELECT last_accessed FROM files
       WHERE last_accessed != ''
       ORDER BY last_accessed ASC LIMIT 1`
    )
    .get() as { last_accessed: string } | undefined;

  const newest = database
    .prepare(
      `SELECT last_accessed FROM files
       WHERE last_accessed != ''
       ORDER BY last_accessed DESC LIMIT 1`
    )
    .get() as { last_accessed: string } | undefined;

  const neverAccessed = (
    database
      .prepare(`SELECT COUNT(*) as count FROM files WHERE last_accessed = '' OR access_count = 0`)
      .get() as any
  ).count;

  const filesByAge = database
    .prepare(
      `SELECT path, last_accessed, access_count FROM files
       ORDER BY last_accessed ASC`
    )
    .all() as Array<{ path: string; last_accessed: string; access_count: number }>;

  return {
    totalFiles,
    totalChunks,
    oldestAccess: oldest ? new Date(oldest.last_accessed) : null,
    newestAccess: newest ? new Date(newest.last_accessed) : null,
    neverAccessed,
    filesByAge: filesByAge.map((f) => ({
      path: f.path,
      lastAccessed: f.last_accessed ? new Date(f.last_accessed) : null,
      accessCount: f.access_count,
    })),
  };
}
