// Tests for Java bugs in the importers and exporters that the port fixes (each marked with a
// PORT-NOTE in the source).
// @vitest-environment jsdom
//
// The time zone is Europe/London (as in ImportersGolden.test.ts), as the Excel exporter uses it.
process.env.TZ = "Europe/London";

import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryTemporalColumn } from "../../../src/engine/data/data/MemoryTemporalColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { CSVExporter } from "../../../src/engine/exporters/exporters/CSVExporter.js";
import { ExcelExporter } from "../../../src/engine/exporters/exporters/ExcelExporter.js";
import { HTMLExporter } from "../../../src/engine/exporters/exporters/HTMLExporter.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { LocalDate, LocalDateTime } from "../../../src/engine/java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../src/engine/java/time/TemporalAccessor.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { ExcelImporter } from "../../../src/engine/importers/importers/ExcelImporter.js";
import { GuessFormat } from "../../../src/engine/importers/importers/GuessFormat.js";
import { HTMLImporter } from "../../../src/engine/importers/importers/HTMLImporter.js";
import { ImporterUtility } from "../../../src/engine/importers/importers/ImporterUtility.js";
import { TextImporter } from "../../../src/engine/importers/importers/TextImporter.js";
import { JavaFile } from "../../../src/engine/java/JavaFile.js";
import { javaUtf8Bytes } from "../../../src/engine/java/JavaString.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { UnitType } from "../../../src/engine/utility/utility/UnitType.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";

// Guesses the format of a text file and imports it, as the import dialog does when OK is clicked
function importText(content: string): RecordSet
{
    const mgr = DummyManager.make();
    const file = new JavaFile("/tmp/import.csv", javaUtf8Bytes(content));
    const format = GuessFormat.Import._test_getResultNoGUI(GuessFormat.guessTextFormat(mgr.getTypeManager(), mgr.getUnitManager(), TextImporter.getInitial(file), null, null));
    return TextImporter.makeRecordSet(mgr.getTypeManager(), file, format);
}

// Each column's type, and its values as text
function contents(rs: RecordSet): string[]
{
    return rs.getColumns().map(c => c.getName().getRaw() + ": " + c.getType().getType().toString() + " = " + Array.from({ length: rs.getLength() }, (_v, i) => DataTypeUtility.valueToString(c.getType().getCollapsed(i))).join(", "));
}

describe("Java bug fixes", () =>
{
    // Java's Utility.countLines counted a last line without a newline twice, so a text file that
    // didn't end with a newline failed to import.
    test("text file without a final newline", () =>
    {
        expect(contents(importText("Name,Amount\nA,1\nB,2"))).toEqual(contents(importText("Name,Amount\nA,1\nB,2\n")));
        expect(contents(importText("Name,Amount\r\nA,1\r\nB,2"))).toEqual(["Name: Text = \"A\", \"B\"", "Amount: Number = 1, 2"]);
    });

    // Java's TextImporter had no case for a boolean column, so such a file failed to import.
    test("text file with a boolean column", () =>
    {
        expect(contents(importText("Name,Done\nA,true\nB,false\nC,TRUE\n"))).toEqual(["Name: Text = \"A\", \"B\", \"C\"", "Done: Boolean = true, false, true"]);
    });

    // Java gave each column of an HTML or Excel table the name in its header, so a table with two
    // columns of the same name failed to import ("Duplicate column names found").
    test("HTML table with repeated column names", () =>
    {
        const doc = new DOMParser().parseFromString("<table><tr><th>X</th><th>X</th><th>Y</th></tr><tr><td>1</td><td>a</td><td>2</td></tr></table>", "text/html");
        const read = HTMLImporter.readTable(doc.querySelector("table")!);
        const vals = read.getFirst();
        ImporterUtility.rectangulariseAndRemoveBlankRows(vals);
        const imp = HTMLImporter.makeImport(DummyManager.make(), vals, read.getSecond(), false);
        expect(contents(imp.loadSource(UnitType.UNIT).recordSet).map(c => c.split(":")[0])).toEqual(["X", "X 1", "Y"]);
        expect(contents(imp.loadDest(UnitType.UNIT, imp.loadSource(UnitType.UNIT).trimChoice).getSecond())).toEqual(["X: Number = 1", "X 1: Text = \"a\"", "Y: Number = 2"]);
    });

    test("Excel table with repeated column names", () =>
    {
        const imp = ExcelImporter.makeImport(DummyManager.make(), [["X", "X"], ["1", "2"]]);
        expect(contents(imp.loadDest(UnitType.UNIT, imp.loadSource(UnitType.UNIT).trimChoice).getSecond())).toEqual(["X: Number = 1", "X 1: Number = 2"]);
    });

    // A table with a text column (with a quote in a value) and a number column with an invalid
    // value (text entered which isn't a number):
    function tableWithQuoteAndInvalid(): Table
    {
        const mgr = DummyManager.make();
        return mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T"), null, null, null), new EditableRecordSet([
            rs => new MemoryStringColumn(rs, new ColumnId("Name"), [Either.right("say \"hi\""), Either.right("plain")], ""),
            rs => new MemoryNumericColumn(rs, new ColumnId("Amount"), new NumberInfo(Unit.SCALAR), [Either.right<string, Decimal>(new Decimal(5)), Either.left<string, Decimal>("n/a")], ZERO),
        ], () => 2)));
    }

    // Java's CSVExporter tripled each quote, where CSV doubles them, so a text value (which is
    // written with quotes around it, and ^q for a quote within it) was read back with two quotes
    // each side; and the CSV and HTML exporters failed on a table with an invalid value.
    test("CSV export of quotes and invalid values", () =>
    {
        expect(new TextDecoder().decode(new CSVExporter().exportData(tableWithQuoteAndInvalid()))).toBe("\"Name\",\"Amount\"\n\"\"\"say ^qhi^q\"\"\",\"5\"\n\"\"\"plain\"\"\",\"n/a\"\n");
    });

    test("HTML export of invalid values", () =>
    {
        const html = new TextDecoder().decode(new HTMLExporter().exportData(tableWithQuoteAndInvalid()));
        expect(html).toContain("<tr>\n<td>plain</td>\n<td>n/a</td>\n</tr>");
    });

    // Java named the Excel column after Z "BA" (not "AA"), and so on, and names repeated after 676
    // columns.
    test("Excel column names after Z", () =>
    {
        expect([25, 26, 52, 676, 702].map(i => ExcelImporter.excelColumnName(i).getRaw())).toEqual(["Z", "AA", "BA", "ZA", "AAA"]);
    });

    // Java offered .xls files for import but couldn't read them (an uncaught exception).
    test("Excel .xls files", () =>
    {
        const sheet = XLSX.utils.aoa_to_sheet([["Name", "Amount", "When"], ["a", 1.5, new Date(Date.UTC(2020, 0, 2))], ["b", -3, new Date(Date.UTC(1999, 11, 31))]], { cellDates: true, dateNF: "yyyy-mm-dd" });
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
        const read = (bookType: XLSX.BookType): string[][] => new ExcelImporter().readFirstSheet(new JavaFile("/tmp/book." + bookType, new Uint8Array(XLSX.write(book, { type: "array", bookType }) as ArrayBuffer)));
        expect(read("biff8")).toEqual(read("xlsx"));
        expect(read("biff8")[1]).toEqual(["a", "1.5", "2020-01-02"]);
        // A file which isn't a spreadsheet can't be read, as other broken spreadsheets can't:
        expect(() => new ExcelImporter().readFirstSheet(new JavaFile("/tmp/not.xls", javaUtf8Bytes("Not a spreadsheet\n")))).toThrow(ExcelImporter.InvalidFormatException);
    });

    // Java formatted the numbers in an Excel file with "%f" (six decimal places), losing any beyond
    // six and adding trailing zeros (which made the column's guessed display six decimal places).
    test("Excel numbers in full", () =>
    {
        const sheet = XLSX.utils.aoa_to_sheet([["Small", "Amount"], [0.0000001, 1.5], [0.123456789, 2]]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
        const vals = new ExcelImporter().readFirstSheet(new JavaFile("/tmp/book.xlsx", new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer)));
        expect(vals).toEqual([["Small", "Amount"], ["0.0000001", "1.5"], ["0.123456789", "2"]]);
        const imp = ExcelImporter.makeImport(DummyManager.make(), vals);
        expect(contents(imp.loadDest(UnitType.UNIT, imp.loadSource(UnitType.UNIT).trimChoice).getSecond())).toEqual(["Small: Number = 0.0000001, 0.123456789", "Amount: Number = 1.5, 2"]);
    });

    // Java's ExcelExporter took a date and time as UTC and wrote it in the system time zone (so in
    // British summer time it was an hour late), and wrote a date before 1900 as -1.
    test("Excel export of dates and times", () =>
    {
        const mgr = DummyManager.make();
        const table = mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T"), null, null, null), new EditableRecordSet([
            rs => new MemoryTemporalColumn(rs, new ColumnId("When"), new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME), [Either.right<string, TemporalAccessor>(LocalDateTime.of(2020, 7, 1, 12, 0)), Either.right<string, TemporalAccessor>(LocalDateTime.of(1850, 1, 1, 9, 30))], LocalDateTime.of(2000, 1, 1, 0, 0)),
            rs => new MemoryTemporalColumn(rs, new ColumnId("Day"), new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY), [Either.right<string, TemporalAccessor>(LocalDate.of(2020, 7, 1)), Either.right<string, TemporalAccessor>(LocalDate.of(1850, 1, 1))], LocalDate.of(2000, 1, 1)),
        ], () => 2)));
        const sheet = XLSX.read(new ExcelExporter().exportData(table), { type: "array" }).Sheets["Sheet0"]!;
        // 1 July 2020 is Excel's day 44013:
        expect([sheet["A2"]!.v, sheet["B2"]!.v]).toEqual([44013.5, 44013]);
        expect([sheet["A3"]!.v, sheet["B3"]!.v]).toEqual(["1850-01-01 09:30:00", "1850-01-01"]);
    });

    // Java's GuessFormat tested whether the length of a value was a digit, where it meant its last
    // character, so a number column where some values lacked the common suffix was text.
    test("number column with a suffix on some values", () =>
    {
        expect(contents(importText("Name,Amount\nA,1\nB,5%\nC,6%\nD,7\nE,12%\n"))).toEqual(["Name: Text = \"A\", \"B\", \"C\", \"D\", \"E\"", "Amount: Number = 1, 5, 6, 7, 12"]);
    });
});
