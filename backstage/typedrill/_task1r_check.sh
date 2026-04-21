#!/usr/bin/env bash
# TypeDrill task 1R -- hide visible input.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1R hide visible input check =="

# Visually-hidden pattern on .td-input
if grep -q 'clip: rect(0,0,0,0)' css/typedrill.css; then pass "clip: rect(0,0,0,0) present"; else die "clip rule missing"; fi
if grep -q 'position: absolute' css/typedrill.css; then pass "position: absolute present"; else die "position rule missing"; fi

# No display:none (would kill focus)
if grep -q '\.td-input[[:space:]]*{[^}]*display:[[:space:]]*none' css/typedrill.css; then die ".td-input uses display:none (breaks focus)"; else pass ".td-input avoids display:none"; fi

# Cache-bust
if grep -q 'css/typedrill.css?v=1.6' index.html; then pass "typedrill.css bumped to v=1.6"; else die "typedrill.css not v=1.6"; fi

# No em dash
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi

# No !important
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found"; fi

# input element still present in HTML (still focusable)
if grep -q 'id="input"' index.html; then pass "input element still in DOM"; else die "input element removed from DOM"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
