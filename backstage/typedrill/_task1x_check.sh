#!/usr/bin/env bash
# TypeDrill task 1X -- remove wpl input from Texto source.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1X Texto wpl input removal check =="

# wpl UI gone from custom.js
if ! grep -q 'wplInput\|wplLabel' js/sources/custom.js; then pass "no wplInput/wplLabel refs"; else die "wplInput/wplLabel still present"; fi
if ! grep -q 'palavras por lição' js/sources/custom.js; then pass "no 'palavras por lição' label"; else die "'palavras por lição' still present"; fi
if ! grep -q 'td-opt-field\|td-opt-input' js/sources/custom.js; then pass "no td-opt-field/td-opt-input classes"; else die "td-opt-* still present"; fi

# Other Texto options still there (textarea + three toggles)
if grep -q 'td-custom-text' js/sources/custom.js; then pass "textarea class preserved"; else die "textarea class missing"; fi
if grep -q 'stripPunct' js/sources/custom.js; then pass "stripPunct toggle preserved"; else die "stripPunct missing"; fi
if grep -q 'lowercase' js/sources/custom.js; then pass "lowercase toggle preserved"; else die "lowercase missing"; fi
if grep -q 'shuffleWords' js/sources/custom.js; then pass "shuffleWords toggle preserved"; else die "shuffleWords missing"; fi

# generate() hardcodes wordsPerLesson to 30 (ignores stale per-source overrides)
if grep -qE '^\s*const wordsPerLesson = 30;' js/sources/custom.js; then pass "generate() wordsPerLesson hardcoded to 30"; else die "generate() wordsPerLesson not hardcoded"; fi
if ! grep -qF 'o.wordsPerLesson' js/sources/custom.js; then pass "generate() ignores o.wordsPerLesson"; else die "generate() still reads o.wordsPerLesson"; fi

# Palavras (common.js) still has its wpl input -- unchanged
if grep -q 'wplInput' js/sources/common.js; then pass "common.js still has wplInput"; else die "common.js wplInput unexpectedly removed"; fi

# Cache-bust
if grep -q 'js/app.js?v=2.7' index.html; then pass "app.js bumped to v=2.7"; else die "app.js not v=2.7"; fi
# Backspace repaint signal wired
if grep -qF "emit('onKeystroke', { isDelete: true })" js/engine.js; then pass "engine emits isDelete on backspace"; else die "engine missing isDelete emit"; fi
if grep -qF '!ev.isDelete' js/app.js; then pass "app.js skips stats on isDelete"; else die "app.js stats not gated by isDelete"; fi
if grep -q 'css/typedrill.css?v=1.9' index.html; then pass "typedrill.css bumped to v=1.9"; else die "typedrill.css not v=1.9"; fi

# Syntax
for f in js/sources/custom.js js/sources/common.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# Regression: prior functional tests still pass
for f in _task1c_functional.mjs _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs _task1p_functional.mjs _task1u_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

# 1X functional
if node _task1x_functional.mjs; then pass "1X functional passed"; else die "1X functional failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
