/**
 * Types for Memory Forge embedding system
 */

export interface SkillFrontmatter {
  name: string;
  description: string;
  author?: string;
  version?: string;
  date?: string;
  deprecated?: boolean;
  importance?: number; // 1-10, decided by LLM when creating the skill
}

export interface Chunk {
  id: string;
  sourceFile: string;
  sourceType: 'skill' | 'claude-md' | 'agents-md' | 'knowledge';
  chunkType: 'frontmatter' | 'problem' | 'trigger' | 'solution' | 'verification' | 'section' | 'full';
  content: string;
  heading?: string;
  priority: number; // 1-10, higher = more important
  metadata: {
    skillName?: string;
    knowledgeName?: string;
    sectionPath?: string;
    lineStart?: number;
    lineEnd?: number;
  };
}

export interface IndexedChunk extends Chunk {
  embedding: number[];
  hash: string;
}

export interface FileIndex {
  path: string;
  hash: string;
  indexedAt: Date;
  chunkCount: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  sourceFile: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  sourceTypes?: Array<'skill' | 'claude-md' | 'agents-md' | 'knowledge'>;
  includeContent?: boolean;
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  skillFiles: number;
  claudeMdFiles: number;
  agentsMdFiles: number;
  knowledgeFiles: number;
  lastIndexed: Date | null;
}

export interface SyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}
