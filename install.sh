#!/bin/bash

# Memory Forge Installer
# Installs the continuous learning system (CLI-agnostic)
# Supports: Claude Code, OpenCode, Codex, Cursor, GitHub Copilot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Memory Forge Installer (CLI-Agnostic)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Error: Target directory '$TARGET_DIR' does not exist"
    exit 1
fi

# Detect primary tool based on existing config
detect_primary_tool() {
    if [ -d "$TARGET_DIR/.claude" ]; then
        echo "claude"
    elif [ -d "$TARGET_DIR/.opencode" ]; then
        echo "opencode"
    elif [ -d "$TARGET_DIR/.codex" ]; then
        echo "codex"
    elif [ -f "$TARGET_DIR/AGENTS.md" ]; then
        echo "agents"
    elif [ -f "$TARGET_DIR/CLAUDE.md" ]; then
        echo "claude"
    else
        echo "unknown"
    fi
}

PRIMARY_TOOL=$(detect_primary_tool)
echo "🔍 Detected primary tool: $PRIMARY_TOOL"
echo ""

# Create directories for Claude Code
echo "📁 Creating Claude Code directories..."
mkdir -p "$TARGET_DIR/.claude/skills"
mkdir -p "$TARGET_DIR/.claude/hooks"

# Copy skill files to Claude Code location
echo "📋 Installing memory-forge skill (Claude Code)..."
cp -r "$SCRIPT_DIR/.claude/skills/memory-forge" "$TARGET_DIR/.claude/skills/"

# Copy hook for Claude Code
echo "🔗 Installing activation hook (Claude Code)..."
cp "$SCRIPT_DIR/.claude/hooks/memory-forge-activator.sh" "$TARGET_DIR/.claude/hooks/"
chmod +x "$TARGET_DIR/.claude/hooks/memory-forge-activator.sh"

# Also install for OpenCode (it reads both locations)
echo "📁 Creating OpenCode directories..."
mkdir -p "$TARGET_DIR/.opencode/skill"
cp -r "$SCRIPT_DIR/.claude/skills/memory-forge" "$TARGET_DIR/.opencode/skill/"

# Copy sync script
echo "🔄 Installing sync script..."
mkdir -p "$TARGET_DIR/scripts"
cp "$SCRIPT_DIR/scripts/sync-context-files.sh" "$TARGET_DIR/scripts/"
chmod +x "$TARGET_DIR/scripts/sync-context-files.sh"

# Configure hooks
SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"

configure_hooks() {
    if [ -f "$SETTINGS_FILE" ]; then
        # Check if hook already exists
        if grep -q "memory-forge-activator" "$SETTINGS_FILE" 2>/dev/null; then
            echo "✅ Hook already configured in settings.json"
            return
        fi

        # Check if file has hooks section
        if grep -q '"hooks"' "$SETTINGS_FILE" 2>/dev/null; then
            echo ""
            echo "⚠️  Found existing .claude/settings.json with hooks"
            echo "   Add this to your UserPromptSubmit hooks array:"
            echo ""
            echo '   {'
            echo '     "type": "command",'
            echo '     "command": ".claude/hooks/memory-forge-activator.sh"'
            echo '   }'
            echo ""
        else
            # File exists but no hooks - try to add hooks section
            echo "📝 Adding hooks to existing settings.json..."
            # Create backup
            cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup"
            # Use node/python if available, otherwise manual
            if command -v node &> /dev/null; then
                node -e "
                const fs = require('fs');
                const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
                settings.hooks = settings.hooks || {};
                settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
                settings.hooks.UserPromptSubmit.push({
                    hooks: [{
                        type: 'command',
                        command: '.claude/hooks/memory-forge-activator.sh'
                    }]
                });
                fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
                " && echo "✅ Hook added to settings.json" || echo "⚠️  Could not auto-add hook. Please add manually."
            else
                echo "⚠️  Please add the hook configuration manually to settings.json"
                echo "   (Install Node.js for automatic configuration)"
            fi
        fi
    else
        echo "📝 Creating settings.json with hook configuration..."
        cat > "$SETTINGS_FILE" << 'SETTINGS_EOF'
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
SETTINGS_EOF
        echo "✅ Created settings.json"
    fi
}

configure_hooks

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
