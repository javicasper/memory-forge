import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  getEmbeddingDimension,
  preloadModel,
} from '../src/embeddings.js';

describe('embeddings', () => {
  // Preload model before all tests (first run downloads ~22MB)
  beforeAll(async () => {
    await preloadModel();
  }, 120000); // 2 min timeout for model download

  describe('generateEmbedding', () => {
    it('should generate embedding with correct dimension', async () => {
      const embedding = await generateEmbedding('test text');

      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(getEmbeddingDimension());
      expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 dimension
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await generateEmbedding('test text');

      // Check normalization (magnitude should be ~1)
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      expect(magnitude).toBeCloseTo(1, 2);
    });

    it('should handle long text by truncation', async () => {
      const longText = 'a'.repeat(5000);
      const embedding = await generateEmbedding(longText);

      expect(embedding.length).toBe(384);
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['first text', 'second text', 'third text'];
      const embeddings = await generateEmbeddings(texts);

      expect(embeddings.length).toBe(3);
      for (const embedding of embeddings) {
        expect(embedding.length).toBe(384);
      }
    });

    it('should handle empty array', async () => {
      const embeddings = await generateEmbeddings([]);
      expect(embeddings).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 0, 0];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
    });

    it('should throw for vectors of different dimensions', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0];
      expect(() => cosineSimilarity(vec1, vec2)).toThrow();
    });
  });

  describe('semantic similarity', () => {
    it('should find similar texts more similar than unrelated', async () => {
      const [embSimilar1, embSimilar2, embDifferent] = await generateEmbeddings([
        'The quick brown fox jumps over the lazy dog',
        'A fast brown fox leaps over a sleepy dog',
        'TypeScript is a programming language',
      ]);

      const similarityClose = cosineSimilarity(embSimilar1, embSimilar2);
      const similarityFar = cosineSimilarity(embSimilar1, embDifferent);

      expect(similarityClose).toBeGreaterThan(similarityFar);
      expect(similarityClose).toBeGreaterThan(0.7); // High similarity
      expect(similarityFar).toBeLessThan(0.5); // Low similarity
    });

    it('should match error messages semantically', async () => {
      const [embError, embRelated, embUnrelated] = await generateEmbeddings([
        'Stripe webhook signature verification failed',
        'Invalid signature error in webhook validation',
        'How to cook pasta in boiling water',
      ]);

      const relatedSim = cosineSimilarity(embError, embRelated);
      const unrelatedSim = cosineSimilarity(embError, embUnrelated);

      expect(relatedSim).toBeGreaterThan(unrelatedSim);
      expect(relatedSim).toBeGreaterThan(0.5);
    });
  });
});
