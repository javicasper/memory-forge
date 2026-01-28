import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  initDatabase,
  closeDatabase,
  databaseExists,
  getFileIndex,
  getAllFileIndexes,
  upsertFileChunks,
  removeFile,
  getAllChunks,
  getIndexStats,
  clearDatabase,
} from '../src/db.js';
import { Chunk } from '../src/types.js';

describe('db', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-forge-test-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initDatabase', () => {
    it('should create database and tables', () => {
      const db = initDatabase(tempDir);
      expect(db).toBeDefined();
      expect(databaseExists(tempDir)).toBe(true);
    });

    it('should return same instance on multiple calls', () => {
      const db1 = initDatabase(tempDir);
      const db2 = initDatabase(tempDir);
      expect(db1).toBe(db2);
    });
  });

  describe('file operations', () => {
    const mockChunk: Chunk & { embedding: number[] } = {
      id: 'test-chunk-1',
      sourceFile: '/test/file.md',
      sourceType: 'skill',
      chunkType: 'frontmatter',
      content: 'Test content',
      priority: 10,
      metadata: { skillName: 'test-skill' },
      embedding: Array(384).fill(0.1),
    };

    it('should insert and retrieve file index', () => {
      initDatabase(tempDir);
      upsertFileChunks(tempDir, '/test/file.md', 'abc123', [mockChunk]);

      const index = getFileIndex(tempDir, '/test/file.md');
      expect(index).toBeDefined();
      expect(index?.path).toBe('/test/file.md');
      expect(index?.hash).toBe('abc123');
      expect(index?.chunkCount).toBe(1);
    });

    it('should update file on re-index', () => {
      initDatabase(tempDir);

      upsertFileChunks(tempDir, '/test/file.md', 'hash1', [mockChunk]);
      const index1 = getFileIndex(tempDir, '/test/file.md');

      upsertFileChunks(tempDir, '/test/file.md', 'hash2', [
        mockChunk,
        { ...mockChunk, id: 'test-chunk-2' },
      ]);
      const index2 = getFileIndex(tempDir, '/test/file.md');

      expect(index1?.hash).toBe('hash1');
      expect(index2?.hash).toBe('hash2');
      expect(index2?.chunkCount).toBe(2);
    });

    it('should remove file and its chunks', () => {
      initDatabase(tempDir);
      upsertFileChunks(tempDir, '/test/file.md', 'abc123', [mockChunk]);

      removeFile(tempDir, '/test/file.md');

      const index = getFileIndex(tempDir, '/test/file.md');
      const chunks = getAllChunks(tempDir);

      expect(index).toBeNull();
      expect(chunks.length).toBe(0);
    });
  });

  describe('chunk operations', () => {
    it('should retrieve chunks filtered by source type', () => {
      initDatabase(tempDir);

      upsertFileChunks(tempDir, '/skill.md', 'h1', [
        {
          id: 'skill-1',
          sourceFile: '/skill.md',
          sourceType: 'skill',
          chunkType: 'frontmatter',
          content: 'Skill content',
          priority: 10,
          metadata: {},
          embedding: Array(384).fill(0.1),
        },
      ]);

      upsertFileChunks(tempDir, '/claude.md', 'h2', [
        {
          id: 'claude-1',
          sourceFile: '/claude.md',
          sourceType: 'claude-md',
          chunkType: 'section',
          content: 'Claude content',
          priority: 5,
          metadata: {},
          embedding: Array(384).fill(0.2),
        },
      ]);

      const skillChunks = getAllChunks(tempDir, ['skill']);
      const claudeChunks = getAllChunks(tempDir, ['claude-md']);
      const allChunks = getAllChunks(tempDir);

      expect(skillChunks.length).toBe(1);
      expect(claudeChunks.length).toBe(1);
      expect(allChunks.length).toBe(2);
    });
  });

  describe('getIndexStats', () => {
    it('should return zero stats for non-existent database', () => {
      const stats = getIndexStats('/non-existent');
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalChunks).toBe(0);
      expect(stats.lastIndexed).toBeNull();
    });

    it('should return correct stats', () => {
      initDatabase(tempDir);

      upsertFileChunks(tempDir, '/skill.md', 'h1', [
        {
          id: 'skill-1',
          sourceFile: '/skill.md',
          sourceType: 'skill',
          chunkType: 'frontmatter',
          content: 'Skill',
          priority: 10,
          metadata: {},
          embedding: Array(384).fill(0.1),
        },
        {
          id: 'skill-2',
          sourceFile: '/skill.md',
          sourceType: 'skill',
          chunkType: 'problem',
          content: 'Problem',
          priority: 8,
          metadata: {},
          embedding: Array(384).fill(0.1),
        },
      ]);

      const stats = getIndexStats(tempDir);

      expect(stats.totalFiles).toBe(1);
      expect(stats.totalChunks).toBe(2);
      expect(stats.skillFiles).toBe(1);
      expect(stats.claudeMdFiles).toBe(0);
      expect(stats.lastIndexed).toBeInstanceOf(Date);
    });
  });

  describe('clearDatabase', () => {
    it('should remove all data', () => {
      initDatabase(tempDir);

      upsertFileChunks(tempDir, '/file.md', 'hash', [
        {
          id: 'chunk-1',
          sourceFile: '/file.md',
          sourceType: 'skill',
          chunkType: 'full',
          content: 'Content',
          priority: 5,
          metadata: {},
          embedding: Array(384).fill(0.1),
        },
      ]);

      clearDatabase(tempDir);

      const stats = getIndexStats(tempDir);
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalChunks).toBe(0);
    });
  });
});
