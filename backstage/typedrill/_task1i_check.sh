#!/usr/bin/env bash
# TypeDrill task 1I -- Símbolos ABNT2 (finger-return) source.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1I symbols source check =="

# 16 entries in abnt2-symbols.js
entries=$(grep -cE '^[[:space:]]+char:' js/data/abnt2-symbols.js)
if [ "$entries" = "16" ]; then pass "SYMBOLS has 16 entries"; else die "expected 16 entries, got $entries"; fi

# Syntax
for f in js/data/abnt2-symbols.js js/data/abnt2-layout.js js/sources/symbols.js js/source-registry.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# Exports
if grep -q 'export function generate' js/sources/symbols.js; then pass "symbols.js exports generate"; else die "symbols.js missing generate"; fi
if grep -q 'export function renderOptions' js/sources/symbols.js; then pass "symbols.js exports renderOptions"; else die "symbols.js missing renderOptions"; fi

# Registry passes renderOptions
if grep -q 'renderOptions: symbols.renderOptions' js/source-registry.js; then pass "registry wires symbols.renderOptions"; else die "registry missing symbols.renderOptions"; fi

# Cache-bust
if grep -q "js/app.js?v=1.4" index.html; then pass "app.js bumped to v=1.4"; else die "app.js not v=1.4"; fi

# No em dash / no leftover stubs
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
stubs=$(grep -c "stub: source.symbols" js/sources/symbols.js)
if [ "$stubs" = "0" ]; then pass "no leftover symbols stub"; else die "symbols stub remains"; fi

# Functional
if node _task1i_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
