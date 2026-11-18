#!/bin/sh
# Stop hook: Claude cannot finish while types or unit tests are red.
# Exit 2 blocks the stop and feeds the failure back to Claude.
input=$(cat)

# Already blocked once in this stop cycle: let it stop to avoid an endless loop.
case "$input" in *'"stop_hook_active":true'*) exit 0 ;; esac

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Nothing changed in code: skip.
if git diff --quiet HEAD -- src supabase 2>/dev/null \
  && [ -z "$(git ls-files --others --exclude-standard -- src supabase)" ]; then
  exit 0
fi

if ! npm run -s typecheck >&2; then
  echo "Typecheck failed. Fix the errors above before finishing." >&2
  exit 2
fi
if ! npm test --silent >&2; then
  echo "Unit tests failed. Fix them before finishing." >&2
  exit 2
fi
exit 0
