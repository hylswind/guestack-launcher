#!/usr/bin/env bash
# Lint gates for product code.
# Product directories ship with zero runtime dependencies and run on Web-standard APIs only.
set -euo pipefail
cd "$(dirname "$0")/.."

PRODUCT_DIRS=(functions-project page-project)
LOG_EXCEPTION="functions-project/lib/log.js"   # fixed-enum logger, the only console.* allowed
status=0
fail() { printf 'lint: %s\n' "$*" >&2; status=1; }

mapfile -t files < <(find "${PRODUCT_DIRS[@]}" -type f -name '*.js' | sort)

for f in "${files[@]}"; do
  # 1. console.* is forbidden everywhere except the fixed-enum logger.
  if [[ "$f" != "$LOG_EXCEPTION" ]] && grep -nE 'console\.' "$f" >&2; then
    fail "$f: console.* is forbidden"
  fi

  # 2. CommonJS and Node-only APIs are forbidden; base64 must be hand-written over Uint8Array.
  if grep -nE '\brequire[[:space:]]*\(' "$f" >&2; then
    fail "$f: require() is forbidden"
  fi
  if grep -nE '\b(atob|btoa)[[:space:]]*\(|\bBuffer\b|\bprocess\.|["'"'"']node:' "$f" >&2; then
    fail "$f: atob/btoa/Buffer/process/node: are forbidden"
  fi

  # 3. Every import/export specifier must be relative and end in .js (no bare specifiers, ever).
  while IFS= read -r spec; do
    [[ -z "$spec" ]] && continue
    case "$spec" in
      ./*.js|../*.js) ;;
      ./*|../*) fail "$f: relative specifier '$spec' must end in .js" ;;
      *) fail "$f: non-relative specifier '$spec' is forbidden" ;;
    esac
  done < <(grep -oE "(\bfrom|\bimport)[[:space:]]*\(?[[:space:]]*['\"][^'\"]+['\"]" "$f" \
           | sed -E "s/.*['\"]([^'\"]+)['\"]$/\1/" || true)
done

# 4. Shared files are byte-identical copies of their canonical source (the page has no build step).
while IFS= read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  src="functions-project/lib/$name"; dst="page-project/$name"
  if [[ ! -f "$src" ]]; then fail "$src is listed in scripts/shared-files.txt but missing"; continue; fi
  if [[ ! -f "$dst" ]]; then fail "$dst is missing (run: npm run sync)"; continue; fi
  cmp -s "$src" "$dst" || fail "$dst differs from $src (run: npm run sync)"
done < scripts/shared-files.txt

# 5. Generated files are never committed; their .example templates always exist.
for c in functions-project/_generated/config.js page-project/config.js page-project/_headers; do
  [[ -f "$c.example" ]] || fail "$c.example is missing"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
     && git ls-files --error-unmatch "$c" >/dev/null 2>&1; then
    fail "$c is tracked by git; it must be generated, never committed"
  fi
done

[[ $status -eq 0 ]] || exit 1
echo "lint: ok (${#files[@]} product files)"
