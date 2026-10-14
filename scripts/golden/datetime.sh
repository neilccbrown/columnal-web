#!/usr/bin/env bash
# Golden values for Columnal's date/time formatters (DataType.DateTimeInfo): formatting with the
# strict formatters, and parsing with the strict and flexible ones.  Runs the ORIGINAL DateTimeInfo
# (extracted from reference/columnal) in scripts/golden/java/DateTimeHarness.java, in the en-US
# locale, and writes test/engine/types/golden/datetime.txt.
# Usage: scripts/golden/datetime.sh   (needs Java 17+; downloads Guava into reference/jars)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JARS="$ROOT/reference/jars"
GUAVA="$JARS/guava-31.1-jre.jar"
if [ ! -f "$GUAVA" ]; then
    mkdir -p "$JARS"
    URL=https://repo1.maven.org/maven2/com/google/guava/guava/31.1-jre/guava-31.1-jre.jar
    curl -sSfL -o "$GUAVA.tmp" "$URL"
    [ "$(shasum "$GUAVA.tmp" | cut -d' ' -f1)" = "$(curl -sSfL "$URL.sha1")" ] || { echo "Checksum mismatch for Guava"; exit 1; }
    mv "$GUAVA.tmp" "$GUAVA"
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
EXTRACT="$ROOT/scripts/golden/extract-java-methods.py"
python3 "$EXTRACT" "$ROOT/reference/columnal/types/src/main/java/xyz/columnal/data/datatype/DataType.java" "class DateTimeInfo" -parse -fromParsed > "$TMP/datetimeinfo.java"
python3 "$EXTRACT" "$ROOT/reference/columnal/utility/src/main/java/xyz/columnal/utility/Utility.java" allPairs mapListI > "$TMP/utility.java"
python3 - "$ROOT/scripts/golden/java/DateTimeHarness.java" "$TMP" <<'PY'
import sys
harness, tmp = sys.argv[1:]
text = open(harness).read().replace("    //DATETIMEINFO", open(tmp + "/datetimeinfo.java").read()).replace("    //UTILITY", open(tmp + "/utility.java").read())
open(tmp + "/DateTimeHarness.java", "w").write(text)
PY
mkdir -p "$ROOT/test/engine/types/golden"
mkdir -p "$TMP/classes"
javac -nowarn -d "$TMP/classes" -cp "$GUAVA" "$TMP/DateTimeHarness.java"
java -Duser.language=en -Duser.country=US -cp "$TMP/classes:$GUAVA" golden.DateTimeHarness > "$ROOT/test/engine/types/golden/datetime.txt"
wc -l "$ROOT/test/engine/types/golden/datetime.txt"
