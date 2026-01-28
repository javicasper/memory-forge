#!/bin/bash

# Memory Forge Remote Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/javicasper/memory-forge/main/install-remote.sh | bash

set -e

REPO_URL="https://github.com/javicasper/memory-forge"
BRANCH="main"
HOOK_CMD=".claude/hooks/memory-forge-activator.sh"

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

# Also create for OpenCode
mkdir -p .opencode/skill
cp -r .claude/skills/memory-forge .opencode/skill/

echo "✅ Files installed"

# ============================================================
# AUTO-CONFIGURE HOOKS (the smart part)
# ============================================================

SETTINGS_FILE=".claude/settings.json"
HOOK_ENTRY='{"type":"command","command":"'"$HOOK_CMD"'"}'

configure_hook_jq() {
    # Using jq for JSON manipulation
    local temp_file=$(mktemp)

    if [ ! -f "$SETTINGS_FILE" ]; then
        # No settings.json - create from scratch
        echo '{"hooks":{"UserPromptSubmit":[{"hooks":['"$HOOK_ENTRY"']}]}}' | jq '.' > "$SETTINGS_FILE"
        return 0
    fi

    # Check if hook already exists
    if jq -e '.hooks.UserPromptSubmit[]?.hooks[]? | select(.command == "'"$HOOK_CMD"'")' "$SETTINGS_FILE" > /dev/null 2>&1; then
        echo "✅ Hook already configured"
        return 0
    fi

    # Add hook to existing settings
    jq '
      .hooks //= {} |
      .hooks.UserPromptSubmit //= [] |
      .hooks.UserPromptSubmit += [{"hooks": ['"$HOOK_ENTRY"']}]
    ' "$SETTINGS_FILE" > "$temp_file" && mv "$temp_file" "$SETTINGS_FILE"

    return 0
}

configure_hook_node() {
    # Using Node.js for JSON manipulation
    node << 'NODEJS_SCRIPT'
const fs = require('fs');
const settingsFile = '.claude/settings.json';
const hookCmd = '.claude/hooks/memory-forge-activator.sh';

let settings = {};
if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
}

// Initialize hooks structure
settings.hooks = settings.hooks || {};
settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];

// Check if hook already exists
const hookExists = settings.hooks.UserPromptSubmit.some(entry =>
    entry.hooks?.some(h => h.command === hookCmd)
);

if (!hookExists) {
    settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: 'command', command: hookCmd }]
    });
}

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
NODEJS_SCRIPT
}

configure_hook_python() {
    # Using Python for JSON manipulation
    python3 << 'PYTHON_SCRIPT'
import json
import os

settings_file = '.claude/settings.json'
hook_cmd = '.claude/hooks/memory-forge-activator.sh'

settings = {}
if os.path.exists(settings_file):
    with open(settings_file, 'r') as f:
        settings = json.load(f)

# Initialize hooks structure
settings.setdefault('hooks', {})
settings['hooks'].setdefault('UserPromptSubmit', [])

# Check if hook already exists
hook_exists = any(
    h.get('command') == hook_cmd
    for entry in settings['hooks']['UserPromptSubmit']
    for h in entry.get('hooks', [])
)

if not hook_exists:
    settings['hooks']['UserPromptSubmit'].append({
        'hooks': [{'type': 'command', 'command': hook_cmd}]
    })

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=2)
PYTHON_SCRIPT
}

echo "🔧 Configuring hook..."

# Try jq first (most reliable for JSON), then node, then python
if command -v jq &> /dev/null; then
    configure_hook_jq && echo "✅ Hook configured (via jq)"
elif command -v node &> /dev/null; then
    configure_hook_node && echo "✅ Hook configured (via node)"
elif command -v python3 &> /dev/null; then
    configure_hook_python && echo "✅ Hook configured (via python)"
else
    echo "⚠️  No JSON tool available (jq, node, or python3)"
    echo "   Install one of them or add hook manually to .claude/settings.json:"
    echo ""
    echo '   "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": ".claude/hooks/memory-forge-activator.sh" }] }] }'
    echo ""
fi

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
