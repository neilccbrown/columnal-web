#!/usr/bin/env bash
# Golden files for the data module (the .rec file format):
#  1. The port generates random saved files, test/engine/data/golden/rec/input-*.rec (by running
#     test/engine/data/DataGolden.test.ts with GENERATE_REC_INPUTS=1).
#  2. scripts/golden/java/DataHarness.java loads each of those, and the hand-written files in
#     test/engine/data/golden/handwritten/input-*.rec, into the ORIGINAL TableManager and saves
#     it again, as java-*.rec (only if that differs from the input).
# DataGolden.test.ts then checks that the port loads both and saves them exactly as Java did.
# Usage: scripts/golden/data.sh   (needs Java 21; builds the original classes if needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/reference/jvm/classes/xyz/columnal/data/TableManager.class" ] || "$ROOT/scripts/golden/build-columnal-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/classpath.txt")"
DIR="$ROOT/test/engine/data/golden/rec"
rm -rf "$DIR"
mkdir -p "$DIR"
( cd "$ROOT" && GENERATE_REC_INPUTS=1 npx vitest run test/engine/data/DataGolden.test.ts > /dev/null )
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -nowarn -d "$TMP" -cp "$CP" "$ROOT/scripts/golden/java/DataHarness.java"
java -Duser.language=en -Duser.country=US -Dlog4j2.level=OFF -cp "$TMP:$CP" golden.DataHarness "$DIR" "$ROOT/test/engine/data/golden/handwritten"
du -sh "$DIR" "$ROOT/test/engine/data/golden/handwritten"
