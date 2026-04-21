#!/usr/bin/env bash
# TypeDrill task 1T -- settings drawer shrink.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1T settings drawer shrink check =="

# Removed fields
if grep -q 'id="td-words-per-lesson"' js/app.js; then die "td-words-per-lesson still in drawer"; else pass "td-words-per-lesson removed from drawer"; fi
if grep -q 'id="td-repeat-word"' js/app.js; then die "td-repeat-word still in drawer"; else pass "td-repeat-word removed from drawer"; fi

# Kept fields
if grep -q 'id="td-target-wpm"' js/app.js; then pass "td-target-wpm still present"; else die "td-target-wpm missing"; fi
if grep -q 'id="td-reset-progress"' js/app.js; then pass "td-reset-progress still present"; else die "td-reset-progress missing"; fi

# resetProgress call kept
if grep -q 'skill.resetProgress' js/app.js; then pass "skill.resetProgress kept"; else die "skill.resetProgress missing"; fi

# Cache-bust
if grep -q 'js/app.js?v=2.1' index.html; then pass "app.js bumped to v=2.1"; else die "app.js not v=2.1"; fi

# Syntax
if node --check js/app.js 2>/dev/null; then pass "syntax: js/app.js"; else die "syntax: js/app.js"; fi

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# Regression
for f in _task1c_functional.mjs _task1d_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs _task1p_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
