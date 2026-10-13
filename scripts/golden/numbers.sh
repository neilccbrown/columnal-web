#!/usr/bin/env bash
# Golden values for Columnal's number utilities (parse, arithmetic, raise, compare, fraction display).
# Runs the ORIGINAL Utility methods (extracted from reference/columnal; see scripts/fetch-reference.sh)
# in scripts/golden/java/NumbersHarness.java, and writes test/engine/utility/golden/numbers.txt.
# Java results are shown with trailing zeros stripped: numbers here are canonical (docs/CONVENTIONS.md).
# Usage: scripts/golden/numbers.sh   (needs Java 17+)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
python3 "$ROOT/scripts/golden/extract-java-methods.py" "$ROOT/reference/columnal/utility/src/main/java/xyz/columnal/utility/Utility.java" \
    parseNumberOpt negate addSubtractNumbers multiplyNumbers divideNumbers raiseNumber toBigDecimal compareNumbers "enum EpsilonType" \
    getFracPartAsString getFracPart getIntegerPart isIntegral withNumberInt cast > "$TMP/extracted.java"
python3 - "$ROOT/scripts/golden/java/NumbersHarness.java" "$TMP/extracted.java" "$TMP/NumbersHarness.java" <<'PY'
import sys
harness, extracted, out = sys.argv[1:]
text = open(harness).read().replace("    //EXTRACTED", open(extracted).read())
open(out, "w").write(text)
PY
mkdir -p "$ROOT/test/engine/utility/golden"
java "$TMP/NumbersHarness.java" > "$ROOT/test/engine/utility/golden/numbers.txt"
wc -l "$ROOT/test/engine/utility/golden/numbers.txt"
