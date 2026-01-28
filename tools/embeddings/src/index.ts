#!/usr/bin/env node
/**
 * Memory Forge CLI - Knowledge system with semantic search
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { syncProject, formatSyncResult, discoverFiles } from './sync.js';
import { search, searchUnique, formatResults, formatResultsJson, formatForContext } from './search.js';
import {
  getIndexStats,
  closeDatabase,
  databaseExists,
  clearDatabase,
  getMemoryStats,
  forgetStaleFiles,
  getStaleFiles,
} from './db.js';
import { preloadModel } from './embeddings.js';

const program = new Command();

program
  .name('memory-forge')
  .description('Knowledge system with semantic search for AI coding agents')
  .version('1.0.0');

/**
 * Index command - Create or update the knowledge index
 */
program
  .command('index')
  .description('Index knowledge files (CLAUDE.md, AGENTS.md, SKILL.md)')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('-f, --force', 'Force re-index all files')
  .action(async (options) => {
    const projectRoot = resolve(options.path);
    console.log(`Indexing knowledge in: ${projectRoot}\n`);

    try {
      if (options.force) {
        console.log('Force re-indexing all files...\n');
        if (databaseExists(projectRoot)) {
          clearDatabase(projectRoot);
        }
      }

      const result = await syncProject(projectRoot);
      console.log('\n' + formatSyncResult(result, projectRoot));

      const stats = getIndexStats(projectRoot);
      console.log(`\nIndex stats:`);
      console.log(`  Total chunks: ${stats.totalChunks}`);
      console.log(`  Skills: ${stats.skillFiles}`);
      console.log(`  CLAUDE.md files: ${stats.claudeMdFiles}`);
      console.log(`  AGENTS.md files: ${stats.agentsMdFiles}`);
    } catch (error) {
      console.error('Error indexing:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/**
 * Query command - Search the knowledge index
 */
program
  .command('query <text>')
  .description('Search for relevant knowledge')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('-n, --limit <number>', 'Maximum results', '5')
  .option('-t, --threshold <number>', 'Minimum similarity threshold (0-1)', '0.3')
  .option('--json', 'Output as JSON')
  .option('--context', 'Output formatted for AI context injection')
  .option('--unique', 'Return at most one result per source file')
  .option('--type <types>', 'Filter by source type (skill,claude-md,agents-md)', '')
  .action(async (text, options) => {
    const projectRoot = resolve(options.path);

    try {
      // Check if index exists
      if (!databaseExists(projectRoot)) {
        console.log('No index found. Creating index first...\n');
        await syncProject(projectRoot);
        console.log('');
      }

      const searchOptions = {
        limit: parseInt(options.limit, 10),
        threshold: parseFloat(options.threshold),
        sourceTypes: options.type
          ? (options.type.split(',') as Array<'skill' | 'claude-md' | 'agents-md'>)
          : undefined,
      };

      const searchFn = options.unique ? searchUnique : search;
      const results = await searchFn(projectRoot, text, searchOptions);

      if (options.json) {
        console.log(formatResultsJson(results));
      } else if (options.context) {
        console.log(formatForContext(results));
      } else {
        console.log(formatResults(results));
      }
    } catch (error) {
      console.error('Error searching:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/**
 * Sync command - Update index with changed files
 */
program
  .command('sync')
  .description('Sync index with file changes')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .action(async (options) => {
    const projectRoot = resolve(options.path);

    try {
      console.log(`Syncing knowledge index in: ${projectRoot}\n`);
      const result = await syncProject(projectRoot);
      console.log('\n' + formatSyncResult(result, projectRoot));
    } catch (error) {
      console.error('Error syncing:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/**
 * Stats command - Show index statistics
 */
program
  .command('stats')
  .description('Show index statistics')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .action((options) => {
    const projectRoot = resolve(options.path);

    try {
      if (!databaseExists(projectRoot)) {
        console.log('No index found. Run `memory-forge index` to create one.');
        return;
      }

      const stats = getIndexStats(projectRoot);
      console.log('Index Statistics:');
      console.log(`  Total files: ${stats.totalFiles}`);
      console.log(`  Total chunks: ${stats.totalChunks}`);
      console.log(`  Skill files: ${stats.skillFiles}`);
      console.log(`  CLAUDE.md files: ${stats.claudeMdFiles}`);
      console.log(`  AGENTS.md files: ${stats.agentsMdFiles}`);
      console.log(
        `  Last indexed: ${stats.lastIndexed ? stats.lastIndexed.toLocaleString() : 'Never'}`
      );
    } finally {
      closeDatabase();
    }
  });

/**
 * List command - Show indexed files
 */
program
  .command('list')
  .description('List all indexed files')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('--discover', 'Show discoverable files (not yet indexed)')
  .action((options) => {
    const projectRoot = resolve(options.path);

    try {
      if (options.discover) {
        const files = discoverFiles(projectRoot);
        console.log('Discoverable knowledge files:\n');
        for (const file of files) {
          console.log(`  ${file.replace(projectRoot + '/', '')}`);
        }
        console.log(`\nTotal: ${files.length} file(s)`);
      } else {
        if (!databaseExists(projectRoot)) {
          console.log('No index found. Run `memory-forge index` to create one.');
          return;
        }

        const stats = getIndexStats(projectRoot);
        console.log('Indexed files:\n');
        console.log(`  (Run with --discover to see all discoverable files)`);
        console.log(`\nTotal indexed: ${stats.totalFiles} file(s)`);
      }
    } finally {
      closeDatabase();
    }
  });

/**
 * Preload command - Pre-download the embedding model
 */
program
  .command('preload')
  .description('Pre-download the embedding model')
  .action(async () => {
    try {
      console.log('Pre-loading embedding model...');
      await preloadModel();
      console.log('Model ready!');
    } catch (error) {
      console.error('Error preloading model:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Clear command - Remove the index
 */
program
  .command('clear')
  .description('Clear the knowledge index')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .action((options) => {
    const projectRoot = resolve(options.path);

    try {
      if (!databaseExists(projectRoot)) {
        console.log('No index found.');
        return;
      }

      clearDatabase(projectRoot);
      console.log('Index cleared.');
    } finally {
      closeDatabase();
    }
  });

/**
 * Memory command - Show memory usage and access patterns
 */
program
  .command('memory')
  .description('Show memory usage and access patterns')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .action((options) => {
    const projectRoot = resolve(options.path);

    try {
      if (!databaseExists(projectRoot)) {
        console.log('No index found. Run `memory-forge index` to create one.');
        return;
      }

      const stats = getMemoryStats(projectRoot);

      console.log('Memory Usage Statistics:\n');
      console.log(`  Total files: ${stats.totalFiles}`);
      console.log(`  Total chunks: ${stats.totalChunks}`);
      console.log(`  Never accessed: ${stats.neverAccessed}`);
      console.log(
        `  Oldest access: ${stats.oldestAccess ? stats.oldestAccess.toLocaleString() : 'N/A'}`
      );
      console.log(
        `  Newest access: ${stats.newestAccess ? stats.newestAccess.toLocaleString() : 'N/A'}`
      );

      if (stats.filesByAge.length > 0) {
        console.log('\nFiles by last access (oldest first):\n');
        for (const file of stats.filesByAge) {
          const age = file.lastAccessed
            ? `${Math.floor((Date.now() - file.lastAccessed.getTime()) / (1000 * 60 * 60 * 24))}d ago`
            : 'never';
          const shortPath = file.path.replace(projectRoot + '/', '');
          console.log(`  ${shortPath}`);
          console.log(`    Last access: ${age} | Access count: ${file.accessCount}`);
        }
      }
    } finally {
      closeDatabase();
    }
  });

/**
 * Forget command - Remove stale memories based on retention policy
 */
program
  .command('forget')
  .description('Remove stale memories based on retention policy')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('--max-files <number>', 'Maximum number of files to keep')
  .option('--max-age <days>', 'Remove files not accessed in X days')
  .option('--dry-run', 'Show what would be removed without removing')
  .action((options) => {
    const projectRoot = resolve(options.path);

    try {
      if (!databaseExists(projectRoot)) {
        console.log('No index found.');
        return;
      }

      const config = {
        maxFiles: options.maxFiles ? parseInt(options.maxFiles, 10) : undefined,
        maxAgeDays: options.maxAge ? parseInt(options.maxAge, 10) : undefined,
      };

      if (!config.maxFiles && !config.maxAgeDays) {
        console.log('Error: Specify at least one of --max-files or --max-age');
        process.exit(1);
      }

      if (options.dryRun) {
        const staleFiles = getStaleFiles(projectRoot, config);
        if (staleFiles.length === 0) {
          console.log('No files would be removed.');
        } else {
          console.log(`Would remove ${staleFiles.length} file(s):\n`);
          for (const file of staleFiles) {
            console.log(`  - ${file.replace(projectRoot + '/', '')}`);
          }
        }
      } else {
        const removed = forgetStaleFiles(projectRoot, config);
        if (removed.length === 0) {
          console.log('No files removed.');
        } else {
          console.log(`Removed ${removed.length} file(s):\n`);
          for (const file of removed) {
            console.log(`  - ${file.replace(projectRoot + '/', '')}`);
          }
        }
      }
    } finally {
      closeDatabase();
    }
  });

program.parse();
