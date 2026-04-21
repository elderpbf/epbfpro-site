#!/usr/bin/env bash
# TypeDrill task 1M -- minimal progress view.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1M progress view check =="

# File exists
if [ -f js/progress-view.js ]; then pass "progress-view.js exists"; else die "progress-view.js missing"; fi

# Syntax
for f in js/progress-view.js js/app.js css/typedrill.css; do
  if [ "${f##*.}" = "js" ]; then
    if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
  fi
done

# Exports
for fn in init open close render; do
  if grep -q "export function $fn" js/progress-view.js; then pass "progress-view exports $fn"; else die "progress-view missing $fn"; fi
done

# Uses shared skill.resetProgress
if grep -q 'skill.resetProgress' js/progress-view.js; then pass "progress-view calls skill.resetProgress"; else die "progress-view missing resetProgress call"; fi

# Wired in app.js
if grep -q "import \* as progressView" js/app.js; then pass "app.js imports progressView"; else die "app.js missing progressView import"; fi
if grep -q "progressView.init" js/app.js; then pass "app.js calls progressView.init"; else die "app.js missing progressView.init"; fi

# Cache-bust
if grep -q "css/typedrill.css?v=1.5" index.html; then pass "typedrill.css bumped to v=1.5"; else die "typedrill.css not v=1.5"; fi
if grep -q "js/app.js?v=1.7" index.html; then pass "app.js bumped to v=1.7"; else die "app.js not v=1.7"; fi

# No em dash / no !important
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found"; fi

# Regression: prior harnesses still pass
for f in _task1c_functional.mjs _task1d_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f FAILED"; fi
done

# 1M functional
if node _task1m_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
