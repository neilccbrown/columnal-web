#!/usr/bin/env bash
# Compares the port with the original Java engine on saved Columnal files (such as real-world
# ones): runs the port's command-line tool (scripts/cli/columnal-cli.ts) and its Java counterpart
# (scripts/golden/java/CliHarness.java) on each file, and compares what they write: the file
# saved again, the contents of every table, and each table's CSV, HTML (without the export time),
# Excel (compared as the cells POI reads from each) and R exports.
# Usage: scripts/compare-with-java.sh [--max-rows N] <file.rec>...   (needs Java 21)
# Exits with 1 if any file differs; the differences are printed.
#
# Known differences:
#  - The Java bugs the port fixes (PLAN.md, Phase 6): CSV export doubles quotes (Java tripled them);
#    CSV and HTML export write an invalid value as entered (Java failed, writing an .error.txt);
#    Excel export writes a date and time as it is (Java moved it by the system's offset from UTC)
#    and a date before 1900 as text (Java wrote -1).
#  - Excel exports of date-times after 2499 can differ by an hour: the port's time-zone data (from
#    js-joda) has no daylight saving after 2499, whereas Java continues the rules.
#  - Java lists the column types in Concatenate's "differing types" error in an order
# which varies between runs (a HashMap keyed by DataType, whose hash includes an enum's identity hash).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX_ROWS=()
if [ "${1:-}" = "--max-rows" ]; then MAX_ROWS=(--max-rows "$2"); shift 2; fi
[ $# -ge 1 ] || { echo "Usage: $0 [--max-rows N] <file.rec>..." >&2; exit 2; }
[ -f "$ROOT/reference/jvm/importers/classpath.txt" ] || "$ROOT/scripts/golden/build-importers-jvm.sh"
CP="$(cat "$ROOT/reference/jvm/importers/classpath.txt")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -nowarn -encoding UTF-8 -proc:none -d "$TMP/classes" -cp "$CP" "$ROOT/scripts/golden/java/CliHarness.java"
JAVA=(java -Duser.language=en -Duser.country=US -Duser.timezone=Europe/London -Dlog4j2.level=OFF -cp "$TMP/classes:$CP" golden.CliHarness)
status=0
for file in "$@"; do
    # (npm runs the tool from the project's directory)
    file="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
    out="$TMP/out/$(basename "$file" .rec)"
    # (Each side's log, such as internal errors which the engine logs and carries on, goes to a file)
    mkdir -p "$out"
    ( cd "$ROOT" && TZ=Europe/London npm run -s cli -- "${MAX_ROWS[@]}" "$file" "$out/port" ) 2> "$out/port.log"
    "${JAVA[@]}" "${MAX_ROWS[@]}" export "$file" "$out/java" 2> "$out/java.log"
    for side in port java; do
        for html in "$out/$side"/*.html; do
            [ -e "$html" ] && sed -i.bak -E 's#<p>Exported on [^<]*</p>#<p>Exported on (time)</p>#' "$html" && rm "$html.bak"
        done
        for xlsx in "$out/$side"/*.xlsx; do
            [ -e "$xlsx" ] && "${JAVA[@]}" dump-xlsx "$xlsx" > "$xlsx.txt" && rm "$xlsx"
        done
    done
    if diff -r "$out/java" "$out/port" > "$out/diff.txt"; then
        echo "SAME: $file"
    else
        echo "DIFFERENT: $file"
        head -100 "$out/diff.txt"
        status=1
    fi
done
exit $status
