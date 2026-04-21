#!/usr/bin/env bash
# TypeDrill task 1S -- options band restructure.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1S options band restructure check =="

# Top-level charset bar removed from HTML
if grep -q '<section class="td-charset"' index.html; then die "top-level td-charset section still present"; else pass "td-charset section removed from HTML"; fi

# charset.js has renderCharsetControls
if grep -q 'export function renderCharsetControls' js/charset.js; then pass "charset.js exports renderCharsetControls"; else die "charset.js missing renderCharsetControls"; fi

# Sources import renderCharsetControls
if grep -q 'renderCharsetControls' js/sources/common.js; then pass "common.js uses renderCharsetControls"; else die "common.js missing renderCharsetControls"; fi
if grep -q 'renderCharsetControls' js/sources/custom.js; then pass "custom.js uses renderCharsetControls"; else die "custom.js missing renderCharsetControls"; fi

# common.js exports renderOptions
if grep -q 'export function renderOptions' js/sources/common.js; then pass "common.js exports renderOptions"; else die "common.js missing renderOptions"; fi

# Registry wires common.renderOptions
if grep -q 'renderOptions: common.renderOptions' js/source-registry.js; then pass "registry wires common.renderOptions"; else die "registry missing common.renderOptions"; fi

# Band collapse logic
if grep -q 'bandCollapsed' js/app.js; then pass "app.js has bandCollapsed state"; else die "app.js missing bandCollapsed"; fi
if grep -q 'onSourceCardClick' js/app.js; then pass "app.js has onSourceCardClick"; else die "app.js missing onSourceCardClick"; fi

# Cache-bust
if grep -q 'css/typedrill.css?v=1.7' index.html; then pass "typedrill.css bumped to v=1.7"; else die "typedrill.css not v=1.7"; fi
if grep -q 'js/app.js?v=2.0' index.html; then pass "app.js bumped to v=2.0"; else die "app.js not v=2.0"; fi

# Syntax
for f in js/app.js js/charset.js js/sources/common.js js/sources/custom.js js/sources/symbols.js js/source-registry.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# No em dash / !important
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found"; fi

# Regression: all prior functional still pass (these have their own DOM stubs + init() compatibility path)
for f in _task1c_functional.mjs _task1d_functional.mjs _task1e_functional.mjs _task1f_functional.mjs _task1g_functional.mjs _task1h_functional.mjs _task1i_functional.mjs _task1j_functional.mjs _task1k_functional.mjs _task1l_functional.mjs _task1m_functional.mjs _task1p_functional.mjs; do
  if node "$f" > /dev/null 2>&1; then pass "regression: $f"; else die "regression: $f"; fi
done

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
