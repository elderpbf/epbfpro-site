#!/usr/bin/env bash
# TypeDrill task 1C engine verification.
# Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1C engine check =="

# 1. engine.js imports skill.recordAttempt and LAYOUT
if grep -q "from './skill.js'" js/engine.js; then pass "engine imports skill"; else die "engine missing skill import"; fi
if grep -q "from './data/abnt2-layout.js'" js/engine.js; then pass "engine imports LAYOUT"; else die "engine missing LAYOUT import"; fi

# 2. engine exports attach/detach/setTarget
for fn in attach detach setTarget; do
  if grep -q "export function $fn" js/engine.js; then pass "engine exports $fn"; else die "engine missing export $fn"; fi
done

# 3. engine listens for keydown and input
if grep -q "addEventListener('keydown'" js/engine.js; then pass "engine listens keydown"; else die "engine missing keydown listener"; fi
if grep -q "addEventListener('input'" js/engine.js; then pass "engine listens input"; else die "engine missing input listener"; fi

# 4. engine checks event.location for Shift side
if grep -q 'e.location === 1' js/engine.js && grep -q 'e.location === 2' js/engine.js; then
  pass "engine checks Shift event.location"
else
  die "engine missing Shift location check"
fi

# 5. engine truncates input.value on wrong char
if grep -q 'input.value = value.slice(0, cursor - 1)' js/engine.js; then
  pass "engine truncates on wrong char"
else
  die "engine missing truncate-on-wrong logic"
fi

# 6. abnt2-layout.js has entry for %
if grep -q "'%':" js/data/abnt2-layout.js; then pass "LAYOUT has %"; else die "LAYOUT missing %"; fi

# 7. LAYOUT['%'] hand is left
if grep -q "'%': *{ *hand: *'left'" js/data/abnt2-layout.js; then pass "LAYOUT % hand left"; else die "LAYOUT % hand not left"; fi

# 8. node --check passes
for f in js/engine.js js/data/abnt2-layout.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# 9. No em dash, no !important, no leftover stub console.debug
emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi
imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi
stubs=$(grep -c "console.debug('stub:" js/engine.js js/data/abnt2-layout.js 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$stubs" = "0" ]; then pass "no leftover stubs"; else die "leftover stubs: $stubs"; fi

# 10. Functional harness
if node _task1c_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
