#!/usr/bin/env bash
# builtbyjosef design lint. Flags what the standard forbids. Run from a project root.
# Usage: bash scripts/jy-check.sh [path ...]   (default: current folder)
set -u
paths=("$@"); [ ${#paths[@]} -eq 0 ] && paths=(.)
excl=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=builtbyjosef --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude=tokens.css --exclude=*.min.*)
inc=(--include=*.css --include=*.scss --include=*.html --include=*.tsx --include=*.jsx --include=*.vue --include=*.svelte)
fail=0

check() { # $1 label, $2 regex
  local out
  out=$(grep -rnEI "${inc[@]}" "${excl[@]}" -e "$2" "${paths[@]}" 2>/dev/null | head -n 8)
  if [ -n "$out" ]; then echo "x $1"; echo "$out"; fail=1; fi
}

check "gradient (flat fills only)"                       'linear-gradient|radial-gradient|conic-gradient'
check "blur or glass (backdrop-filter, blur)"            'backdrop-filter|filter:[^;]*blur'
check "text-shadow or glow"                              'text-shadow'
check "font-weight outside 300 400 500 700"              'font-weight:[[:space:]]*(100|200|600|800|900)\b|font-(thin|extralight|semibold|extrabold|black)\b'
check "raw hex colour (use var(--token))"                '(color|background|border|fill|stroke|outline)[a-z-]*:[^;{]*#[0-9a-fA-F]{3,8}\b'
check "soft box-shadow (only the hard stamp is allowed)" 'box-shadow:[[:space:]]*-?[0-9]+(px)?[[:space:]]+-?[0-9]+(px)?[[:space:]]+[1-9]'
check "exclamation mark in UI text"                      '>[^<{]*[A-Za-z]!( |<|$)'

if [ "$fail" -eq 0 ]; then echo "ok builtbyjosef check clean"; else echo "! fix the lines above (or justify them in the PR)"; fi
exit "$fail"
