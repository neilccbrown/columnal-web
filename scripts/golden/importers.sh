#!/usr/bin/env bash
# Golden files for the importers and exporters:
#  1. The port generates the inputs in test/engine/importers/golden: text, HTML and Excel files,
#     saved files (from test/engine/data/golden), and the port's Excel export of each of their
#     tables (by running test/engine/importers/ImportersGolden.test.ts with GENERATE_IMPORTER_INPUTS=1).
#  2. scripts/golden/java/ImportersHarness.java imports or exports each of them with the ORIGINAL
#     classes (built by build-importers-jvm.sh), and writes what they did to java-*.txt (and Java's
#     own Excel exports to java-*.xlsx).
# ImportersGolden.test.ts then checks that the port does the same.
# Usage: scripts/golden/importers.sh   (needs Java 21; builds the original classes if needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="$ROOT/reference/columnal"
[ -f "$ROOT/reference/jvm/importers/classpath.txt" ] || "$ROOT/scripts/golden/build-importers-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/importers/classpath.txt")"
DIR="$ROOT/test/engine/importers/golden"
rm -rf "$DIR"
mkdir -p "$DIR"
( cd "$ROOT" && GENERATE_IMPORTER_INPUTS=1 npx vitest run test/engine/importers/ImportersGolden.test.ts > /dev/null )
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# The harness needs the table-reading part of HTMLImporter, which the build doesn't compile:
mkdir -p "$TMP/orig/importers" "$TMP/stripped" "$TMP/classes"
cp "$REF/importers/src/main/java/xyz/columnal/importers/HTMLImporter.java" "$TMP/orig/importers/"
python3 "$ROOT/scripts/golden/strip-annotations.py" "$TMP/orig" "$TMP/stripped"
python3 "$ROOT/scripts/golden/extract-html-table-reader.py" "$TMP/stripped/importers/HTMLImporter.java" "$TMP/HTMLTableReader.java"
javac -nowarn -encoding UTF-8 -proc:none -d "$TMP/classes" -cp "$CP" "$TMP/HTMLTableReader.java" "$ROOT/scripts/golden/java/ImportersHarness.java"
java -Duser.language=en -Duser.country=US -Duser.timezone=Europe/London -Dlog4j2.level=OFF -cp "$TMP/classes:$CP" golden.ImportersHarness "$DIR"
du -sh "$DIR"
