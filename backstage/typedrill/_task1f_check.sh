#!/usr/bin/env bash
# TypeDrill task 1F renderer verification.
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1F renderer check =="

# 1. exports paint
if grep -q 'export function paint' js/renderer.js; then pass "renderer exports paint"; else die "renderer missing paint export"; fi

# 2. uses all four class names
for cls in ok-char bad-char cur-char pending; do
  if grep -q "$cls" js/renderer.js; then pass "renderer uses $cls"; else die "renderer missing $cls"; fi
done

# 3. handles whitespace display setting
if grep -q 'whitespaceDisplay' js/renderer.js; then pass "renderer reads whitespaceDisplay"; else die "renderer ignores whitespaceDisplay"; fi

# 4. escapes HTML
if grep -q 'escapeHtml' js/renderer.js; then pass "renderer has escapeHtml"; else die "renderer not escaping HTML"; fi

# 5. syntax
if node --check js/renderer.js 2>/dev/null; then pass "syntax: js/renderer.js"; else die "syntax: js/renderer.js"; fi

# 6. no em dash, no !important, no stub
emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi
imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi
stubs=$(grep -c "console.debug('stub:" js/renderer.js 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$stubs" = "0" ]; then pass "no leftover stubs"; else die "leftover stubs: $stubs"; fi

# 7. functional harness
if node _task1f_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
