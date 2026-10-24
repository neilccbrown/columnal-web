// Tests of the importers' parts that have no Java test (the rest are checked against the original
// Java in ImportersGolden.test.ts): copying values to the clipboard and back, the R importer's
// placement of several tables, the importer manager's choice of importer, and ExcelImporter's
// column names and number formatting.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { DataSource } from "../../../src/engine/data/data/DataSource.js";
import { ExcelImporter } from "../../../src/engine/importers/importers/ExcelImporter.js";
import type { Importer } from "../../../src/engine/importers/importers/Importer.js";
import type { ImporterDialogs } from "../../../src/engine/importers/importers/ImporterDialogs.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import { ImporterManager } from "../../../src/engine/importers/importers/manager/ImporterManager.js";
import { RImporter } from "../../../src/engine/importers/importers/RImporter.js";
import { TextImporter } from "../../../src/engine/importers/importers/TextImporter.js";
import { JavaFile } from "../../../src/engine/java/JavaFile.js";
import { Platform } from "../../../src/engine/java/Platform.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";
import { assertEquals } from "../../support/junit.js";
import { checkProperty } from "../../support/quickcheck.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";
import { GenImmediateData } from "../tests-tables/fixtures/gen/GenImmediateData.js";

const R_RESOURCES = join(dirname(fileURLToPath(import.meta.url)), "..", "tests-gui-r", "importExport", "resources");

function runAll(): void
{
    for (let i = 0; i < 10; i++)
    {
        Platform._test_runPending();
        Workers._test_yield();
    }
}

function dialogs(overrides: Partial<ImporterDialogs>): ImporterDialogs
{
    return {
        showImportChoices: (_n, _i, then) => then(null),
        pickHTMLTable: (_d, then) => then(null),
        pickRTables: (tables, then) => then(tables),
        pickImporter: (_s, _i, then) => then(null),
        ...overrides,
    };
}

afterEach(() => runAll());

describe("ClipboardUtils", () =>
{
    test("copy and paste back", async () =>
    {
        await checkProperty([new GenImmediateData({ numTables: { minTables: 1, maxTables: 1 } })], (data: GenImmediateData.ImmediateData_Mgr) =>
        {
            const rs = data.data[0]!.getData();
            const columns = rs.getColumns().map(c => new Pair(c.getName(), c.getType()));
            let copied: ReadonlyMap<string, string> | null = null;
            let completed: boolean | null = null;
            const length = rs.getLength();
            ClipboardUtils.copyValuesToClipboard(data.mgr.getUnitManager(), data.mgr.getTypeManager(), columns, () => new ClipboardUtils.RowRange(0, length - 1), c => { copied = c; }, b => { completed = b; });
            runAll();
            expect(completed).toBe(true);
            const content = copied! as ReadonlyMap<string, string>;
            const loaded = ClipboardUtils.loadValuesFromClipboard(data.mgr.getTypeManager(), content.get(ClipboardUtils.DATA_FORMAT)!)!;
            assertEquals(columns.length, loaded.length);
            const plainRows: string[] = [];
            for (let row = 0; row < length; row++)
                plainRows.push(columns.map(c => DataTypeUtility.valueToString(c.getSecond().getCollapsed(row))).join(", "));
            assertEquals(plainRows.join("\n"), content.get(ClipboardUtils.PLAIN_TEXT));
            for (let c = 0; c < columns.length; c++)
            {
                assertEquals(columns[c]!.getFirst(), loaded[c]!.columnName);
                assertEquals(columns[c]!.getSecond().getType(), loaded[c]!.dataType);
                assertEquals(length, loaded[c]!.dataValues.length);
                for (let row = 0; row < length; row++)
                    assertEquals(DataTypeUtility.valueToString(columns[c]!.getSecond().getCollapsed(row)), DataTypeUtility.valueToString(loaded[c]!.dataValues[row]!.either(s => { throw new Error(s); }, v => v)));
            }
        }, { trials: 20 });
    });

    test("nothing to copy", () =>
    {
        let completed: boolean | null = null;
        ClipboardUtils.copyValuesToClipboard(DummyManager.make().getUnitManager(), DummyManager.make().getTypeManager(), [], () => new ClipboardUtils.RowRange(0, 0), () => { throw new Error("Should not copy"); }, b => { completed = b; });
        expect(completed).toBe(false);
    });

    test("not copied from Columnal", () =>
    {
        expect(ClipboardUtils.loadValuesFromClipboard(DummyManager.make().getTypeManager(), null)).toBeNull();
        // A UserException is shown (here, logged), and nothing is pasted:
        expect(ClipboardUtils.loadValuesFromClipboard(DummyManager.make().getTypeManager(), "COLUMNAL\nVERSION 1\n")).toBeNull();
    });
});

describe("RImporter", () =>
{
    const importR = (fileName: string, pick: ImporterDialogs["pickRTables"]): DataSource[] =>
    {
        const loaded: DataSource[] = [];
        new RImporter().importFile(dialogs({ pickRTables: pick }), DummyManager.make(), CellPosition.ORIGIN.offsetByRowCols(1, 2), new JavaFile("/" + fileName, new Uint8Array(readFileSync(join(R_RESOURCES, fileName)))), new URL("file:///" + fileName), ds => loaded.push(ds));
        runAll();
        return loaded;
    };

    test("one table", () =>
    {
        const loaded = importR("mtcars.rds", () => { throw new Error("Should not ask"); });
        expect(loaded.length).toBe(1);
        expect(loaded[0]!._test_getPrevPosition()).toEqual(CellPosition.ORIGIN.offsetByRowCols(1, 2));
    });

    test("several tables, side by side", () =>
    {
        let offered: readonly string[] = [];
        const loaded = importR("df-df2.Rdata", (tables, then) =>
        {
            offered = tables.map(t => t.getFirst());
            then(tables);
        });
        expect(offered.length).toBeGreaterThan(1);
        expect(loaded.map(t => t.getId().getRaw())).toEqual(offered);
        // Each table is placed to the right of the previous one, with a blank column between:
        let column = 2;
        for (const t of loaded)
        {
            expect(t._test_getPrevPosition()).toEqual(CellPosition.ORIGIN.offsetByRowCols(1, column));
            column += t.getData().getColumns().length + 1;
        }
    });

    test("several tables, cancelled", () =>
    {
        expect(importR("df-df2.Rdata", (_tables, then) => then(null))).toEqual([]);
    });
});

describe("ImporterManager", () =>
{
    test("picks the importer by extension", () =>
    {
        const used: string[] = [];
        const fake = (name: string, exts: string[]): Importer => ({
            getSupportedFileTypes: () => exts,
            getName: () => name,
            importFile: () => { used.push(name); },
        });
        const manager = new (ImporterManager as unknown as new () => ImporterManager)();
        manager.registerImporter(fake("text", ["*.txt", "*.csv"]));
        manager.registerImporter(fake("html", ["*.html"]));
        let asked = false;
        const d = dialogs({ pickImporter: (_s, importers, then) => { asked = true; then(importers[1]!); } });
        manager.importFile(d, DummyManager.make(), CellPosition.ORIGIN, new JavaFile("/a/b.csv"), new URL("file:///a/b.csv"), () => {});
        manager.importFile(d, DummyManager.make(), CellPosition.ORIGIN, new JavaFile("/a/b.HTML"), new URL("file:///a/b.HTML"), () => {});
        expect(used).toEqual(["text", "html"]);
        expect(asked).toBe(true);
        expect(manager.guessImporterFromFileExtension("HTML")!.getName()).toBe("html");
        expect(manager.guessImporterFromFileExtension("xyz")).toBeNull();
    });

    test("checkURL", () =>
    {
        expect(ImporterManager.checkURL("https://example.com/x.csv").either(e => e, u => u.href)).toBe("https://example.com/x.csv");
        expect(ImporterManager.checkURL("example.com/x.csv").either(e => e, u => u.href)).toBe("http://example.com/x.csv");
        expect(ImporterManager.checkURL("").isLeft()).toBe(true);
    });
});

describe("ExcelImporter", () =>
{
    test("excelColumnName", () =>
    {
        expect([0, 1, 25, 26, 27, 51, 52, 675, 676, 677].map(i => ExcelImporter.excelColumnName(i).getRaw()))
            // As in Java (wrong after Z, so index 676 gets the same name as 26):
            .toEqual(["A", "B", "Z", "BA", "BB", "BZ", "CA", "ZZ", "BA", "BB"]);
    });

    test("formatF", () =>
    {
        // Java's String.format("%f", d):
        expect([0, 1, -1, 3.14159265, 0.0000005, 0.0000004, 2.5e-7, 123456789.12345679, 1e20, -0.0000001, 0.1 + 0.2].map(d => ExcelImporter.formatF(d)))
            .toEqual(["0.000000", "1.000000", "-1.000000", "3.141593", "0.000001", "0.000000", "0.000000", "123456789.123457", "100000000000000000000.000000", "-0.000000", "0.300000"]);
    });

    test("an empty text file can't be imported", () =>
    {
        // As in Java, loadDest fails (see the PORT-NOTE in GuessFormat):
        let failed = false;
        TextImporter.importTextFile(dialogs({ showImportChoices: (_n, imp, then) =>
        {
            try
            {
                imp.loadDest(imp.currentSrcFormat().get()!, imp.loadSource(imp.currentSrcFormat().get()!).trimChoice);
            }
            catch (_e)
            {
                failed = true;
            }
            then(null);
        } }), DummyManager.make(), new JavaFile("/empty.txt", new Uint8Array()), CellPosition.ORIGIN, () => {});
        runAll();
        expect(failed).toBe(true);
    });
});
