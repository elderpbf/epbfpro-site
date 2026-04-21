#!/usr/bin/env bash
# TypeDrill task 1N -- Backstage landing tool card.
# Run from the backstage/ folder (NOT from typedrill/).

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1N Backstage tool card check =="

# Anchor + metadata
if grep -qF 'id="card-typedrill"' index.html; then pass "card-typedrill anchor present"; else die "card-typedrill anchor missing"; fi
if grep -qF 'href="typedrill/"' index.html; then pass "href typedrill/ present"; else die "href typedrill/ missing"; fi
if grep -qF 'data-key="typedrill_desc"' index.html; then pass "data-key typedrill_desc present"; else die "data-key typedrill_desc missing"; fi
if grep -qE "typedrill_desc:[[:space:]]+'Treino de digitação'" index.html; then pass "translation typedrill_desc set to 'Treino de digitação'"; else die "translation typedrill_desc missing"; fi

# Three cards in the grid
cards=$(grep -c 'class="bs-tool-card"' index.html)
if [ "$cards" = "3" ]; then pass "3 tool cards in the grid"; else die "expected 3 cards, got $cards"; fi

# aria-label
if grep -qF 'aria-label="Abrir TypeDrill"' index.html; then pass "aria-label set"; else die "aria-label missing"; fi

# No em dash
emdash=$(grep -ln $'\xe2\x80\x94' index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash in backstage/index.html"; else die "em dash found in backstage/index.html"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
