# Memory Forge Embeddings

Semantic search system for knowledge stored in the `knowledge/` directory.

## Why Embeddings?

### The Problem: Context Bloat

Without embeddings, **all** knowledge is loaded in every session:

```
Typical session WITHOUT embeddings:
┌─────────────────────────────────────────────────────────────┐
│ Full CLAUDE.md                →  ~2,000 tokens              │
│ 30 loaded skills              →  ~15,000 tokens             │
│ Skills from other modules     →  ~8,000 tokens              │
├─────────────────────────────────────────────────────────────┤
│ TOTAL per session             →  ~25,000 tokens             │
│ × 50 sessions/day             →  1,250,000 tokens/day       │
└─────────────────────────────────────────────────────────────┘
```

**Problems:**
- 💸 Tokens wasted on irrelevant context
- 🐌 Slower responses due to large context
- 🔍 No semantic search: "webhook fails" doesn't find "signature verification failed"
- 📚 Practical limit of ~50 skills before it becomes unmanageable

### The Solution: On-demand Semantic Search

With embeddings, only **relevant** content is loaded:

```
Typical session WITH embeddings:
┌─────────────────────────────────────────────────────────────┐
│ User: "the stripe webhook is failing"                       │
│                                                             │
│ 1. Claude detects need for context                          │
│ 2. Calls search_knowledge("stripe webhook failing")         │
│ 3. System finds relevant chunks (~500 tokens)               │
│ 4. Only those chunks are injected into context              │
├─────────────────────────────────────────────────────────────┤
│ TOTAL per session             →  ~500-2,000 tokens          │
│ Reduction                     →  90-95%                     │
└─────────────────────────────────────────────────────────────┘
```

### Benefits

| Metric | Without Embeddings | With Embeddings | Improvement |
|--------|-------------------|-----------------|-------------|
| Tokens/session | ~25,000 | ~2,000 | **92%** less |
| Search | Exact (keywords) | Semantic | Finds synonyms |
| Supported knowledge | ~50 files | **Unlimited** | No practical limit |
| Latency | High (large context) | Low | Faster responses |

### Semantic vs Exact Search

```
EXACT search (without embeddings):
  Query: "webhook validation error"
  ❌ Doesn't find: "Stripe signature verification failed"
  ❌ Doesn't find: "Invalid webhook signature"

SEMANTIC search (with embeddings):
  Query: "webhook validation error"
  ✅ Finds: "Stripe signature verification failed" (similarity 0.85)
  ✅ Finds: "Invalid webhook signature" (similarity 0.78)
  ✅ Finds: "HTTP 400 on webhook endpoint" (similarity 0.72)
```

### Cross-Language Search

The multilingual model supports searching across languages:

```
Query in Spanish: "errores de autenticación"
  ✅ Finds English doc: "Authentication Errors - HTTP 401 means unauthorized"

Query in English: "database connection errors"
  ✅ Finds Spanish doc: "Errores de Base de Datos - conexión falla"
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ knowledge/  │     │  Chunker    │     │  SQLite DB  │     │   Search    │
│ *.md files  │ ──► │  (semantic  │ ──► │  (chunks +  │ ──► │  (cosine    │
│             │     │   parsing)  │     │  embeddings)│     │  similarity)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │Transformers │
                    │.js (local)  │
                    │ 22MB model  │
                    └─────────────┘
```

**What gets indexed:**
- ✅ `knowledge/*.md` - All markdown files in knowledge/ directory
- ❌ `CLAUDE.md` - NOT indexed (autoloaded by agent)
- ❌ `AGENTS.md` - NOT indexed (autoloaded by agent)
- ❌ `.claude/skills/` - NOT indexed (autoloaded by agent)

**Why this separation?** Autoload files (CLAUDE.md, skills) are already loaded in every session. Indexing them would duplicate tokens. The `knowledge/` directory is for content that should be searched on-demand.

**Components:**
- **Chunker**: Splits markdown files into semantic chunks (by headings)
- **Embeddings**: Generates vectors with Transformers.js (paraphrase-multilingual-MiniLM-L12-v2, 384 dimensions)
- **SQLite**: Stores chunks and embeddings locally
- **Search**: Cosine similarity search with priority ranking

**Features:**
- 🔒 **100% local** - No API keys, no data sent to third parties
- 📦 **Zero external dependencies** - Just Node.js
- 🌍 **Multilingual** - Cross-language search (Spanish ↔ English)
- 🧠 **Memory with forgetting** - LRU system forgets unused knowledge
- ⚡ **Small model** - 22MB, downloaded once
- 🔄 **Auto-rehash** - Index stays fresh automatically

## Installation

### Option 1: Quick install with npm (recommended)

```bash
# Add to Claude Code (in your project directory)
claude mcp add memory-forge -- npx -y @memory-forge/embeddings
```

Done! The MCP server is configured automatically and uses the current directory as project root.

### Option 2: Install from source

```bash
# 1. Clone and install
cd /path/to/memory-forge/tools/embeddings
npm install
npm run build

# 2. Add to Claude Code
claude mcp add memory-forge -- node /full/path/to/memory-forge/tools/embeddings/dist/mcp-server.js
```

### Option 3: Manual configuration

If you prefer to edit the configuration manually, add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "memory-forge": {
      "command": "npx",
      "args": ["-y", "@memory-forge/embeddings"]
    }
  }
}
```

Or for local installation:

```json
{
  "mcpServers": {
    "memory-forge": {
      "command": "node",
      "args": ["/full/path/to/memory-forge/tools/embeddings/dist/mcp-server.js"]
    }
  }
}
```

### Project-scoped configuration

To share the configuration with your team, use project scope:

```bash
claude mcp add --scope project memory-forge -- npx -y @memory-forge/embeddings
```

This creates `.mcp.json` in the project root (add it to git).

### Verify installation

```bash
# List installed MCPs
claude mcp list

# In Claude Code, you should have these tools:
# - search_knowledge
# - save_knowledge
# - index_knowledge
# - knowledge_stats
# - audit_knowledge
# - forget_knowledge
```

## Usage

### MCP Server (recommended for Claude Code)

Claude automatically uses the tools when it detects a need for context:

```
User: "The Stripe webhook returns error 400"

Claude: [Internally calls search_knowledge]
        "Found relevant knowledge. The common problem is that
         the body is parsed before verifying the signature..."
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_knowledge` | Semantic search in knowledge/ |
| `save_knowledge` | Save skills or context to knowledge/ |
| `index_knowledge` | Manually trigger reindexing |
| `knowledge_stats` | Show index statistics |
| `audit_knowledge` | Check token usage in autoload files |
| `forget_knowledge` | Remove old/unused knowledge |

### CLI (for other CLIs or manual use)

```bash
# Index project knowledge
memory-forge index

# Search
memory-forge query "webhook signature error"
memory-forge query "testing patterns" --limit 3 --json

# View memory statistics
memory-forge memory

# Forget old memories (unused in 30 days)
memory-forge forget --max-age 30

# Keep maximum 100 files
memory-forge forget --max-files 100 --dry-run
```

## Memory System with Forgetting

The system simulates human memory: unused knowledge is forgotten.

### Importance (1-10)

When Memory Forge saves knowledge, it assigns an importance rating:

```yaml
---
name: critical-auth-pattern
importance: 9  # Critical, never forget
---
```

| Value | Meaning | Gets deleted |
|-------|---------|--------------|
| 9-10 | Critical | ❌ Never (protected) |
| 6-8 | Very important | ❌ Never (protected) |
| 4-5 | Useful (default) | ✅ If not used |
| 1-3 | Ephemeral | ✅ First to be deleted |

### Forgetting Algorithm

```
When deciding what to forget:
1. Files with importance >= 8 → NEVER deleted
2. From the rest, order by:
   a. Lowest importance first
   b. Lowest access_count (usage)
   c. Oldest last_accessed
3. Delete according to policy (max_age or max_files)
```

### Example

```
Memory state:
├── api-patterns.md (importance: 8, accesses: 30) → PROTECTED
├── stripe-webhook.md (importance: 5, accesses: 10) → Candidate
├── temp-fix.md (importance: 2, accesses: 1) → Deleted first
└── old-workaround.md (importance: 4, accesses: 0) → Deleted second
```

## Chunking Strategy

### knowledge/*.md → Semantic Chunks

| Chunk | Priority | Content |
|-------|----------|---------|
| frontmatter | 10 | Name, description, triggers |
| heading (H2) | 8 | Section title + content |
| heading (H3) | 6 | Subsection title + content |

### Chunking Rules

- Splits by H2 (`## Section`)
- If section > 500 tokens, subdivides by H3
- Preserves hierarchy context
- Frontmatter gets highest priority for search matching

## Tests

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Project Structure

```
tools/embeddings/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── mcp-server.ts   # MCP Server for Claude Code
│   ├── chunker.ts      # File parsing → chunks
│   ├── embeddings.ts   # Generation with Transformers.js
│   ├── db.ts           # SQLite + memory operations
│   ├── search.ts       # Semantic search
│   ├── sync.ts         # Change detection + auto-rehash
│   ├── forge.ts        # Knowledge management (save, audit)
│   └── types.ts        # TypeScript types
├── tests/
│   ├── chunker.test.ts
│   ├── db.test.ts
│   ├── embeddings.test.ts
│   ├── search.test.ts
│   ├── multilingual.test.ts  # Cross-language search tests
│   └── rehash.test.ts        # Auto-rehash tests
├── package.json
└── tsconfig.json
```

## Release and Publishing (for maintainers)

Releases are **automatic** via GitHub Actions when a tag is created.

### Create a new release

```bash
# 1. Make sure you're on main with everything committed
git checkout main
git pull

# 2. Create version tag
git tag v1.0.0
git push origin v1.0.0
```

**GitHub Actions automatically:**
1. ✅ Runs tests
2. ✅ Builds the project
3. ✅ Publishes to npm
4. ✅ Creates GitHub Release with changelog

### Required configuration (once)

1. **NPM Token**: In GitHub repo → Settings → Secrets → `NPM_TOKEN`
   - Create at npmjs.com → Access Tokens → Generate New Token (Automation)

2. **npm scope**: Create `@memory-forge` organization on npmjs.com
   - Or change the package name in `package.json`

### Versioning

We follow [SemVer](https://semver.org/):
- `v1.0.0` → Stable release
- `v1.1.0` → New feature (backward compatible)
- `v1.0.1` → Bug fix
- `v2.0.0-beta.1` → Pre-release (not marked as latest on npm)

## Troubleshooting

### "No index found"

```bash
memory-forge index  # Create index first
```

Or just use `search_knowledge` - it auto-indexes on first use.

### MCP server doesn't appear in Claude Code

1. Verify absolute paths in configuration
2. Restart Claude Code completely
3. Check logs: `~/.claude/logs/`

### Model takes time to load

First run downloads the model (~22MB). After that it uses local cache.

```bash
memory-forge preload  # Pre-download model
```

### SQLite permission error

The `.memory-forge/` directory must be writable:

```bash
chmod 755 .memory-forge
```

### Index seems stale

The index auto-refreshes before each search. If you want to force a full reindex:

```bash
memory-forge index --force
```
