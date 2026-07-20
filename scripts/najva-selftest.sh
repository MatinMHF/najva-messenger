#!/usr/bin/env bash
#
# Self-check for the version helpers in najva-lib.sh.
#   bash scripts/najva-selftest.sh
#
# Only the pure functions are covered: latest_version and perform_update talk to
# git, the network and Docker, so they are exercised by running a real update.
set -euo pipefail

. "$(dirname "$0")/najva-lib.sh"

fail=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s (expected %s, got %s)\n' "$1" "$2" "$3"
    fail=1
  fi
}

gt() { if version_gt "$1" "$2"; then echo yes; else echo no; fi; }

# --- version_gt ---------------------------------------------------------------

check "1.0.1 > 1.0.0"            yes "$(gt 1.0.1 1.0.0)"
check "1.1.0 > 1.0.9"            yes "$(gt 1.1.0 1.0.9)"
check "2.0.0 > 1.9.9"            yes "$(gt 2.0.0 1.9.9)"
check "equal is not greater"     no  "$(gt 1.0.0 1.0.0)"
check "older is not greater"     no  "$(gt 1.0.0 1.0.1)"

# The reason for sort -V: a string compare says "1.9.0" > "1.10.0", which would
# silently stop offering updates after the ninth patch release.
check "1.10.0 > 1.9.0"           yes "$(gt 1.10.0 1.9.0)"
check "1.9.0 is not > 1.10.0"    no  "$(gt 1.9.0 1.10.0)"

# A pre-versioning install reports 0.0.0 and must accept any real release.
check "1.0.0 > 0.0.0"            yes "$(gt 1.0.0 0.0.0)"

# --- installed_version --------------------------------------------------------

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

check "missing VERSION is 0.0.0" "0.0.0" "$(installed_version "$tmp")"

printf '1.2.3\n' > "$tmp/VERSION"
check "reads VERSION"            "1.2.3" "$(installed_version "$tmp")"

# CRLF survives a checkout on a Windows clone; an untrimmed \r breaks the compare.
printf '1.2.3\r\n' > "$tmp/VERSION"
check "strips CRLF"              "1.2.3" "$(installed_version "$tmp")"

printf '  1.2.3  ' > "$tmp/VERSION"
check "strips whitespace"        "1.2.3" "$(installed_version "$tmp")"

# --- the repo's own VERSION ---------------------------------------------------

repo_version="$(installed_version "$(dirname "$0")/..")"
check "repo VERSION is readable" yes "$([ -n "$repo_version" ] && echo yes || echo no)"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || echo "FAILURES"
exit "$fail"
