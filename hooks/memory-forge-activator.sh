#!/bin/bash

# Memory Forge Auto-Activation Hook
# Reminds Claude to evaluate every interaction for extractable knowledge.
#
# Installation:
#   1. Copy to ~/.claude/hooks/memory-forge-activator.sh
#   2. chmod +x ~/.claude/hooks/memory-forge-activator.sh
#   3. Add hook config to ~/.claude/settings.json (see README)

cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMORY FORGE: Post-task evaluation required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After completing this request, evaluate:

1. Did this require non-trivial investigation?
2. Did I discover something not obvious from docs?
3. Would this help in similar future situations?

YES to any → Run /memory-forge to extract knowledge
NO to all  → Skip

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
