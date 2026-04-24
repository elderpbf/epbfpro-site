#!/usr/bin/env bash
# TypeDrill task 1V -- textarea styling.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1V textarea styling check =="

# CSS rule for .td-custom-text
if grep -q '\.td-custom-text {' css/typedrill.css; then pass ".td-custom-text CSS rule present"; else die ".td-custom-text CSS rule missing"; fi

# rows=6 in custom.js
if grep -qE 'textarea\.rows\s*=\s*6' js/sources/custom.js; then pass "textarea.rows = 6"; else die "textarea.rows not 6"; fi

# Focus state rule present
if grep -q '\.td-custom-text:focus' css/typedrill.css; then pass "focus ring rule present"; else die "focus ring missing"; fi

# Cache-bust
if grep -q 'css/typedrill.css?v=1.8' index.html; then pass "typedrill.css bumped to v=1.8"; else die "typedrill.css not v=1.8"; fi

# No em dash / !important
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found"; fi

# Regression: full suite
for f in _task1c_functional.mjs _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs _task1p_functional.mjs _task1u_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
