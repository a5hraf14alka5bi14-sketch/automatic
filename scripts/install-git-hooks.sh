#!/usr/bin/env bash
# Installs the repo's git hooks (currently: pre-commit secret scan).
# Idempotent — safe to run repeatedly. Run once per clone: bash scripts/install-git-hooks.sh
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hooks_src="$repo_root/scripts/git-hooks"
hooks_dst="$(git rev-parse --git-path hooks)"

mkdir -p "$hooks_dst"
for hook in "$hooks_src"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$hooks_dst/$name"
  chmod +x "$hooks_dst/$name"
  echo "installed hook: $name"
done
echo "git hooks installed into $hooks_dst"
