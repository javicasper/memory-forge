#!/bin/bash

# Memory Forge Auto-Activation Hook
# Reminds developers to evaluate learning opportunities after each task.

cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 MEMORY FORGE - Learning Evaluation Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After completing this task, evaluate if it produced extractable knowledge.

EVALUATION CHECKLIST:
┌─────────────────────────────────────────────────────────┐
│ □ Required non-trivial investigation or debugging?      │
│ □ Discovered something not obvious from documentation?  │
│ □ Found a workaround that would help others?            │
└─────────────────────────────────────────────────────────┘

IF YES to any → Invoke: /memory-forge
   • Pattern/Convention? → Updates CLAUDE.md (root or module)
   • Error/Workaround? → Creates new skill
   • Module-specific? → Updates module's CLAUDE.md or creates module skill

IF NO to all → Skip extraction

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
