#!/usr/bin/env bash
# TypeDrill task 1L -- settings drawer (core).

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1L settings drawer check =="

# Syntax
for f in js/app.js js/skill.js js/session.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# resetProgress export
if grep -q 'export function resetProgress' js/skill.js; then pass "skill.js exports resetProgress"; else die "skill.js missing resetProgress"; fi

# Topbar.init receives sections
if grep -qE 'sections:[[:space:]]*\[' js/app.js; then pass "app.js passes sections to Topbar.init"; else die "app.js missing sections array"; fi

# Section id
if grep -q "id: 'typedrill'" js/app.js; then pass "app.js defines typedrill section"; else die "app.js missing typedrill section id"; fi

# Four form ids
for needle in 'id="td-target-wpm"' 'id="td-words-per-lesson"' 'id="td-repeat-word"' 'id="td-reset-progress"'; do
  if grep -qF "$needle" js/app.js; then pass "app.js has $needle"; else die "app.js missing $needle"; fi
done

# skill.resetProgress referenced in app.js
if grep -q 'skill.resetProgress' js/app.js; then pass "app.js calls skill.resetProgress"; else die "app.js does not call skill.resetProgress"; fi

# Cache-bust
if grep -q "js/app.js?v=1.6" index.html; then pass "app.js bumped to v=1.6"; else die "app.js not v=1.6"; fi

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# All prior functional harnesses still pass (regression)
for f in _task1c_functional.mjs _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f still passes"; else die "regression: $f FAILED"; fi
done

# 1L functional
if node _task1l_functional.mjs; then pass "1L functional harness passed"; else die "1L functional failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
