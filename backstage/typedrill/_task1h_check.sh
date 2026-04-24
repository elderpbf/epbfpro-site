#!/usr/bin/env bash
# TypeDrill task 1H -- source registry + session.
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1H source-registry + session check =="

# Files exist
if [ -f js/source-registry.js ]; then pass "source-registry.js exists"; else die "source-registry.js missing"; fi
if [ -f js/session.js ]; then pass "session.js exists"; else die "session.js missing"; fi

# Syntax
for f in js/source-registry.js js/session.js js/app.js js/skill.js js/charset.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# source-registry exports
for fn in register get list; do
  if grep -q "export function $fn" js/source-registry.js; then pass "source-registry exports $fn"; else die "source-registry missing $fn"; fi
done

# 3 register calls
reg_count=$(grep -cE 'register\(\{' js/source-registry.js)
if [ "$reg_count" = "3" ]; then pass "3 sources registered (symbols/common/custom)"; else die "expected 3 register calls, got $reg_count"; fi

# session.js exports
for fn in init setActiveSource getActiveSource getOptions setOptions regenerate nextLine currentLine subscribe; do
  if grep -q "export function $fn" js/session.js; then pass "session.js exports $fn"; else die "session.js missing $fn"; fi
done

# app.js wiring
for needle in "engine.setTarget" "engine.attach" "renderer.paint" "stats.startSession" "stats.startLine"; do
  if grep -q "$needle" js/app.js; then pass "app.js references $needle"; else die "app.js missing $needle"; fi
done

# session.js subscribes to charset
if grep -q "charset.subscribe" js/session.js; then pass "session.js subscribes to charset"; else die "session.js missing charset.subscribe"; fi

# skill.js has sources default + migration
if grep -q "sources:" js/skill.js; then pass "skill.js has settings.sources default"; else die "skill.js missing sources default"; fi
if grep -q "state.settings.sources" js/skill.js; then pass "skill.js has sources migration"; else die "skill.js missing sources migration"; fi

# Cache-bust
if grep -q "css/typedrill.css?v=1.4" index.html; then pass "typedrill.css bumped to v=1.4"; else die "typedrill.css not v=1.4"; fi
if grep -q "js/app.js?v=1.3" index.html; then pass "app.js bumped to v=1.3"; else die "app.js not v=1.3"; fi

# No em dash / no !important
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash"; else die "em dash found"; fi
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found"; fi

# Functional
if node _task1h_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then echo "== ALL CHECKS PASSED =="; exit 0
else echo "== FAILURES: $fail =="; exit 1
fi
