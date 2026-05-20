#!/bin/sh
# Claude Code status line: folder, git branch, model, context % with progress bar

input=$(cat)

# Current folder (basename of cwd)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
folder=$(basename "$cwd")

# Git branch (skip optional locks)
branch=$(git -C "$cwd" --no-optional-locks branch --show-current 2>/dev/null)

# Model display name
model=$(echo "$input" | jq -r '.model.display_name // ""')

# Context used percentage
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Build progress bar (10 chars wide)
build_bar() {
  pct="$1"
  filled=$(awk "BEGIN { printf \"%d\", $pct / 10 }")
  empty=$((10 - filled))
  bar=""
  i=0
  while [ $i -lt $filled ]; do
    bar="${bar}█"
    i=$((i + 1))
  done
  i=0
  while [ $i -lt $empty ]; do
    bar="${bar}░"
    i=$((i + 1))
  done
  echo "$bar"
}

# Assemble output
parts=""

# Folder
if [ -n "$folder" ]; then
  parts="${parts}${folder}"
fi

# Git branch
if [ -n "$branch" ]; then
  parts="${parts} \033[36m(${branch})\033[0m"
fi

# Model
if [ -n "$model" ]; then
  parts="${parts} \033[35m${model}\033[0m"
fi

# Context % with progress bar
if [ -n "$used" ]; then
  bar=$(build_bar "$used")
  used_int=$(awk "BEGIN { printf \"%d\", $used + 0.5 }")
  parts="${parts} \033[33m[${bar} ${used_int}%]\033[0m"
fi

printf "%b\n" "$parts"
