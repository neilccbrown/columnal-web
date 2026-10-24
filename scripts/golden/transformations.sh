#!/usr/bin/env bash
# Golden files for the transformations:
#  1. The port generates random saved files with data tables and transformations,
#     test/engine/transformations/golden/input-*.rec (by running
#     test/engine/transformations/TransformationsGolden.test.ts with GENERATE_TRANSFORMATION_INPUTS=1).
#  2. scripts/golden/java/TransformationsHarness.java loads each of those into the ORIGINAL
#     TableManager and TransformationManager, saves it again as java-*.rec (only if that differs
#     from the input, and that again as java2-*.rec if it differs), and writes the contents of every table to java-*.txt.
# TransformationsGolden.test.ts then checks that the port saves and computes the same.
# Usage: scripts/golden/transformations.sh   (needs Java 21; builds the original classes if needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/reference/jvm/classes/xyz/columnal/transformations/TransformationManager.class" ] || "$ROOT/scripts/golden/build-columnal-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/classpath.txt")"
DIR="$ROOT/test/engine/transformations/golden"
rm -rf "$DIR"
mkdir -p "$DIR"
( cd "$ROOT" && GENERATE_TRANSFORMATION_INPUTS=1 npx vitest run test/engine/transformations/TransformationsGolden.test.ts > /dev/null )
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -nowarn -d "$TMP" -cp "$CP" "$ROOT/scripts/golden/java/TransformationsHarness.java"
java -Duser.language=en -Duser.country=US -Dlog4j2.level=OFF -cp "$TMP:$CP" golden.TransformationsHarness "$DIR"
du -sh "$DIR"
