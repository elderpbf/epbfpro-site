#!/usr/bin/env bash
# TypeDrill task 1D skill-tracker verification -- runs [AUTO] assertions.
# All must pass before commit. Run from the typedrill/ folder.

set -u
cd "$(dirname "$0")"
fail=0
pass() { echo "  ok   $1"; }
die()  { echo "  FAIL $1"; fail=$((fail + 1)); }

echo "== 1D skill-tracker check =="

# 1. storage.js uses localStorage
if grep -q 'localStorage.getItem' js/storage.js; then pass "storage.readJSON uses localStorage.getItem"; else die "storage.readJSON missing localStorage.getItem"; fi
if grep -q 'localStorage.setItem' js/storage.js; then pass "storage.writeJSON uses localStorage.setItem"; else die "storage.writeJSON missing localStorage.setItem"; fi

# 2. storage.js has error handling around JSON parse/stringify
if grep -q 'JSON.parse' js/storage.js && grep -q 'catch' js/storage.js; then pass "storage has try/catch around JSON"; else die "storage missing try/catch"; fi

# 3. skill.js imports storage
if grep -q "from './storage.js'" js/skill.js; then pass "skill.js imports storage"; else die "skill.js missing storage import"; fi

# 4. skill.js exports all four required functions
for fn in recordAttempt get set reset; do
  if grep -q "export function $fn" js/skill.js; then pass "skill.js exports $fn"; else die "skill.js missing export $fn"; fi
done

# 5. skill.js defines DEBOUNCE_MS and uses setTimeout
if grep -q 'DEBOUNCE_MS' js/skill.js && grep -q 'setTimeout' js/skill.js; then pass "skill.js has debounce timer"; else die "skill.js missing DEBOUNCE_MS / setTimeout"; fi

# 6. skill.js binds beforeunload
if grep -q "addEventListener('beforeunload'" js/skill.js; then pass "skill.js binds beforeunload"; else die "skill.js missing beforeunload listener"; fi

# 7. skill.js guards window access for Node
if grep -q "typeof window === 'undefined'" js/skill.js; then pass "skill.js guards window for Node"; else die "skill.js missing window guard"; fi

# 8. skill.js uses td_skill_v1 via KEYS
if grep -q 'KEYS.skill' js/skill.js; then pass "skill.js uses KEYS.skill"; else die "skill.js not using KEYS constant"; fi

# 9. node --check passes
for f in js/storage.js js/skill.js; do
  if node --check "$f" 2>/dev/null; then pass "syntax: $f"; else die "syntax: $f"; fi
done

# 10. No em dash, no !important, no stub console.debug left behind
emdash=$(grep -rln $'\xe2\x80\x94' . 2>/dev/null | wc -l)
if [ "$emdash" = "0" ]; then pass "no em dash anywhere"; else die "em dash found in $emdash file(s)"; fi

imp=$(grep -r --exclude='_task*_check.sh' '!important' . 2>/dev/null | wc -l)
if [ "$imp" = "0" ]; then pass "no !important"; else die "!important found $imp time(s)"; fi

stubs=$(grep -c "console.debug('stub:" js/storage.js js/skill.js 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$stubs" = "0" ]; then pass "no leftover stub console.debug lines"; else die "leftover stubs: $stubs"; fi

# 11. Functional Node harness
if node _task1d_functional.mjs; then pass "functional harness passed"; else die "functional harness failed"; fi

echo
if [ "$fail" = "0" ]; then
  echo "== ALL CHECKS PASSED =="
  exit 0
else
  echo "== FAILURES: $fail =="
  exit 1
fi
