#!/usr/bin/env bash
# Golden files for the function documentation: runs the ORIGINAL XSLT stylesheets
# (reference/columnal/xml/src/main/xslt) with Saxon-HE 11.4, as the Java build did, and writes
# their output to test/engine/functions/golden/funcdoc/:
#   - function_*_en.properties, from funcdoc-types-and-mini.xsl applied to _all.xml
#   - <name>.test, from extract-tests.xsl applied to each funcdoc file
# test/engine/functions/Funcdoc.test.ts checks that scripts/funcdoc/funcdoc.mjs gives the same.
# Usage: scripts/golden/funcdoc.sh   (needs Java 17+; run npm run fetch-reference first)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JARS="$ROOT/reference/jars"
XML="$ROOT/reference/columnal/xml/src/main"
OUT="$ROOT/test/engine/functions/golden/funcdoc"

fetch() # path file
{
    local path="$1" file="$JARS/$2"
    if [ ! -f "$file" ]; then
        mkdir -p "$JARS"
        local url="https://repo1.maven.org/maven2/$path/$2"
        curl -sSfL -o "$file.tmp" "$url"
        [ "$(shasum "$file.tmp" | cut -d' ' -f1)" = "$(curl -sSfL "$url.sha1" | cut -c1-40)" ] || { echo "Checksum mismatch for $2" >&2; exit 1; }
        mv "$file.tmp" "$file"
    fi
    CP="${CP:+$CP:}$file"
}
CP=""
fetch net/sf/saxon/Saxon-HE/11.4 Saxon-HE-11.4.jar
fetch org/xmlresolver/xmlresolver/4.4.3 xmlresolver-4.4.3.jar
fetch org/xmlresolver/xmlresolver/4.4.3 xmlresolver-4.4.3-data.jar
fetch org/apache/httpcomponents/client5/httpclient5/5.1.3 httpclient5-5.1.3.jar
fetch org/apache/httpcomponents/core5/httpcore5/5.1.3 httpcore5-5.1.3.jar

rm -rf "$OUT"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
java -cp "$CP" net.sf.saxon.Transform -xi:on -s:"$XML/funcdoc/_all.xml" -xsl:"$XML/xslt/funcdoc-types-and-mini.xsl" -o:"$TMP/dummy.txt" myOutputDir="$OUT"
for f in "$XML"/funcdoc/*.xml; do
    name="$(basename "$f" .xml)"
    [ "$name" = "_all" ] && continue
    java -cp "$CP" net.sf.saxon.Transform -xi:on -s:"$f" -xsl:"$XML/xslt/extract-tests.xsl" -o:"$OUT/$name.test"
done
ls "$OUT"
