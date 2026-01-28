#!/bin/bash

# Memory Forge Installer
# Installs the continuous learning system (CLI-agnostic)
# Supports: Claude Code, OpenCode, Codex, Cursor, GitHub Copilot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"
HOOK_CMD=".claude/hooks/memory-forge-activator.sh"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 Memory Forge Installer (CLI-Agnostic)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Error: Target directory '$TARGET_DIR' does not exist"
    exit 1
fi

cd "$TARGET_DIR"

# Detect primary tool based on existing config
detect_primary_tool() {
    if [ -d ".claude" ]; then
        echo "claude"
    elif [ -d ".opencode" ]; then
        echo "opencode"
    elif [ -d ".codex" ]; then
        echo "codex"
    elif [ -f "AGENTS.md" ]; then
        echo "agents"
    elif [ -f "CLAUDE.md" ]; then
        echo "claude"
    else
        echo "unknown"
    fi
}

PRIMARY_TOOL=$(detect_primary_tool)
echo "🔍 Detected primary tool: $PRIMARY_TOOL"
echo ""

# Create directories for Claude Code
echo "📁 Creating directories..."
mkdir -p .claude/skills
mkdir -p .claude/hooks
mkdir -p .opencode/skill
mkdir -p scripts

# Copy skill files
echo "📋 Installing memory-forge skill..."
cp -r "$SCRIPT_DIR/.claude/skills/memory-forge" .claude/skills/
cp -r "$SCRIPT_DIR/.claude/skills/memory-forge" .opencode/skill/

# Copy hook
echo "🔗 Installing activation hook..."
cp "$SCRIPT_DIR/.claude/hooks/memory-forge-activator.sh" .claude/hooks/
chmod +x .claude/hooks/memory-forge-activator.sh

# Copy sync script
echo "🔄 Installing sync script..."
cp "$SCRIPT_DIR/scripts/sync-context-files.sh" scripts/
chmod +x scripts/sync-context-files.sh

echo "✅ Files installed"

# ============================================================
# AUTO-CONFIGURE HOOKS
# ============================================================

SETTINGS_FILE=".claude/settings.json"
HOOK_ENTRY='{"type":"command","command":"'"$HOOK_CMD"'"}'

configure_hook_jq() {
    local temp_file=$(mktemp)

    if [ ! -f "$SETTINGS_FILE" ]; then
        echo '{"hooks":{"UserPromptSubmit":[{"hooks":['"$HOOK_ENTRY"']}]}}' | jq '.' > "$SETTINGS_FILE"
        return 0
    fi

    if jq -e '.hooks.UserPromptSubmit[]?.hooks[]? | select(.command == "'"$HOOK_CMD"'")' "$SETTINGS_FILE" > /dev/null 2>&1; then
        echo "✅ Hook already configured"
        return 0
    fi

    jq '
      .hooks //= {} |
      .hooks.UserPromptSubmit //= [] |
      .hooks.UserPromptSubmit += [{"hooks": ['"$HOOK_ENTRY"']}]
    ' "$SETTINGS_FILE" > "$temp_file" && mv "$temp_file" "$SETTINGS_FILE"

    return 0
}

configure_hook_node() {
    node << 'NODEJS_SCRIPT'
const fs = require('fs');
const settingsFile = '.claude/settings.json';
const hookCmd = '.claude/hooks/memory-forge-activator.sh';

let settings = {};
if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
}

settings.hooks = settings.hooks || {};
settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];

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
    python3 << 'PYTHON_SCRIPT'
import json
import os

settings_file = '.claude/settings.json'
hook_cmd = '.claude/hooks/memory-forge-activator.sh'

settings = {}
if os.path.exists(settings_file):
    with open(settings_file, 'r') as f:
        settings = json.load(f)

settings.setdefault('hooks', {})
settings['hooks'].setdefault('UserPromptSubmit', [])

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

if command -v jq &> /dev/null; then
    configure_hook_jq && echo "✅ Hook configured (via jq)"
elif command -v node &> /dev/null; then
    configure_hook_node && echo "✅ Hook configured (via node)"
elif command -v python3 &> /dev/null; then
    configure_hook_python && echo "✅ Hook configured (via python)"
else
    echo "⚠️  No JSON tool available (jq, node, or python3)"
    echo "   Please add hook manually to .claude/settings.json"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Memory Forge installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Installed to: $(pwd)/.claude/"
echo ""
echo "Usage:"
echo "  • The activation hook will remind you to evaluate learning"
echo "  • Use /memory-forge to extract knowledge"
echo "  • Say 'what did we learn?' for natural language activation"
echo ""
echo "For monorepo support, see: README.md#monorepo-setup"
echo ""
