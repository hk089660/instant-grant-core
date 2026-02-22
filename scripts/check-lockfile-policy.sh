#!/usr/bin/env bash
# Enforce deterministic Node dependency policy:
# - npm only
# - canonical lockfile name must be package-lock.json
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git is required for lockfile policy check."
  exit 1
fi

forbidden_files=()

while IFS= read -r path; do
  [[ -e "$path" ]] || continue
  case "$path" in
    */yarn.lock|yarn.lock)
      forbidden_files+=("$path")
      ;;
    */pnpm-lock.yaml|pnpm-lock.yaml)
      forbidden_files+=("$path")
      ;;
    */package-lock*.json|package-lock*.json)
      base="$(basename "$path")"
      if [[ "$base" != "package-lock.json" ]]; then
        forbidden_files+=("$path")
      fi
      ;;
  esac
done < <(git ls-files)

if [[ ${#forbidden_files[@]} -gt 0 ]]; then
  echo "Forbidden lockfiles detected:"
  for f in "${forbidden_files[@]}"; do
    echo "  - $f"
  done
  echo "Use npm with canonical package-lock.json files only."
  exit 1
fi

echo "Lockfile policy check passed (npm + package-lock.json only)."
