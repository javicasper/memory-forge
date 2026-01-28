#!/bin/bash

# Memory Forge Remote Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/main/install-remote.sh | bash

set -e

REPO_URL="https://github.com/javicasper/memory-forge"
BRANCH="main"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Memory Forge Remote Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "📥 Downloading Memory Forge..."

# Download required files
mkdir -p "$TEMP_DIR/.claude/skills/memory-forge/resources"
mkdir -p "$TEMP_DIR/.claude/hooks"
mkdir -p "$TEMP_DIR/scripts"

BASE_RAW="https://raw.githubusercontent.com/javicasper/memory-forge/$BRANCH"

curl -fsSL "$BASE_RAW/.claude/skills/memory-forge/SKILL.md" -o "$TEMP_DIR/.claude/skills/memory-forge/SKILL.md"
curl -fsSL "$BASE_RAW/.claude/skills/memory-forge/resources/skill-template.md" -o "$TEMP_DIR/.claude/skills/memory-forge/resources/skill-template.md"
curl -fsSL "$BASE_RAW/.claude/hooks/memory-forge-activator.sh" -o "$TEMP_DIR/.claude/hooks/memory-forge-activator.sh"
curl -fsSL "$BASE_RAW/scripts/sync-context-files.sh" -o "$TEMP_DIR/scripts/sync-context-files.sh"

echo "📁 Installing to current directory..."

# Create directories
mkdir -p .claude/skills
mkdir -p .claude/hooks
mkdir -p scripts

# Copy files
cp -r "$TEMP_DIR/.claude/skills/memory-forge" .claude/skills/
cp "$TEMP_DIR/.claude/hooks/memory-forge-activator.sh" .claude/hooks/
cp "$TEMP_DIR/scripts/sync-context-files.sh" scripts/

# Make executable
chmod +x .claude/hooks/memory-forge-activator.sh
chmod +x scripts/sync-context-files.sh

# Configure settings.json
SETTINGS_FILE=".claude/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    if grep -q "memory-forge-activator" "$SETTINGS_FILE" 2>/dev/null; then
        echo "✅ Hook already configured"
    elif grep -q '"hooks"' "$SETTINGS_FILE" 2>/dev/null; then
        echo ""
        echo "⚠️  Found existing hooks in settings.json"
        echo "   Add this to your UserPromptSubmit hooks:"
        echo ""
        echo '   { "type": "command", "command": ".claude/hooks/memory-forge-activator.sh" }'
        echo ""
    else
        echo "📝 Adding hooks to settings.json..."
        if command -v node &> /dev/null; then
            node -e "
            const fs = require('fs');
            const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
            settings.hooks = settings.hooks || {};
            settings.hooks.UserPromptSubmit = [{
                hooks: [{ type: 'command', command: '.claude/hooks/memory-forge-activator.sh' }]
            }];
            fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
            " && echo "✅ Hook added"
        else
            echo "⚠️  Add hook manually (Node.js not available for auto-config)"
        fi
    fi
else
    echo "📝 Creating settings.json..."
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
    echo "✅ Created settings.json"
fi

# Also create for OpenCode
mkdir -p .opencode/skill
cp -r .claude/skills/memory-forge .opencode/skill/

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Memory Forge installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Usage:"
echo "  • The hook will remind you to evaluate learning after each task"
echo "  • Use /memory-forge to extract knowledge"
echo "  • Say 'what did we learn?' for natural language activation"
echo ""
echo "Docs: $REPO_URL#readme"
echo ""
