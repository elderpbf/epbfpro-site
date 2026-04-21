#!/usr/bin/env bash
# TypeDrill task 1K -- Texto personalizado + buildAllowedChars extraction.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1K custom source check =="

# Syntax
for f in js/charset.js js/sources/common.js js/sources/custom.js js/source-registry.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# charset.js exposes buildAllowedChars
if grep -q 'export function buildAllowedChars' js/charset.js; then pass "charset.js exports buildAllowedChars"; else die "charset.js missing buildAllowedChars"; fi

# common.js + custom.js import from charset.js
if grep -q 'import { buildAllowedChars }' js/sources/common.js; then pass "common.js imports buildAllowedChars"; else die "common.js missing import"; fi
if grep -q 'import { buildAllowedChars }' js/sources/custom.js; then pass "custom.js imports buildAllowedChars"; else die "custom.js missing import"; fi

# common.js no longer has its own buildAllowedChars or LETTERS constant
if grep -qE '^function buildAllowedChars' js/sources/common.js; then die "common.js still defines buildAllowedChars locally"; else pass "common.js no local buildAllowedChars"; fi
if grep -qE '^const LETTERS' js/sources/common.js; then die "common.js still has local LETTERS constant"; else pass "common.js no local LETTERS constant"; fi

# custom.js exports
if grep -q 'export function generate' js/sources/custom.js; then pass "custom.js exports generate"; else die "custom.js missing generate"; fi
if grep -q 'export function renderOptions' js/sources/custom.js; then pass "custom.js exports renderOptions"; else die "custom.js missing renderOptions"; fi

# registry wires custom.renderOptions
if grep -q 'renderOptions: custom.renderOptions' js/source-registry.js; then pass "registry wires custom.renderOptions"; else die "registry missing custom.renderOptions"; fi

# Cache-bust
if grep -q "js/app.js?v=1.5" index.html; then pass "app.js bumped to v=1.5"; else die "app.js not v=1.5"; fi

# No em dash, no leftover stubs
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
if grep -q "stub: source.custom" js/sources/custom.js; then die "custom stub remains"; else pass "no leftover custom stub"; fi

# Regression: 1J functional must still pass
if node _task1j_functional.mjs > /dev/null 2>&1; then pass "1J functional still passes after extraction"; else die "1J functional regressed"; fi

# 1K functional
if node _task1k_functional.mjs; then pass "1K functional harness passed"; else die "1K functional failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
