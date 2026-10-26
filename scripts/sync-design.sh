#!/usr/bin/env bash
# Copies the parts of the builtbyjosef design system this app uses into src/design/, unchanged.
# Run from the repo root in the VS Code terminal (Git Bash or WSL): bash scripts/sync-design.sh
# Never edit the files in src/design/ by hand; change the design system repo and re-run this.
set -euo pipefail
REPO="${JY_REPO:-https://github.com/16JoeTheCoder/builtbyjosef-designsystem.git}"
REF="${JY_REF:-v1}"
DEST="src/design"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [ -n "${JY_LOCAL:-}" ]; then src="$JY_LOCAL"; else
  echo "-> fetching $REPO@$REF"
  git clone --quiet --depth 1 --branch "$REF" "$REPO" "$tmp/src"; src="$tmp/src"
fi
rm -rf "$DEST"; mkdir -p "$DEST/fonts" "$DEST/logos"
cp "$src/tokens.css" "$src/bundle.css" "$src/LICENSE.md" "$DEST/"
cp "$src"/fonts/*.woff2 "$src"/fonts/OFL-*.txt "$DEST/fonts/"
# Only the two logo files the Settings credit uses.
cp "$src/logos/tab-primary-light.svg" "$src/logos/tab-primary-dark.svg" "$DEST/logos/"
(cd "$src" && git rev-parse HEAD 2>/dev/null || echo unknown) > "$DEST/VERSION"
echo "ok design system copied into $DEST"
