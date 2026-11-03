#!/usr/bin/env bash
# Copy the shared lib files from functions-project/lib/ into page-project/.
# The copies are committed; scripts/lint.sh fails if they drift from the source.
set -euo pipefail
cd "$(dirname "$0")/.."

while IFS= read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  cp "functions-project/lib/$name" "page-project/$name"
  echo "sync: page-project/$name"
done < scripts/shared-files.txt
