#!/usr/bin/env bash
# TypeDrill task 1B shell-layout verification -- runs all [AUTO] assertions.
# All must pass before requesting staging. Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1B shell-layout check =="

# 1. #mobile-gate line does NOT contain the `hidden` attribute
if grep -q '<div id="mobile-gate"[^>]*\bhidden\b' index.html; then
  die "#mobile-gate still has hidden attribute"
else
  pass "#mobile-gate no longer has hidden attribute"
fi

# 2. typedrill.css cache-bust bumped to v=1.2
if grep -q 'css/typedrill.css?v=1.2' index.html; then pass "typedrill.css?v=1.2 in index.html"; else die "typedrill.css cache-bust not ?v=1.2"; fi

# 3. app.js cache-bust bumped to v=1.1
if grep -q 'js/app.js?v=1.1' index.html; then pass "app.js?v=1.1 in index.html"; else die "app.js cache-bust not ?v=1.1"; fi

# 4. .td-mobile-gate has default display:none BEFORE the @media block
head_portion=$(awk '/@media/{exit} {print}' css/typedrill.css)
if echo "$head_portion" | awk '/\.td-mobile-gate[[:space:]]*\{/,/\}/' | grep -q 'display: none'; then
  pass ".td-mobile-gate has default display: none before @media"
else
  die ".td-mobile-gate missing default display: none before @media"
fi

# 5. @media (pointer: coarse) present
if grep -q '@media (pointer: coarse)' css/typedrill.css; then pass "@media (pointer: coarse) present"; else die "missing @media (pointer: coarse)"; fi

# 6. .td-mobile-gate { display: block inside the media query
if grep -q '\.td-mobile-gate { display: block' css/typedrill.css; then pass ".td-mobile-gate { display: block present"; else die ".td-mobile-gate { display: block not found"; fi

# 7. paste listener on app.js
if grep -q "addEventListener('paste'" js/app.js; then pass "paste listener present"; else die "paste listener not found"; fi

# 8. preventDefault present
if grep -q 'e.preventDefault()' js/app.js; then pass "e.preventDefault() present"; else die "e.preventDefault() not found"; fi

# 9. body-click listener
if grep -q "document.body.addEventListener('click'" js/app.js; then pass "body-click listener present"; else die "body-click listener not found"; fi

# 10. closest selector (fixed-string match to avoid regex escaping headaches)
if grep -qF "closest('button, input, textarea, select, a, [contenteditable]')" js/app.js; then
  pass "closest selector present with correct interactive list"
else
  die "closest selector not found or wrong"
fi

# 11. input.focus()
if grep -q 'input.focus()' js/app.js; then pass "input.focus() present"; else die "input.focus() not found"; fi

# 12. node --check app.js
if node --check js/app.js 2>/dev/null; then pass "syntax: js/app.js"; else die "syntax error in js/app.js"; fi

# 13. No em dash anywhere in the tree
emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi

# 14. No !important anywhere in the tree (excluding this check script itself)
imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important anywhere"; else die "!important found $imp time(s)"; fi

# 15. Script tag count in index.html unchanged from 1A (1 in head + 6 at bottom = 7)
scripts=$(grep -c '<script' index.html)
if [ "$scripts" = "7" ]; then pass "7 <script tags in index.html"; else die "expected 7 <script tags, got $scripts"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
