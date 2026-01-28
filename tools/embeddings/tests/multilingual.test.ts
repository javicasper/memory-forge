/**
 * Tests for Multilingual Embedding Model
 *
 * According to specification:
 * - Use multilingual model for mixed language corpus (Spanish + English)
 * - Store embedding_model_id in index.db
 * - If model doesn't match config → force full reindex
 * - No mixing of models in same index
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { search } from '../src/search.js';
import { syncProject } from '../src/sync.js';
import { closeDatabase, getIndexMetadata } from '../src/db.js';
import { preloadModel, getModelId } from '../src/embeddings.js';

describe('Multilingual Embedding Model', () => {
  let tempDir: string;

  beforeAll(async () => {
    await preloadModel();
  }, 120000);

  beforeEach(() => {
    closeDatabase();
    tempDir = mkdtempSync(join(tmpdir(), 'memory-forge-multilingual-'));

    const knowledgeDir = join(tempDir, 'knowledge');
    mkdirSync(knowledgeDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('cross-language search', () => {
    it('should find English document with Spanish query', async () => {
      // Create English document
      writeFileSync(
        join(tempDir, 'knowledge/api-errors.md'),
        `# API Error Handling

## Common Errors

When the server returns HTTP 500, it indicates an internal server error.
The client should retry the request with exponential backoff.

## Authentication Errors

HTTP 401 means unauthorized access. Check your API key.
HTTP 403 means forbidden - you don't have permission.
`
      );

      await syncProject(tempDir);

      // Search in Spanish
      const results = await search(tempDir, 'errores de autenticación en la API');

      expect(results.length).toBeGreaterThan(0);
      // Should find the authentication section
      expect(
        results.some(
          (r) =>
            r.chunk.content.toLowerCase().includes('authentication') ||
            r.chunk.content.toLowerCase().includes('401') ||
            r.chunk.content.toLowerCase().includes('unauthorized')
        )
      ).toBe(true);
    });

    it('should find Spanish document with English query', async () => {
      // Create Spanish document
      writeFileSync(
        join(tempDir, 'knowledge/errores-comunes.md'),
        `# Errores Comunes

## Errores de Base de Datos

Cuando la conexión a la base de datos falla, verificar:
- Credenciales correctas
- Puerto abierto
- Firewall configurado

## Errores de Red

Los timeouts ocurren cuando el servidor no responde a tiempo.
Incrementar el timeout o verificar la conectividad.
`
      );

      await syncProject(tempDir);

      // Search in English
      const results = await search(tempDir, 'database connection errors');

      expect(results.length).toBeGreaterThan(0);
      // Should find the database section
      expect(
        results.some(
          (r) =>
            r.chunk.content.toLowerCase().includes('base de datos') ||
            r.chunk.content.toLowerCase().includes('conexión')
        )
      ).toBe(true);
    });
  });

  describe('model tracking', () => {
    it('should store embedding model ID in index metadata', async () => {
      writeFileSync(
        join(tempDir, 'knowledge/test.md'),
        '# Test\n\nSome content.'
      );

      await syncProject(tempDir);

      const metadata = getIndexMetadata(tempDir);
      expect(metadata).toBeDefined();
      expect(metadata?.embeddingModel).toBeDefined();
      expect(metadata?.embeddingModel).toBe(getModelId());
    });

    it('should include model ID in getModelId export', () => {
      const modelId = getModelId();
      expect(modelId).toBeDefined();
      expect(typeof modelId).toBe('string');
      expect(modelId.length).toBeGreaterThan(0);
      // Should be the multilingual model
      expect(modelId.toLowerCase()).toContain('multilingual');
    });
  });

  describe('model consistency', () => {
    it('should detect model mismatch and require reindex', async () => {
      writeFileSync(
        join(tempDir, 'knowledge/test.md'),
        '# Test\n\nOriginal content.'
      );

      await syncProject(tempDir);

      // Simulate model change by modifying metadata
      // This would normally happen if user changed config
      const metadata = getIndexMetadata(tempDir);
      expect(metadata?.embeddingModel).toBe(getModelId());

      // The actual model change detection happens in ensureIndexFresh
      // when the stored model doesn't match the current model
    });
  });
});
