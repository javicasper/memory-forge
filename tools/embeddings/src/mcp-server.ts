#!/usr/bin/env node
/**
 * Memory Forge MCP Server
 *
 * Provides semantic search over knowledge stored in CLAUDE.md and SKILL.md files.
 * Claude Code can use this to retrieve relevant context on-demand.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { search, searchUnique, formatForContext } from './search.js';
import { syncProject } from './sync.js';
import {
  getIndexStats,
  databaseExists,
  closeDatabase,
  getMemoryStats,
  forgetStaleFiles,
} from './db.js';

// Get project root from environment or current directory
const PROJECT_ROOT = process.env.MEMORY_FORGE_PROJECT_ROOT || process.cwd();

const server = new McpServer({
  name: 'memory-forge',
  version: '1.0.0',
});

/**
 * Tool: search_knowledge
 * Search for relevant knowledge based on a query
 */
server.tool(
  'search_knowledge',
  'Search for relevant knowledge in CLAUDE.md and SKILL.md files. Use this when you need context about errors, patterns, or conventions in the codebase.',
  {
    query: z.string().describe('The search query - can be an error message, concept, or question'),
    limit: z.number().optional().default(3).describe('Maximum number of results to return'),
    source_type: z
      .enum(['all', 'skill', 'claude-md', 'agents-md'])
      .optional()
      .default('all')
      .describe('Filter by source type'),
    unique_files: z
      .boolean()
      .optional()
      .default(true)
      .describe('Return at most one result per source file'),
  },
  async ({ query, limit, source_type, unique_files }) => {
    try {
      // Auto-index if no index exists
      if (!databaseExists(PROJECT_ROOT)) {
        await syncProject(PROJECT_ROOT);
      }

      const sourceTypes =
        source_type === 'all'
          ? undefined
          : ([source_type] as Array<'skill' | 'claude-md' | 'agents-md'>);

      const searchFn = unique_files ? searchUnique : search;
      const results = await searchFn(PROJECT_ROOT, query, {
        limit,
        sourceTypes,
        threshold: 0.3,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No relevant knowledge found for this query.',
            },
          ],
        };
      }

      // Format results for context injection
      const contextText = formatForContext(results);

      return {
        content: [
          {
            type: 'text' as const,
            text: contextText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error searching knowledge: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: index_knowledge
 * Index or re-index knowledge files
 */
server.tool(
  'index_knowledge',
  'Index or re-index knowledge files (CLAUDE.md, AGENTS.md, SKILL.md). Run this after adding new skills or updating documentation.',
  {
    force: z
      .boolean()
      .optional()
      .default(false)
      .describe('Force re-index all files, even if unchanged'),
  },
  async ({ force }) => {
    try {
      if (force && databaseExists(PROJECT_ROOT)) {
        const { clearDatabase } = await import('./db.js');
        clearDatabase(PROJECT_ROOT);
      }

      const result = await syncProject(PROJECT_ROOT);

      const summary = [
        `Indexed knowledge in: ${PROJECT_ROOT}`,
        '',
        `Added: ${result.added.length} file(s)`,
        `Updated: ${result.updated.length} file(s)`,
        `Removed: ${result.removed.length} file(s)`,
        `Unchanged: ${result.unchanged.length} file(s)`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: summary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error indexing knowledge: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: knowledge_stats
 * Get statistics about indexed knowledge
 */
server.tool(
  'knowledge_stats',
  'Get statistics about indexed knowledge files and chunks.',
  {},
  async () => {
    try {
      const stats = getIndexStats(PROJECT_ROOT);
      const memStats = getMemoryStats(PROJECT_ROOT);

      const summary = [
        `Knowledge Index Statistics for: ${PROJECT_ROOT}`,
        '',
        `Total files: ${stats.totalFiles}`,
        `Total chunks: ${stats.totalChunks}`,
        `Skill files: ${stats.skillFiles}`,
        `CLAUDE.md files: ${stats.claudeMdFiles}`,
        `AGENTS.md files: ${stats.agentsMdFiles}`,
        `Last indexed: ${stats.lastIndexed ? stats.lastIndexed.toLocaleString() : 'Never'}`,
        '',
        'Memory Usage:',
        `  Never accessed: ${memStats.neverAccessed}`,
        `  Oldest access: ${memStats.oldestAccess ? memStats.oldestAccess.toLocaleString() : 'N/A'}`,
        `  Newest access: ${memStats.newestAccess ? memStats.newestAccess.toLocaleString() : 'N/A'}`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: summary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error getting stats: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: forget_knowledge
 * Remove stale memories based on retention policy
 */
server.tool(
  'forget_knowledge',
  'Remove stale/unused knowledge based on retention policy. Use to clean up old, unused skills and documentation.',
  {
    max_files: z
      .number()
      .optional()
      .describe('Maximum number of files to keep (removes least recently used)'),
    max_age_days: z
      .number()
      .optional()
      .describe('Remove files not accessed in X days'),
  },
  async ({ max_files, max_age_days }) => {
    try {
      if (!max_files && !max_age_days) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Specify at least one of max_files or max_age_days',
            },
          ],
          isError: true,
        };
      }

      const config = {
        maxFiles: max_files,
        maxAgeDays: max_age_days,
      };

      const removed = forgetStaleFiles(PROJECT_ROOT, config);

      if (removed.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No stale files found to remove.',
            },
          ],
        };
      }

      const summary = [
        `Removed ${removed.length} stale file(s):`,
        '',
        ...removed.map((f) => `- ${f.replace(PROJECT_ROOT + '/', '')}`),
      ].join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: summary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error forgetting knowledge: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
