// @vitest-environment jsdom
//
// The non-GUI halves of test.gui.PropFormat (tests-gui-format), which is a GUI test (Phase 11).
// Each Java test imports a file, then uses the import dialog to check and set the format; here a
// stand-in for the dialog (ImporterDialogs) makes the same choices directly.  The Java class is
// marked @Ignore ("TODO restore").
//
// jsdom provides the browser's DOMParser for the HTML importer.
//
// These tests found two Java bugs, which the port fixes: Utility.countLines counted a file's last
// line twice if it didn't end in a newline, so such a text file failed to import; and
// GenFormattedData wrote the characters U+2329 and U+232A as HTML 4's &lang; and &rang;, which
// HTML5 (and jsoup) read as other characters.
import { describe, test } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { DataSource } from "../../../src/engine/data/data/DataSource.js";
import { CleanDateColumnType, NumericColumnType, OrBlankColumnType } from "../../../src/engine/data/data/columntype/ColumnTypes.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { ColumnInfo } from "../../../src/engine/importers/importers/ColumnInfo.js";
import { GuessFormat } from "../../../src/engine/importers/importers/GuessFormat.js";
import { HTMLImporter } from "../../../src/engine/importers/importers/HTMLImporter.js";
import type { ImporterDialogs } from "../../../src/engine/importers/importers/ImporterDialogs.js";
import type { ImportPlainTable } from "../../../src/engine/importers/importers/ImportPlainTable.js";
import { TextImporter } from "../../../src/engine/importers/importers/TextImporter.js";
import { parseBigDecimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { Charset } from "../../../src/engine/java/JavaCharset.js";
import { JavaFile } from "../../../src/engine/java/JavaFile.js";
import { javaUtf8Bytes } from "../../../src/engine/java/JavaString.js";
import { Platform } from "../../../src/engine/java/Platform.js";
import { LocalDate } from "../../../src/engine/java/time/JavaTime.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { TaggedValue } from "../../../src/engine/utility/utility/TaggedValue.js";
import { UnitType } from "../../../src/engine/utility/utility/UnitType.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";
import { javaEncode } from "../../support/charsets.js";
import { assertEquals, assertNotNull } from "../../support/junit.js";
import { propertyTest } from "../../support/quickcheck.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";
import { GenFormattedData } from "../tests-gui-format/fixtures/gen/GenFormattedData.js";

const F = DateTimeInfo.F;

// Runs the dialogs' callbacks and the worker thread's tasks until there are none left:
function runAll(): void
{
    for (let i = 0; i < 10; i++)
    {
        Platform._test_runPending();
        Workers._test_yield();
    }
}

/**
 * Stands in for the dialogs: the import dialog is closed with OK straight away, after choose
 * (if given) has set up the import as the user would.
 */
function dialogs(choose: (imp: GuessFormat.Import<unknown, unknown>) => unknown): ImporterDialogs
{
    return {
        showImportChoices<SRC_FORMAT, FORMAT>(_suggestedName: string, importer: GuessFormat.Import<SRC_FORMAT, FORMAT>, then: (importInfo: GuessFormat.ImportInfo<FORMAT> | null) => void): void
        {
            then(new GuessFormat.ImportInfo<FORMAT>("Imported", choose(importer as GuessFormat.Import<unknown, unknown>) as FORMAT));
        },
        pickHTMLTable(_doc: Document, then: (tableIndex: number | null) => void): void
        {
            then(0);
        },
        pickRTables(tables, then): void
        {
            then(tables);
        },
        pickImporter(_src, _importers, then): void
        {
            then(null);
        },
    };
}

function writeDataToFile(formatAndData: GenFormattedData.FormatAndData): JavaFile
{
    const content = formatAndData.textContent.join("\n");
    return new JavaFile("/tmp/test.txt", javaEncode(content, formatAndData.format.initialTextFormat.charset));
}

function checkDataValues(formatAndData: GenFormattedData.FormatAndData, rs: RecordSet): void
{
    assertEquals("Column length, given intended trim " + formatAndData.format.trimChoice.toString() + " and source length " + formatAndData.textContent.length, formatAndData.loadedContent.length, rs.getLength());
    for (let i = 0; i < formatAndData.loadedContent.length; i++)
    {
        assertEquals("Right row length for row " + i + " (+" + formatAndData.format.trimChoice.trimFromTop + "):\n" + formatAndData.textContent[i + formatAndData.format.trimChoice.trimFromTop] + "\n" + Utility.listToString(formatAndData.loadedContent[i]!) + " guessed: " + "",
            formatAndData.loadedContent[i]!.length, rs.getColumns().length);
        for (let c = 0; c < rs.getColumns().length; c++)
        {
            const expected: Value = formatAndData.loadedContent[i]![c]!;
            const loaded: Value = rs.getColumns()[c]!.getType().getCollapsed(i);
            assertEquals("Column " + c + " expected: {{{" + String(expected) + "}}} was {{{" + String(loaded) + "}}} from row " + formatAndData.textContent[i + formatAndData.format.trimChoice.trimFromTop], 0, Utility.compareValues(expected, loaded));
        }
    }
}

// Java's testGuessFormatGUI, with the choices made in the dialog by the stand-in: the charset,
// separator and quote, and the trim, from the intended format.
async function testGuessFormatGUI(formatAndData: GenFormattedData.FormatAndData): Promise<void>
{
    const tempFile = writeDataToFile(formatAndData);

    const rsFuture = TextImporter._test_importTextFile(dialogs(imp => imp.loadDest(formatAndData.format.initialTextFormat, formatAndData.format.trimChoice).getFirst()), new DummyManager(), tempFile);
    runAll();
    const rs = await rsFuture;
    checkDataValues(formatAndData, rs);
}

describe("PropFormat (non-GUI)", () =>
{
    propertyTest("testGuessFormat", [new GenFormattedData()], (formatAndData: GenFormattedData.FormatAndData) =>
    {
        const content = formatAndData.textContent.join("\n");
        const format = GuessFormat.guessTextFormat(DummyManager.make().getTypeManager(), DummyManager.make().getUnitManager(), new Map([[formatAndData.format.initialTextFormat.charset, formatAndData.textContent]]), formatAndData.format.initialTextFormat, formatAndData.format.trimChoice);
        const ftf = GuessFormat.Import._test_getResultNoGUI(format);
        assertEquals("Failure with content: " + content + "\n\n", formatAndData.format, ftf);
        checkDataValues(formatAndData, TextImporter.makeRecordSet(DummyManager.make().getTypeManager(), writeDataToFile(formatAndData), ftf));

        const loaded: DataSource[] = [];
        const htmlFile = new JavaFile("/tmp/data123html", javaUtf8Bytes(formatAndData.htmlContent));
        const addToLoaded = (dataSources: readonly DataSource[]): void => { loaded.push(...dataSources); };
        // The dialog: turn off the whitespace-trimming, and set the trim (one less at the top, as
        // the header row of th cells gives the column names):
        const trim = formatAndData.format.trimChoice;
        const loadTable = HTMLImporter.importHTMLFile(dialogs(imp =>
        {
            const htmlImport = imp as unknown as HTMLImporter.HTMLImport;
            htmlImport.setOptions(false, htmlImport.removeWikipediaFootnotes.value);
            return (htmlImport as ImportPlainTable).loadDest(UnitType.UNIT, new GuessFormat.TrimChoice(trim.trimFromTop - 1, trim.trimFromBottom, trim.trimFromLeft, trim.trimFromRight)).getFirst();
        }), DummyManager.make(), htmlFile, new URL("file:///tmp/data123html"), CellPosition.ORIGIN, addToLoaded).getSecond();
        loadTable(0);
        runAll();
        assertNotNull(loaded[0]);
        checkDataValues(formatAndData, loaded[0]!.getData());
    }, { trials: 10 });

    test("testAwkwardDate", async () =>
    {
        const textRows = ["19/10/54", "30/12/34"];
        const target: Value[][] = [
            [DataTypeUtility.value(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY), LocalDate.of(1954, 10, 19))!],
            [DataTypeUtility.value(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY), LocalDate.of(2034, 12, 30))!],
        ];
        await testGuessFormatGUI(new GenFormattedData.FormatAndData(
            new GuessFormat.FinalTextFormat(new GuessFormat.InitialTextFormat(Charset.UTF_8, ",", null), new GuessFormat.TrimChoice(0, 0, 0, 0), [new ColumnInfo(new CleanDateColumnType(DateTimeInfo.DateTimeType.YEARMONTHDAY, true, DateTimeInfo.m(" ", F.DAY, F.MONTH_NUM, F.YEAR2), LocalDate.FROM), new ColumnId("A"))]),
                textRows, "<html><body><table><tr><td>" + textRows.join("</td></tr><tr><td>") + "</table>", target)
        );
    });

    test("testNumOrMissing", async () =>
    {
        const typeManager = new TypeManager(new UnitManager());
        const textRows = ["1", "3", "NA", "-8910.444", "NA"];
        const target: Value[][] = Utility.mapListI([
            new TaggedValue(1, DataTypeUtility.value(parseBigDecimal("1", false)), typeManager.getMaybeType()),
            new TaggedValue(1, DataTypeUtility.value(parseBigDecimal("3", false)), typeManager.getMaybeType()),
            new TaggedValue(0, null, typeManager.getMaybeType()),
            new TaggedValue(1, DataTypeUtility.value(parseBigDecimal("-8910.444", false)), typeManager.getMaybeType()),
            new TaggedValue(0, null, typeManager.getMaybeType()),
        ], v => [v]);

        await testGuessFormatGUI(new GenFormattedData.FormatAndData(
                new GuessFormat.FinalTextFormat(new GuessFormat.InitialTextFormat(Charset.UTF_8, ",", null), new GuessFormat.TrimChoice(0, 0, 0, 0), [new ColumnInfo(new OrBlankColumnType(new NumericColumnType(Unit.SCALAR, 0, null, null), "NA"), new ColumnId("A"))]),
                textRows, "<html><body><table><tr><td>" + textRows.join("</td></tr><tr><td>") + "</table>", target)
        );
    });
});
