#!/usr/bin/env bash
# Golden values for the types module (units, unit and type inference, type parsing and saving,
# value printing, flexible date parsing, OutputBuilder): runs scripts/golden/java/TypesHarness.java
# against the ORIGINAL classes and writes test/engine/types/golden/types.txt.
# Usage: scripts/golden/types.sh   (needs Java 17+; builds the original classes if needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/reference/jvm/classpath.txt" ] || "$ROOT/scripts/golden/build-columnal-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/classpath.txt")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -nowarn -d "$TMP" -cp "$CP" "$ROOT/scripts/golden/java/TypesHarness.java"
mkdir -p "$ROOT/test/engine/types/golden"
java -Duser.language=en -Duser.country=US -Dlog4j2.level=OFF -cp "$TMP:$CP" golden.TypesHarness > "$ROOT/test/engine/types/golden/types.txt"
wc -l "$ROOT/test/engine/types/golden/types.txt"
