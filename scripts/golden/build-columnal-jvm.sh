#!/usr/bin/env bash
# Builds the ORIGINAL Columnal engine modules (Java, from reference/columnal) into
# reference/jvm/classes, so golden-value harnesses can run the real code on the JVM.
#   scripts/golden/build-columnal-jvm.sh   (needs Java 17+; run npm run fetch-reference first)
# Downloads the Maven dependencies into reference/jars (checking their SHA-1s), generates the
# ANTLR parsers, strips the Checker Framework annotations (scripts/golden/strip-annotations.py)
# and compiles.  Prints the classpath for harnesses to use.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="$ROOT/reference/columnal"
JARS="$ROOT/reference/jars"
OUT="$ROOT/reference/jvm"
# The engine modules built so far, in dependency order:
MODULES="utility-error utility-functional utility-adt parsers identifiers utility types data expressions functions"

fetch() # group/artifact/version file
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
fetch com/google/guava/guava/31.1-jre guava-31.1-jre.jar
fetch com/google/guava/failureaccess/1.0.1 failureaccess-1.0.1.jar
fetch org/antlr/antlr4-runtime/4.11.1 antlr4-runtime-4.11.1.jar
fetch commons-io/commons-io/2.11.0 commons-io-2.11.0.jar
fetch org/apache/commons/commons-lang3/3.12.0 commons-lang3-3.12.0.jar
fetch one/util/streamex/0.8.1 streamex-0.8.1.jar
fetch org/sosy-lab/common/0.3000-529-g6152d88 common-0.3000-529-g6152d88.jar
fetch info/debatty/java-string-similarity/2.0.0 java-string-similarity-2.0.0.jar
fetch org/apache/logging/log4j/log4j-api/2.19.0 log4j-api-2.19.0.jar
fetch org/apache/logging/log4j/log4j-core/2.19.0 log4j-core-2.19.0.jar
fetch de/uni-freiburg/informatik/ultimate/smtinterpol/2.5-1242-g5c50fb6d smtinterpol-2.5-1242-g5c50fb6d.jar
fetch ch/obermuhlner/big-math/2.3.0 big-math-2.3.0.jar
# JavaFX classes used by the engine (StyledString, some utilities); the platform does not
# matter, as the engine never starts the JavaFX toolkit:
fetch org/openjfx/javafx-base/17.0.2 javafx-base-17.0.2-linux.jar
fetch org/openjfx/javafx-graphics/17.0.2 javafx-graphics-17.0.2-linux.jar
LIBS="$CP"
# The ANTLR tool, to generate the parsers (not needed at run time):
CP=""
fetch org/antlr/antlr4/4.11.1 antlr4-4.11.1-complete.jar
ANTLR="$CP"

rm -rf "$OUT"
mkdir -p "$OUT/src" "$OUT/classes"
for m in $MODULES; do
    python3 "$ROOT/scripts/golden/strip-annotations.py" "$REF/$m/src/main/java" "$OUT/src"
done
# Generate the Java parsers from the original grammars (lexers first, for their token
# vocabularies), then strip annotations from them too:
GRAMMARS="$REF/parsers/src/main/antlr"
GEN="$OUT/generated/xyz/columnal/grammar"
mkdir -p "$GEN"
( cd "$GRAMMARS" && \
  java -cp "$ANTLR" org.antlr.v4.Tool -package xyz.columnal.grammar -visitor -no-listener -o "$GEN" -Xexact-output-dir $(ls *Lexer*.g4) && \
  java -cp "$ANTLR" org.antlr.v4.Tool -package xyz.columnal.grammar -visitor -no-listener -lib "$GEN" -o "$GEN" -Xexact-output-dir $(ls *.g4 | grep -v Lexer) )
python3 "$ROOT/scripts/golden/strip-annotations.py" "$OUT/generated" "$OUT/src"
# Stand-ins for the annotation types whose constants the code uses (e.g. AbsRowIndex.ONE):
mkdir -p "$OUT/src/annotation/units"
for unit in RawInputLocation AbsRowIndex AbsColIndex CanonicalLocation DisplayLocation TableDataRowIndex TableDataColIndex; do
    printf 'package annotation.units;\npublic class %s\n{\n    public static final int ONE = 1;\n    public static final int ZERO = 0;\n}\n' "$unit" > "$OUT/src/annotation/units/$unit.java"
done
find "$OUT/src" -name "*.java" > "$OUT/sources.txt"
# Java 21 rejects the original's extra semicolon after some imports ("import ...;;"):
xargs perl -pi -e 's/^(import [^;]+);;\s*$/$1;\n/' < "$OUT/sources.txt"
javac -nowarn -encoding UTF-8 -proc:none -d "$OUT/classes" -cp "$LIBS" @"$OUT/sources.txt" 2>&1 | grep -v "^Note:" || true
[ -f "$OUT/classes/xyz/columnal/data/datatype/DataType.class" ] || { echo "Compilation failed" >&2; exit 1; }
# Resources (e.g. builtin_units.txt):
cp "$REF/data/src/main/resources/builtin_units.txt" "$OUT/classes/"
# The function details, which the Java build generated from the funcdoc XML with Saxon
# (scripts/golden/funcdoc.sh), loaded by FunctionDefinition as resource bundles:
cp "$ROOT"/test/engine/functions/golden/funcdoc/function_*_en.properties "$OUT/classes/"
echo "$OUT/classes:$LIBS" > "$OUT/classpath.txt"
echo "Built; classpath in $OUT/classpath.txt"
