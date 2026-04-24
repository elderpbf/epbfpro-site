#!/usr/bin/env bash
# TypeDrill task 1P -- stats display loop + strip-not-drop filter.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1P bug fixes check =="

# paintStats wired in app.js
if grep -q 'function paintStats' js/app.js; then pass "paintStats function defined"; else die "paintStats missing"; fi
if grep -q 'setInterval(paintStats' js/app.js; then pass "setInterval(paintStats wired"; else die "setInterval wire missing"; fi

# strip-not-drop: both sources use .map
if grep -q '\.map(function (w)' js/sources/common.js; then pass "common.js strips via map"; else die "common.js missing map pattern"; fi
if grep -q '\.map(function (w)' js/sources/custom.js; then pass "custom.js strips via map"; else die "custom.js missing map pattern"; fi

# Cache-bust
if grep -q 'js/app.js?v=1.8' index.html; then pass "app.js bumped to v=1.8"; else die "app.js not v=1.8"; fi

# Syntax
for f in js/app.js js/sources/common.js js/sources/custom.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# Regression: prior functional tests still pass
for f in _task1c_functional.mjs _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

# 1P functional
if node _task1p_functional.mjs; then pass "1P functional passed"; else die "1P functional failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
