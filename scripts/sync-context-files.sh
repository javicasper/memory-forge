#!/bin/bash

# Memory Forge - Context File Synchronization
# Keeps CLAUDE.md and AGENTS.md in sync for cross-tool compatibility

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${1:-.}"

echo "🔄 Memory Forge - Syncing context files..."
echo ""

sync_file() {
    local source="$1"
    local target="$2"
    local dir="$3"

    local source_path="$dir/$source"
    local target_path="$dir/$target"

    if [ -f "$source_path" ] && [ ! -f "$target_path" ]; then
        echo "  📝 Creating $target from $source in $dir"
        cp "$source_path" "$target_path"
    elif [ -f "$source_path" ] && [ -f "$target_path" ]; then
        # Check if they're different
        if ! diff -q "$source_path" "$target_path" > /dev/null 2>&1; then
            echo "  ⚠️  $source and $target differ in $dir"
            echo "      Use: cp $source_path $target_path (or vice versa)"
        fi
    fi
}

# Find all directories with CLAUDE.md or AGENTS.md
find "$PROJECT_ROOT" -type f \( -name "CLAUDE.md" -o -name "AGENTS.md" \) -not -path "*/.git/*" -not -path "*/node_modules/*" | while read -r file; do
    dir=$(dirname "$file")

    # Sync in both directions
    sync_file "CLAUDE.md" "AGENTS.md" "$dir"
    sync_file "AGENTS.md" "CLAUDE.md" "$dir"
done

echo ""
echo "✅ Sync complete!"
echo ""
echo "Tip: Add this to your pre-commit hook for automatic sync:"
echo "  ./scripts/sync-context-files.sh"
