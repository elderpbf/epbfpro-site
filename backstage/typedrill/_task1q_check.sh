#!/usr/bin/env bash
# TypeDrill task 1Q -- realistic typing mode.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1Q realistic typing mode check =="

# Engine no longer truncates on wrong char
if grep -q 'input.value = value.slice(0, cursor - 1)' js/engine.js; then die "engine still truncates wrong chars"; else pass "engine does NOT truncate wrong chars"; fi

# Realistic-mode comment marker
if grep -q 'Realistic mode' js/engine.js; then pass "engine has realistic-mode comment"; else die "engine missing realistic-mode comment"; fi

# Syntax
if node --check js/engine.js 2>/dev/null; then pass "syntax: js/engine.js"; else die "syntax: js/engine.js"; fi

# Cache-bust
if grep -q 'js/app.js?v=1.9' index.html; then pass "app.js bumped to v=1.9"; else die "app.js not v=1.9"; fi

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# Updated 1C functional (covers realistic semantics + regression)
if node _task1c_functional.mjs; then pass "1C functional passes (realistic mode)"; else die "1C functional failed"; fi

# Regression: other functional tests still pass
for f in _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs _task1p_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
