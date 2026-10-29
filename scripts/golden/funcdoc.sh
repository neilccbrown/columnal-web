#!/usr/bin/env bash
# Golden files for the function documentation: runs the ORIGINAL XSLT stylesheets
# (reference/columnal/xml/src/main/xslt) with Saxon-HE 11.4, as the Java build did, and writes
# their output to test/engine/functions/golden/funcdoc/:
#   - function_*_en.properties, from funcdoc-types-and-mini.xsl applied to _all.xml
#   - <name>.test, from extract-tests.xsl applied to each funcdoc file
# and the dialog help to test/gui-logic/utility-gui/golden/help/:
#   - <dialog>_en.properties, from make-help-indiv.xsl applied to each help file
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

HELP_OUT="$ROOT/test/gui-logic/utility-gui/golden/help"
rm -rf "$HELP_OUT"
mkdir -p "$HELP_OUT" "$TMP/help"
for f in "$XML"/help/*.xml; do
    java -cp "$CP" net.sf.saxon.Transform -s:"$f" -xsl:"$XML/xslt/make-help-indiv.xsl" -o:"$TMP/dummy.txt" myOutputDir="$TMP/help"
done
cp "$TMP"/help/*_en.properties "$HELP_OUT"/
ls "$HELP_OUT"

# The documentation pages, to test/gui-logic/lex-editor/golden/funcdoc-pages.json ({ file: { title,
# bodyClass, body } }): funcdoc-indiv-html.xsl applied to _all.xml, and funcdoc-joined-html.xsl to each
# file whose root is functionDocumentation.  scripts/funcdoc/funcdocHtml.mjs should give the same.
PAGES_OUT="$ROOT/test/gui-logic/lex-editor/golden"
mkdir -p "$PAGES_OUT" "$TMP/pages"
java -cp "$CP" net.sf.saxon.Transform -xi:on -s:"$XML/funcdoc/_all.xml" -xsl:"$XML/xslt/funcdoc-indiv-html.xsl" -o:"$TMP/dummy.txt" myOutputDir="$TMP/pages"
for f in "$XML"/funcdoc/*.xml; do
    grep -q "<functionDocumentation" "$f" || continue
    java -cp "$CP" net.sf.saxon.Transform -s:"$f" -xsl:"$XML/xslt/funcdoc-joined-html.xsl" -o:"$TMP/pages/$(basename "$f" .xml).html"
done
node -e '
const fs = require("fs"), dir = process.argv[1], pages = {};
for (const f of fs.readdirSync(dir).sort()) {
    const html = fs.readFileSync(dir + "/" + f, "utf8");
    const body = /<body( class="([^"]*)")?>([\s\S]*)<\/body>/.exec(html);
    pages[f] = { title: /<title>([\s\S]*)<\/title>/.exec(html)[1], bodyClass: body[2] ?? null, body: body[3] };
}
fs.writeFileSync(process.argv[2], JSON.stringify(pages, null, 1) + "\n");
console.log(Object.keys(pages).length + " pages");
' "$TMP/pages" "$PAGES_OUT/funcdoc-pages.json"
