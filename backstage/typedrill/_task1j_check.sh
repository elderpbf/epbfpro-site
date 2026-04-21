#!/usr/bin/env bash
# TypeDrill task 1J -- Palavras comuns pt-BR source.
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1J common-words check =="

# 1. Data file populated
if grep -q "'o'\|\"o\"" js/data/pt-br-1000.js; then pass "WORDS array has entries"; else die "WORDS array empty or malformed"; fi
word_count=$(grep -cE '^[[:space:]]*"[^"]+",' js/data/pt-br-1000.js)
if [ "$word_count" -ge 500 ]; then pass "WORDS has $word_count entries (>= 500)"; else die "WORDS has only $word_count entries"; fi

# 2. common.js imports WORDS
if grep -q "from '../data/pt-br-1000.js'" js/sources/common.js; then pass "common.js imports WORDS"; else die "common.js missing WORDS import"; fi

# 3. Exports generate
if grep -q 'export function generate' js/sources/common.js; then pass "common.js exports generate"; else die "common.js missing generate export"; fi

# 4. Syntax
for f in js/data/pt-br-1000.js js/sources/common.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# 5. No em dash, no !important, no leftover stubs
emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi
imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi
stubs=$(grep -c "console.debug('stub:" js/sources/common.js js/data/pt-br-1000.js 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$stubs" = "0" ]; then pass "no leftover stubs"; else die "leftover stubs: $stubs"; fi

# 6. Functional harness
if node _task1j_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
