#!/usr/bin/env bash
# Builds the ORIGINAL Columnal exporters, and the importers apart from their dialogs, on top of
# the engine built by build-columnal-jvm.sh, into reference/jvm/importers-classes, for the
# importers' golden harness (scripts/golden/importers.sh).
#   scripts/golden/build-importers-jvm.sh   (needs Java 17+)
# The importers module depends on the GUI modules, which aren't built, so the importer classes
# that only touch the GUI in their dialogs are compiled against small stand-ins for those GUI
# classes (ImportChoicesDialog, ImporterGUI, LabelledGrid and a few FXUtility methods).  The ones
# that build their own dialogs (HTMLImporter, RImporter, ClipboardUtils, the managers) are not
# compiled: the harness copies the parts of HTMLImporter it needs (see ImportersHarness.java).
# Downloads POI, jsoup and commons-text (and their dependencies) into reference/jars, checking
# their SHA-1s.  Prints the classpath for the harness to use.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="$ROOT/reference/columnal"
JARS="$ROOT/reference/jars"
OUT="$ROOT/reference/jvm/importers"
[ -f "$ROOT/reference/jvm/classes/xyz/columnal/transformations/TransformationManager.class" ] || "$ROOT/scripts/golden/build-columnal-jvm.sh"
BASE_CP="$(cat "$ROOT/reference/jvm/classpath.txt")"

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
# The versions the original used (settings.gradle), and POI's dependencies:
fetch org/apache/poi/poi/5.2.3 poi-5.2.3.jar
fetch org/apache/poi/poi-ooxml/5.2.3 poi-ooxml-5.2.3.jar
fetch org/apache/poi/poi-ooxml-lite/5.2.3 poi-ooxml-lite-5.2.3.jar
fetch org/apache/xmlbeans/xmlbeans/5.1.1 xmlbeans-5.1.1.jar
fetch org/apache/commons/commons-compress/1.21 commons-compress-1.21.jar
fetch org/apache/commons/commons-collections4/4.4 commons-collections4-4.4.jar
fetch org/apache/commons/commons-math3/3.6.1 commons-math3-3.6.1.jar
fetch commons-codec/commons-codec/1.15 commons-codec-1.15.jar
fetch com/zaxxer/SparseBitSet/1.2 SparseBitSet-1.2.jar
fetch com/github/virtuald/curvesapi/1.07 curvesapi-1.07.jar
fetch org/jsoup/jsoup/1.15.3 jsoup-1.15.3.jar
fetch org/apache/commons/commons-text/1.10.0 commons-text-1.10.0.jar
EXTRA="$CP"

rm -rf "$OUT"
mkdir -p "$OUT/src" "$OUT/classes"
SRC="$REF/importers/src/main/java/xyz/columnal/importers"
mkdir -p "$OUT/orig/xyz/columnal/importers" "$OUT/orig/xyz/columnal/exporters" "$OUT/orig/xyz/columnal/gui/grid"
for f in ChoiceDetails ColumnInfo DateFormat ExcelImporter Format GuessFormat Importer ImporterUtility ImportPlainTable TextImporter; do
    cp "$SRC/$f.java" "$OUT/orig/xyz/columnal/importers/"
done
for f in CSVExporter ExcelExporter Exporter HTMLExporter RExporter; do
    cp "$REF/exporters/src/main/java/xyz/columnal/exporters/$f.java" "$OUT/orig/xyz/columnal/exporters/"
done
# HTMLImporter's table reading uses GridAreaCellPosition, from the GUI module stf (it uses no GUI classes):
cp "$REF/stf/src/main/java/xyz/columnal/gui/grid/GridAreaCellPosition.java" "$OUT/orig/xyz/columnal/gui/grid/"
python3 "$ROOT/scripts/golden/strip-annotations.py" "$OUT/orig" "$OUT/src"
mkdir -p "$OUT/src/annotation/units"
for unit in GridAreaRowIndex GridAreaColIndex; do
    printf 'package annotation.units;\npublic class %s\n{\n    public static final int ONE = 1;\n    public static final int ZERO = 0;\n}\n' "$unit" > "$OUT/src/annotation/units/$unit.java"
done

# Stand-ins for the GUI classes that the importers mention (only in their dialogs, which the harness
# doesn't show).  The import dialog stand-in records the import it was given, without showing anything:
mkdir -p "$OUT/src/xyz/columnal/importers/gui" "$OUT/src/xyz/columnal/utility/gui"
cat > "$OUT/src/xyz/columnal/importers/gui/ImportChoicesDialog.java" <<'JAVA'
package xyz.columnal.importers.gui;
import java.util.Optional;
import xyz.columnal.importers.GuessFormat.Import;
import xyz.columnal.importers.GuessFormat.ImportInfo;
public class ImportChoicesDialog<SRC_FORMAT, FORMAT>
{
    public static Import<?, ?> lastImport;
    public ImportChoicesDialog(javafx.stage.Window parentWindow, String suggestedName, Import<SRC_FORMAT, FORMAT> importer)
    {
        lastImport = importer;
    }
    public Optional<ImportInfo<FORMAT>> showAndWait()
    {
        return Optional.empty();
    }
}
JAVA
cat > "$OUT/src/xyz/columnal/importers/gui/ImporterGUI.java" <<'JAVA'
package xyz.columnal.importers.gui;
public class ImporterGUI
{
    public static <C> xyz.columnal.utility.gui.LabelledGrid.Row makeGUI(xyz.columnal.importers.ChoiceDetails<C> choiceDetails, javafx.beans.property.ObjectProperty<C> currentChoice)
    {
        throw new UnsupportedOperationException();
    }
}
JAVA
cat > "$OUT/src/xyz/columnal/utility/gui/LabelledGrid.java" <<'JAVA'
package xyz.columnal.utility.gui;
public class LabelledGrid extends javafx.scene.layout.Pane
{
    public static class Row {}
    public LabelledGrid(Row... rows) {}
    public void addRow(Row row) {}
    public static Row labelledGridRow(String labelKey, String helpId, javafx.scene.Node node) { return new Row(); }
}
JAVA
cat > "$OUT/src/xyz/columnal/utility/gui/FXUtility.java" <<'JAVA'
package xyz.columnal.utility.gui;
public class FXUtility
{
    public static void alertOnError_(String title, xyz.columnal.log.ErrorHandler.RunOrError r)
    {
        xyz.columnal.log.ErrorHandler.getErrorHandler().alertOnError_(title, r);
    }
    public static <T> void addChangeListenerPlatform(javafx.beans.value.ObservableValue<T> property, xyz.columnal.utility.function.fx.FXPlatformConsumer<? super T> listener)
    {
        property.addListener((a, b, newVal) -> listener.consume(newVal));
    }
    public static void logAndShowError(String actionKey, Exception ex)
    {
        xyz.columnal.log.Log.log(ex);
    }
}
JAVA

find "$OUT/src" -name "*.java" > "$OUT/sources.txt"
xargs perl -pi -e 's/^(import [^;]+);;\s*$/$1;\n/' < "$OUT/sources.txt"
javac -nowarn -encoding UTF-8 -proc:none -d "$OUT/classes" -cp "$BASE_CP:$EXTRA" @"$OUT/sources.txt" 2>&1 | grep -v "^Note:" || true
[ -f "$OUT/classes/xyz/columnal/importers/GuessFormat.class" ] && [ -f "$OUT/classes/xyz/columnal/exporters/ExcelExporter.class" ] || { echo "Compilation failed" >&2; exit 1; }
# The stand-in FXUtility must come before the engine build's own stand-in:
echo "$OUT/classes:$BASE_CP:$EXTRA" > "$OUT/classpath.txt"
echo "Built; classpath in $OUT/classpath.txt"
