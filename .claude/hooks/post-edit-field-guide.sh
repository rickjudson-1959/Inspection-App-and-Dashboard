#!/bin/bash
# post-edit-field-guide.sh
# Claude Code PostToolUse hook — detects when the field guide is edited
# and triggers sync to Supabase so the AI agent gets the update.

INPUT=$(cat)

# Extract file_path from the tool input JSON
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# Only act if the edited file is the field guide
if [[ "$FILE_PATH" == *"pipe-up-field-guide-agent-kb.md"* ]]; then
  PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  echo "🔄 Field guide changed — syncing to AI agent..."
  # Run in background so Claude isn't blocked
  (cd "$PROJECT_ROOT" && node scripts/sync-field-guide.cjs >> /tmp/field-guide-sync.log 2>&1) &
fi

exit 0
