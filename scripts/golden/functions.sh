#!/usr/bin/env bash
# Golden values for the expressions and functions modules (big-math's logarithms, and parsing,
# saving, type checking and evaluating the expressions in functions-cases.txt plus random
# arithmetic): runs scripts/golden/java/FunctionsHarness.java against the ORIGINAL classes and
# writes test/engine/functions/golden/functions.txt.
# Usage: scripts/golden/functions.sh   (needs Java 17+; builds the original classes if needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/reference/jvm/classes/xyz/columnal/transformations/function/FunctionList.class" ] || "$ROOT/scripts/golden/build-columnal-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/classpath.txt")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -nowarn -d "$TMP" -cp "$CP" "$ROOT/scripts/golden/java/FunctionsHarness.java"
mkdir -p "$ROOT/test/engine/functions/golden"
java -Duser.language=en -Duser.country=US -Dlog4j2.level=OFF -cp "$TMP:$CP" golden.FunctionsHarness "$ROOT/scripts/golden/functions-cases.txt" > "$ROOT/test/engine/functions/golden/functions.txt"
wc -l "$ROOT/test/engine/functions/golden/functions.txt"
