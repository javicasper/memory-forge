/**
 * Chunker module - Parses SKILL.md and CLAUDE.md files into semantic chunks
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import matter from 'gray-matter';
import { Chunk, SkillFrontmatter } from './types.js';

const MAX_CHUNK_TOKENS = 500; // Approximate token limit per chunk
const CHARS_PER_TOKEN = 4; // Rough estimate

/**
 * Generate a unique ID for a chunk
 */
function generateChunkId(sourceFile: string, chunkType: string, index: number): string {
  const hash = createHash('md5')
    .update(`${sourceFile}:${chunkType}:${index}`)
    .digest('hex')
    .substring(0, 8);
  return `${chunkType}-${hash}`;
}

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks that don't exceed max tokens
 */
function splitByTokenLimit(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 <= maxChars) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If single paragraph is too long, split by sentences
      if (para.length > maxChars) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        currentChunk = '';
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 <= maxChars) {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
          }
        }
      } else {
        currentChunk = para;
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Extract sections from markdown content by heading level
 */
function extractSections(content: string, level: number = 2): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentHeading = '';
  let currentContent: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const headingMatch = line.match(new RegExp(`^#{${level}}\\s+(.+)$`));

    if (headingMatch) {
      // Save previous section
      if (inSection && currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim());
      }
      currentHeading = headingMatch[1];
      currentContent = [];
      inSection = true;
    } else if (inSection) {
      // Check if we hit a higher-level heading
      const higherHeading = line.match(/^#{1,}(?=\s)/);
      if (higherHeading && higherHeading[0].length < level) {
        // End current section
        if (currentHeading) {
          sections.set(currentHeading, currentContent.join('\n').trim());
        }
        inSection = false;
        currentHeading = '';
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
  }

  // Save last section
  if (inSection && currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim());
  }

  return sections;
}

/**
 * Parse a SKILL.md file into semantic chunks
 */
export function parseSkillFile(filePath: string): Chunk[] {
  const chunks: Chunk[] = [];
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(fileContent);

  const fm = frontmatter as SkillFrontmatter;
  const skillName = fm.name || filePath.split('/').slice(-2)[0];
  let chunkIndex = 0;

  // 1. Frontmatter chunk (always highest priority)
  if (fm.name && fm.description) {
    chunks.push({
      id: generateChunkId(filePath, 'frontmatter', chunkIndex++),
      sourceFile: filePath,
      sourceType: 'skill',
      chunkType: 'frontmatter',
      content: `Skill: ${fm.name}\n\nDescription: ${fm.description}`,
      priority: 10,
      metadata: {
        skillName,
      },
    });
  }

  // Extract H2 sections
  const sections = extractSections(content, 2);

  // 2. Problem section
  const problemContent = sections.get('Problem');
  if (problemContent) {
    chunks.push({
      id: generateChunkId(filePath, 'problem', chunkIndex++),
      sourceFile: filePath,
      sourceType: 'skill',
      chunkType: 'problem',
      content: `Problem:\n${problemContent}`,
      heading: 'Problem',
      priority: 8,
      metadata: {
        skillName,
        sectionPath: 'Problem',
      },
    });
  }

  // 3. Trigger Conditions (very important for search)
  const triggerContent = sections.get('Trigger Conditions');
  if (triggerContent) {
    chunks.push({
      id: generateChunkId(filePath, 'trigger', chunkIndex++),
      sourceFile: filePath,
      sourceType: 'skill',
      chunkType: 'trigger',
      content: `Trigger Conditions for ${skillName}:\n${triggerContent}`,
      heading: 'Trigger Conditions',
      priority: 9,
      metadata: {
        skillName,
        sectionPath: 'Trigger Conditions',
      },
    });
  }

  // 4. Solution section (may need splitting)
  const solutionContent = sections.get('Solution');
  if (solutionContent) {
    const solutionChunks = splitByTokenLimit(solutionContent, MAX_CHUNK_TOKENS);
    for (let i = 0; i < solutionChunks.length; i++) {
      chunks.push({
        id: generateChunkId(filePath, 'solution', chunkIndex++),
        sourceFile: filePath,
        sourceType: 'skill',
        chunkType: 'solution',
        content: `Solution for ${skillName} (part ${i + 1}/${solutionChunks.length}):\n${solutionChunks[i]}`,
        heading: 'Solution',
        priority: 7,
        metadata: {
          skillName,
          sectionPath: 'Solution',
        },
      });
    }
  }

  // 5. Verification section
  const verificationContent = sections.get('Verification');
  if (verificationContent) {
    chunks.push({
      id: generateChunkId(filePath, 'verification', chunkIndex++),
      sourceFile: filePath,
      sourceType: 'skill',
      chunkType: 'verification',
      content: `Verification for ${skillName}:\n${verificationContent}`,
      heading: 'Verification',
      priority: 5,
      metadata: {
        skillName,
        sectionPath: 'Verification',
      },
    });
  }

  // 6. Other sections (Notes, Example, etc.)
  for (const [heading, sectionContent] of sections) {
    if (['Problem', 'Trigger Conditions', 'Solution', 'Verification'].includes(heading)) {
      continue;
    }

    const sectionChunks = splitByTokenLimit(sectionContent, MAX_CHUNK_TOKENS);
    for (let i = 0; i < sectionChunks.length; i++) {
      chunks.push({
        id: generateChunkId(filePath, 'section', chunkIndex++),
        sourceFile: filePath,
        sourceType: 'skill',
        chunkType: 'section',
        content: `${heading} for ${skillName}:\n${sectionChunks[i]}`,
        heading,
        priority: 4,
        metadata: {
          skillName,
          sectionPath: heading,
        },
      });
    }
  }

  return chunks;
}

/**
 * Parse a CLAUDE.md or AGENTS.md file into semantic chunks
 */
export function parseContextFile(filePath: string): Chunk[] {
  const chunks: Chunk[] = [];
  const fileContent = readFileSync(filePath, 'utf-8');
  const fileName = filePath.split('/').pop() || '';
  const sourceType = fileName.toLowerCase().includes('agent') ? 'agents-md' : 'claude-md';

  // Check if it has frontmatter
  const { content } = matter(fileContent);
  let chunkIndex = 0;

  // Extract H2 sections
  const h2Sections = extractSections(content, 2);

  for (const [heading, sectionContent] of h2Sections) {
    // Check if section is large enough to need H3 splitting
    if (estimateTokens(sectionContent) > MAX_CHUNK_TOKENS) {
      // Try to split by H3
      const h3Sections = extractSections(`## ${heading}\n${sectionContent}`, 3);

      if (h3Sections.size > 1) {
        // Split by H3
        for (const [subHeading, subContent] of h3Sections) {
          const subChunks = splitByTokenLimit(subContent, MAX_CHUNK_TOKENS);
          for (let i = 0; i < subChunks.length; i++) {
            chunks.push({
              id: generateChunkId(filePath, 'section', chunkIndex++),
              sourceFile: filePath,
              sourceType,
              chunkType: 'section',
              content: `${heading} > ${subHeading}:\n${subChunks[i]}`,
              heading: `${heading} > ${subHeading}`,
              priority: 6,
              metadata: {
                sectionPath: `${heading} > ${subHeading}`,
              },
            });
          }
        }
      } else {
        // No H3s, split by token limit
        const sectionChunks = splitByTokenLimit(sectionContent, MAX_CHUNK_TOKENS);
        for (let i = 0; i < sectionChunks.length; i++) {
          chunks.push({
            id: generateChunkId(filePath, 'section', chunkIndex++),
            sourceFile: filePath,
            sourceType,
            chunkType: 'section',
            content: `${heading}:\n${sectionChunks[i]}`,
            heading,
            priority: 6,
            metadata: {
              sectionPath: heading,
            },
          });
        }
      }
    } else {
      // Section fits in one chunk
      chunks.push({
        id: generateChunkId(filePath, 'section', chunkIndex++),
        sourceFile: filePath,
        sourceType,
        chunkType: 'section',
        content: `${heading}:\n${sectionContent}`,
        heading,
        priority: 6,
        metadata: {
          sectionPath: heading,
        },
      });
    }
  }

  // If no sections found, create a single chunk with full content
  if (chunks.length === 0 && content.trim()) {
    const fullChunks = splitByTokenLimit(content, MAX_CHUNK_TOKENS);
    for (let i = 0; i < fullChunks.length; i++) {
      chunks.push({
        id: generateChunkId(filePath, 'full', chunkIndex++),
        sourceFile: filePath,
        sourceType,
        chunkType: 'full',
        content: fullChunks[i],
        priority: 5,
        metadata: {},
      });
    }
  }

  return chunks;
}

export interface ParseResult {
  chunks: Chunk[];
  importance?: number; // From frontmatter, if specified
}

/**
 * Parse any supported file into chunks
 * Returns chunks and importance (if specified in frontmatter)
 */
export function parseFile(filePath: string): ParseResult {
  const fileName = filePath.toLowerCase();

  if (fileName.endsWith('skill.md')) {
    return parseSkillFileWithMeta(filePath);
  } else if (fileName.endsWith('claude.md') || fileName.endsWith('agents.md')) {
    return { chunks: parseContextFile(filePath) };
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}

/**
 * Parse SKILL.md and extract importance from frontmatter
 */
function parseSkillFileWithMeta(filePath: string): ParseResult {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data: frontmatter } = matter(fileContent);
  const fm = frontmatter as SkillFrontmatter;

  return {
    chunks: parseSkillFile(filePath),
    importance: fm.importance,
  };
}

/**
 * Calculate hash of file content for change detection
 */
export function calculateFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}
