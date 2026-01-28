/**
 * Embeddings module - Generate embeddings using Transformers.js
 *
 * Uses paraphrase-multilingual-MiniLM-L12-v2 for multilingual support
 * Supports cross-language semantic search (Spanish, English, etc.)
 * No API keys required, fully offline capable
 */

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

// Multilingual model for mixed language corpus
const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBEDDING_DIMENSION = 384;

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

// Retry configuration for model loading
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load the model with retry logic
 */
async function loadModelWithRetry(): Promise<FeatureExtractionPipeline> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Loading embedding model (attempt ${attempt}/${MAX_RETRIES})...`);
      const pipe = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true, // Use quantized model for smaller size
      }) as FeatureExtractionPipeline;
      console.log('Embedding model loaded.');
      return pipe;
    } catch (error) {
      lastError = error as Error;
      console.error(`Failed to load model (attempt ${attempt}/${MAX_RETRIES}):`, lastError.message);

      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(`Failed to load embedding model after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Initialize the embedding pipeline (lazy, singleton)
 */
async function initPipeline(): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    embeddingPipeline = await loadModelWithRetry();
    return embeddingPipeline;
  })();

  return initPromise;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await initPipeline();

  // Truncate text if too long (model has 256 token limit)
  const truncatedText = text.slice(0, 2000);

  const output = await pipe(truncatedText, {
    pooling: 'mean',
    normalize: true,
  });

  // Convert to regular array
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts (batched for efficiency)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const pipe = await initPipeline();

  const embeddings: number[][] = [];

  // Process in batches of 32 for memory efficiency
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 2000));

    // Process batch
    for (const text of batch) {
      const output = await pipe(text, {
        pooling: 'mean',
        normalize: true,
      });
      embeddings.push(Array.from(output.data as Float32Array));
    }

    // Progress indicator for large batches
    if (texts.length > batchSize) {
      const progress = Math.min(i + batchSize, texts.length);
      process.stdout.write(`\rGenerating embeddings: ${progress}/${texts.length}`);
    }
  }

  if (texts.length > batchSize) {
    console.log(); // New line after progress
  }

  return embeddings;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // Since embeddings are normalized, norms should be ~1
  // but calculate anyway for robustness
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  return similarity;
}

/**
 * Get the embedding dimension for the current model
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

/**
 * Preload the model (useful for startup)
 */
export async function preloadModel(): Promise<void> {
  await initPipeline();
}

/**
 * Get the current model ID (for tracking in index metadata)
 */
export function getModelId(): string {
  return MODEL_NAME;
}
