#!/usr/bin/env bash
# TypeDrill task 1U -- Símbolos "Todos" mode.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1U Símbolos Todos mode check =="

# Sentinel string present
if grep -q "'\*all\*'" js/sources/symbols.js; then pass "*all* sentinel present in symbols.js"; else die "*all* sentinel missing"; fi

# Todos option in dropdown
if grep -q "textContent = 'Todos'" js/sources/symbols.js; then pass "Todos option in dropdown"; else die "Todos option missing"; fi

# Cache-bust
if grep -q 'js/app.js?v=2.2' index.html; then pass "app.js bumped to v=2.2"; else die "app.js not v=2.2"; fi

# Syntax
if node --check js/sources/symbols.js 2>/dev/null; then pass "syntax: js/sources/symbols.js"; else die "syntax"; fi

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# Functional
if node _task1u_functional.mjs; then pass "1U functional passed"; else die "1U functional failed"; fi

# Regression
for f in _task1c_functional.mjs _task1i_functional.mjs _task1p_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
