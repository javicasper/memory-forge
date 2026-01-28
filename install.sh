#!/bin/bash

# Memory Forge Installer
# Installs the continuous learning system for Claude Code

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Memory Forge Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Error: Target directory '$TARGET_DIR' does not exist"
    exit 1
fi

# Create .claude directories if they don't exist
echo "📁 Creating directories..."
mkdir -p "$TARGET_DIR/.claude/skills"
mkdir -p "$TARGET_DIR/.claude/hooks"

# Copy skill files
echo "📋 Installing memory-forge skill..."
cp -r "$SCRIPT_DIR/.claude/skills/memory-forge" "$TARGET_DIR/.claude/skills/"

# Copy hook
echo "🔗 Installing activation hook..."
cp "$SCRIPT_DIR/.claude/hooks/memory-forge-activator.sh" "$TARGET_DIR/.claude/hooks/"
chmod +x "$TARGET_DIR/.claude/hooks/memory-forge-activator.sh"

# Check if settings.json exists
SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    echo ""
    echo "⚠️  Found existing .claude/settings.json"
    echo "   Please add the following hook configuration manually:"
    echo ""
    echo '   "hooks": {'
    echo '     "UserPromptSubmit": ['
    echo '       {'
    echo '         "hooks": ['
    echo '           {'
    echo '             "type": "command",'
    echo '             "command": ".claude/hooks/memory-forge-activator.sh"'
    echo '           }'
    echo '         ]'
    echo '       }'
    echo '     ]'
    echo '   }'
    echo ""
else
    echo "📝 Creating settings.json with hook configuration..."
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/memory-forge-activator.sh"
          }
        ]
      }
    ]
  }
}
EOF
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Memory Forge installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Installed to: $TARGET_DIR/.claude/"
echo ""
echo "Usage:"
echo "  • The activation hook will remind you to evaluate learning"
echo "  • Use /memory-forge to extract knowledge"
echo "  • Say 'what did we learn?' for natural language activation"
echo ""
echo "For monorepo support, see: README.md#monorepo-setup"
echo ""
