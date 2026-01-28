#!/usr/bin/env node
/**
 * Memory Forge MCP Server
 *
 * Provides semantic search over knowledge stored in knowledge/ directory.
 * CLAUDE.md, AGENTS.md, and special directories are NOT indexed but audited.
 *
 * According to SPEC:
 * - Only knowledge/ is indexed (source of truth)
 * - Autoload files are audited for token usage
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
import { saveKnowledge, audit, formatAuditResult } from './forge.js';

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
  'Search for relevant knowledge in the knowledge/ directory. Use this when you need context about errors, patterns, or conventions in the codebase.',
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
 * Index or re-index knowledge files in knowledge/ directory
 */
server.tool(
  'index_knowledge',
  'Index or re-index knowledge files in the knowledge/ directory. Run this after adding new knowledge or updating documentation.',
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
 * Tool: audit_knowledge
 * Audit autoload files for token usage (CLAUDE.md, AGENTS.md, skills)
 */
server.tool(
  'audit_knowledge',
  'Audit autoload files (CLAUDE.md, AGENTS.md, .claude/, .codex/, .opencode/) for token usage. Use this to detect files that are consuming too many tokens and should be moved to knowledge/.',
  {},
  async () => {
    try {
      const result = audit(PROJECT_ROOT);
      const formatted = formatAuditResult(result, PROJECT_ROOT);

      return {
        content: [
          {
            type: 'text' as const,
            text: formatted,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error auditing knowledge: ${(error as Error).message}`,
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
 * Tool: save_knowledge
 * Save valuable knowledge to the knowledge/ directory
 */
server.tool(
  'save_knowledge',
  'Save valuable knowledge to the knowledge/ directory (source of truth). Use this when you have discovered a reusable pattern, a fix for a specific error, or general project conventions.',
  {
    type: z.enum(['skill', 'context']).describe('Type of knowledge: "skill" for specific error fixes/workarounds, "context" for general patterns/conventions'),
    name: z.string().describe('Kebab-case name for the skill (e.g., "mongodb-connection-fix") or title for the context section'),
    content: z.string().describe('The core knowledge/solution to save. Markdown format supported.'),
    description: z.string().optional().describe('Brief description for the skill frontmatter (required for type="skill")'),
    trigger: z.string().optional().describe('Conditions that trigger this skill (required for type="skill")'),
    problem: z.string().optional().describe('Description of the problem this skill solves (required for type="skill")'),
    importance: z.number().min(1).max(10).optional().default(5).describe('Importance of this knowledge (1-10)'),
  },
  async ({ type, name, content, description, trigger, problem, importance }) => {
    try {
      const result = await saveKnowledge(PROJECT_ROOT, {
        type,
        name,
        content,
        description,
        trigger,
        problem,
        importance,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error saving knowledge: ${result.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.message,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error saving knowledge: ${(error as Error).message}`,
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
