#!/usr/bin/env bash
# TypeDrill task 1G -- charset module (toggles + focus chips).
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1G charset check =="

# 1. File exists
if [ -f js/charset.js ]; then pass "js/charset.js exists"; else die "js/charset.js missing"; fi

# 2. Syntax
if node --check js/charset.js 2>/dev/null; then pass "syntax: js/charset.js"; else die "syntax: js/charset.js"; fi
if node --check js/skill.js 2>/dev/null; then pass "syntax: js/skill.js"; else die "syntax: js/skill.js"; fi
if node --check js/app.js 2>/dev/null; then pass "syntax: js/app.js"; else die "syntax: js/app.js"; fi

# 3. charset.js named exports
for fn in init get subscribe addFocus removeFocus; do
  if grep -q "export function $fn" js/charset.js; then pass "charset.js exports $fn"; else die "charset.js missing $fn export"; fi
done

# 4. skill.js has charset default + migration
if grep -q "charset:" js/skill.js; then pass "skill.js references charset settings key"; else die "skill.js missing charset key"; fi
if grep -q "settings.charset" js/skill.js; then pass "skill.js has charset migration"; else die "skill.js missing charset migration"; fi

# 5. app.js imports charset and calls init
if grep -q "import \* as charset" js/app.js; then pass "app.js imports charset"; else die "app.js missing charset import"; fi
if grep -q "charset.init()" js/app.js; then pass "app.js calls charset.init()"; else die "app.js missing charset.init()"; fi

# 6. index.html cache-bust bumps
if grep -q "css/typedrill.css?v=1.3" index.html; then pass "typedrill.css bumped to v=1.3"; else die "typedrill.css not bumped to v=1.3"; fi
if grep -q "js/app.js?v=1.2" index.html; then pass "app.js bumped to v=1.2"; else die "app.js not bumped to v=1.2"; fi

# 7. No em dash, no !important
emdash=$(grep -rln $'\xe2\x80\x94' js/ css/ index.html 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash in code/css/html"; else die "em dash found in $emdash file(s)"; fi
imp=$(grep -r '!important' css/ js/ 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi

# 8. Functional harness
if node _task1g_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
