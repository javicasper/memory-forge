/**
 * Search module - Semantic search and ranking
 */

import { SearchResult, SearchOptions } from './types.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';
import { getAllChunks, databaseExists, DbChunk, touchFiles, initDatabase } from './db.js';
import { ensureIndexFresh } from './sync.js';

const DEFAULT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.3;

/**
 * Search for relevant chunks using semantic similarity
 *
 * Automatically checks for changes in knowledge/ and reindexes if needed
 * before performing the search (rehash automático).
 */
export async function search(
  projectRoot: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD,
    sourceTypes,
    includeContent = true,
  } = options;

  // Ensure index is fresh (rehash automático)
  // This will create the database if it doesn't exist
  await ensureIndexFresh(projectRoot);

  // Check if index exists (may still be empty if no knowledge/ files)
  if (!databaseExists(projectRoot)) {
    initDatabase(projectRoot);
  }

  // Get query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Get all chunks
  const chunks = getAllChunks(projectRoot, sourceTypes);

  if (chunks.length === 0) {
    return [];
  }

  // Calculate similarity scores
  const scoredChunks: Array<{ chunk: DbChunk; score: number }> = [];

  for (const chunk of chunks) {
    const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

    // Apply priority boost (up to 20% boost for high priority)
    const priorityBoost = (chunk.priority / 10) * 0.2;
    const adjustedScore = similarity * (1 + priorityBoost);

    if (adjustedScore >= threshold) {
      scoredChunks.push({ chunk, score: adjustedScore });
    }
  }

  // Sort by score descending
  scoredChunks.sort((a, b) => b.score - a.score);

  // Take top results
  const topResults = scoredChunks.slice(0, limit);

  // Update access timestamps for returned files
  const accessedFiles = [...new Set(topResults.map(({ chunk }) => chunk.sourceFile))];
  if (accessedFiles.length > 0) {
    touchFiles(projectRoot, accessedFiles);
  }

  // Format results
  return topResults.map(({ chunk, score }) => ({
    chunk: {
      id: chunk.id,
      sourceFile: chunk.sourceFile,
      sourceType: chunk.sourceType,
      chunkType: chunk.chunkType,
      content: includeContent ? chunk.content : '',
      heading: chunk.heading,
      priority: chunk.priority,
      metadata: chunk.metadata,
    },
    score,
    sourceFile: chunk.sourceFile,
  }));
}

/**
 * Search with deduplication by source file
 * Returns at most one result per unique source file
 */
export async function searchUnique(
  projectRoot: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Get more results than limit to account for duplicates
  const allResults = await search(projectRoot, query, {
    ...options,
    limit: (options.limit || DEFAULT_LIMIT) * 3,
  });

  // Deduplicate by source file, keeping highest score
  const seenFiles = new Set<string>();
  const uniqueResults: SearchResult[] = [];

  for (const result of allResults) {
    if (!seenFiles.has(result.sourceFile)) {
      seenFiles.add(result.sourceFile);
      uniqueResults.push(result);

      if (uniqueResults.length >= (options.limit || DEFAULT_LIMIT)) {
        break;
      }
    }
  }

  return uniqueResults;
}

/**
 * Format search results for display
 */
export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No matching results found.';
  }

  const lines: string[] = [];
  lines.push(`Found ${results.length} relevant result(s):\n`);

  for (let i = 0; i < results.length; i++) {
    const { chunk, score, sourceFile } = results[i];
    const scorePercent = (score * 100).toFixed(1);

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📄 ${sourceFile}`);
    lines.push(`   Type: ${chunk.sourceType} | Section: ${chunk.heading || chunk.chunkType}`);
    lines.push(`   Score: ${scorePercent}% | Priority: ${chunk.priority}/10`);

    if (chunk.metadata.skillName) {
      lines.push(`   Skill: ${chunk.metadata.skillName}`);
    }

    lines.push('');
    lines.push(chunk.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format results as JSON (for programmatic use)
 */
export function formatResultsJson(results: SearchResult[]): string {
  return JSON.stringify(
    results.map(({ chunk, score, sourceFile }) => ({
      sourceFile,
      sourceType: chunk.sourceType,
      chunkType: chunk.chunkType,
      heading: chunk.heading,
      score: Math.round(score * 1000) / 1000,
      priority: chunk.priority,
      skillName: chunk.metadata.skillName,
      content: chunk.content,
    })),
    null,
    2
  );
}

/**
 * Get context for AI agent consumption
 * Returns formatted markdown suitable for injection into context
 */
export function formatForContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Relevant Knowledge\n');
  lines.push('The following knowledge was found relevant to your current task:\n');

  for (const { chunk, score } of results) {
    const relevance = score >= 0.7 ? 'High' : score >= 0.5 ? 'Medium' : 'Low';

    if (chunk.metadata.skillName) {
      lines.push(`### Skill: ${chunk.metadata.skillName}`);
    } else {
      lines.push(`### ${chunk.heading || 'Context'}`);
    }

    lines.push(`_Source: ${chunk.sourceFile} | Relevance: ${relevance}_\n`);
    lines.push(chunk.content);
    lines.push('');
  }

  return lines.join('\n');
}
