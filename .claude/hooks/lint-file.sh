#!/bin/sh
# PostToolUse hook: lint the file Claude just edited. Exit 2 sends errors back to Claude.
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')

case "$file" in
  *.ts|*.tsx|*.js|*.mjs)
    cd "$CLAUDE_PROJECT_DIR" || exit 0
    npx eslint --fix "$file" >&2 || exit 2
    ;;
esac
exit 0
