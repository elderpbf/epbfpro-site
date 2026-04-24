#!/usr/bin/env bash
# TypeDrill task 1E stats verification.
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1E stats check =="

for fn in startSession startLine recordChar tick; do
  if grep -q "export function $fn" js/stats.js; then pass "stats exports $fn"; else die "stats missing export $fn"; fi
done

if grep -q 'Date.now()' js/stats.js; then pass "stats uses Date.now()"; else die "stats missing Date.now()"; fi
if grep -q '60000' js/stats.js; then pass "stats converts ms to minutes"; else die "stats missing ms->min conversion"; fi

if node --check js/stats.js 2>/dev/null; then pass "syntax: js/stats.js"; else die "syntax: js/stats.js"; fi

emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi
imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi
stubs=$(grep -c "console.debug('stub:" js/stats.js 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$stubs" = "0" ]; then pass "no leftover stubs"; else die "leftover stubs: $stubs"; fi

if node _task1e_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
