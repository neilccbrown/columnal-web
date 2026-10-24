// @vitest-environment jsdom
//
// Checks the importers and exporters against the original Java.  Each input in golden/ (generated
// by the port: text, HTML and Excel files, saved files, and the port's Excel exports of those) was
// imported or exported by the original classes in scripts/golden/importers.sh (ImportersHarness.java),
// which wrote what they did to java-*.txt.  The port must do the same.
//
// The port fixes some of the Java's bugs (see KNOWN_DIFFERENCES), so for the inputs they affect the
// port's output is checked against golden/port-*.txt instead: the port's output, each difference
// from java-*.txt reviewed as coming from the fixes.  With DUMP_PORT_OUTPUT=<dir>, the port's output
// for every input is written to <dir>/port-*.txt (to update those files after reviewing).
//
// With GENERATE_IMPORTER_INPUTS=1, this instead generates the input files (as importers.sh does).
//
// The time zone is Europe/London, as in importers.sh, as the Excel exporter uses it for dates.
// jsdom provides the browser's DOMParser for the HTML importer.
process.env.TZ = "Europe/London";

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import type { ColumnType } from "../../../src/engine/data/data/columntype/ColumnType.js";
import { CleanDateColumnType } from "../../../src/engine/data/data/columntype/ColumnTypes.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { CSVExporter } from "../../../src/engine/exporters/exporters/CSVExporter.js";
import { ExcelExporter } from "../../../src/engine/exporters/exporters/ExcelExporter.js";
import { HTMLExporter } from "../../../src/engine/exporters/exporters/HTMLExporter.js";
import type { ColumnInfo } from "../../../src/engine/importers/importers/ColumnInfo.js";
import { ExcelImporter } from "../../../src/engine/importers/importers/ExcelImporter.js";
import { GuessFormat } from "../../../src/engine/importers/importers/GuessFormat.js";
import { HTMLImporter } from "../../../src/engine/importers/importers/HTMLImporter.js";
import { ImporterUtility } from "../../../src/engine/importers/importers/ImporterUtility.js";
import { ImportPlainTable } from "../../../src/engine/importers/importers/ImportPlainTable.js";
import { TextImporter } from "../../../src/engine/importers/importers/TextImporter.js";
import { Charset } from "../../../src/engine/java/JavaCharset.js";
import { JavaFile } from "../../../src/engine/java/JavaFile.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { jsoupParse } from "../../../src/engine/java/Jsoup.js";
import { LocalDate, LocalTime } from "../../../src/engine/java/time/JavaTime.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { OutputBuilder } from "../../../src/engine/types/loadsave/OutputBuilder.js";
import type { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import { UnitType } from "../../../src/engine/utility/utility/UnitType.js";
import { canEncode, javaEncode } from "../../support/charsets.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";

// (jsdom replaces the URL class, which fileURLToPath doesn't accept, so this works from the path)
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "golden") + "/";
const DATA_GOLDEN = join(HERE, "..", "data", "golden", "rec") + "/";
const MAX_ROWS = 60;

// Inputs where the port's output differs from Java's because of the Java bugs it fixes (numbered as
// in PLAN.md, Phase 6): 1, a text file's last line without a newline counted twice; 2, a boolean
// column in a text file; 3, repeated column names in an HTML or Excel table; 4, CSV export tripling
// quotes; 5, CSV and HTML export failing on an invalid value; 7, an unreadable Excel file (here,
// not a spreadsheet at all) giving an uncaught exception; 10, Excel numbers formatted with "%f".
const KNOWN_DIFFERENCES = new Map<string, string>([
    ["html-01.html", "3"],
    ["html-02.html", "3"],
    ["html-06.html", "3"],
    ["html-08-wiki.html", "3"],
    ["html-10.html", "3"],
    ["html-14.html", "3"],
    ["html-15.html", "3"],
    ["html-16-wiki.html", "3"],
    ["rec-01.rec", "4, 10"],
    ["rec-02.rec", "5, 10"],
    ["rec-03.rec", "5, 10"],
    ["rec-04.rec", "5, 10"],
    ["rec-05.rec", "4, 10"],
    ["rec-06.rec", "5, 10"],
    ["txt-01.txt", "1"],
    ["txt-03.txt", "1"],
    ["txt-06.txt", "1"],
    ["txt-08.txt", "1"],
    ["txt-10.txt", "1"],
    ["txt-11.txt", "1"],
    ["txt-12.txt", "1"],
    ["txt-14.txt", "1"],
    ["txt-15.txt", "1"],
    ["txt-16.txt", "1"],
    ["txt-17.txt", "1"],
    ["txt-18.txt", "1"],
    ["txt-20.txt", "1"],
    ["txt-23.txt", "2"],
    ["txt-24.txt", "1"],
    ["txt-27.txt", "1"],
    ["txt-30.txt", "1"],
    ["txt-31.txt", "2"],
    ["txt-33.txt", "1"],
    ["txt-34.txt", "1"],
    ["txt-35.txt", "1"],
    ["txt-37.txt", "1"],
    ["txt-38.txt", "1"],
    ["txt-39.txt", "1"],
    ["xlsx-02.xlsx", "10"],
    ["xlsx-03.xlsx", "10"],
    ["xlsx-04.xlsx", "10"],
    ["xlsx-05.xlsx", "10"],
    ["xlsx-06.xlsx", "10"],
    ["xlsx-07.xlsx", "3, 10"],
    ["xlsx-08.xlsx", "3, 10"],
    ["xlsx-09.xlsx", "10"],
    ["xlsx-10.xlsx", "10"],
    ["xlsx-11.xlsx", "10"],
    ["xlsx-12.xlsx", "10"],
    ["xlsx-notxml.xlsx", "7"],
    ["xlsx-port-rec-01-Test_0.xlsx", "10"],
    ["xlsx-port-rec-03-Test_0.xlsx", "10"],
    ["xlsx-port-rec-05-Test_0.xlsx", "10"],
]);
const TEXT_COUNT = 40;
const HTML_COUNT = 16;
const EXCEL_COUNT = 12;
const REC_COUNT = 6;

const describeError = (e: unknown): string =>
{
    if (!(e instanceof Error))
        throw e;
    return e.name + ": " + e.message;
};

// The output of ImportersHarness.java for one input:
class Dump
{
    public out = "";

    public line(s: string): void
    {
        this.out += s + "\n";
    }

    public dumpRecordSet(rs: RecordSet): void
    {
        this.line("  columns " + rs.getColumns().map(c => c.getName().getRaw()).join("|"));
        let types = "";
        for (const c of rs.getColumns())
        {
            try
            {
                const b = new OutputBuilder();
                c.getType().getType().save(b);
                types += " " + b.toString().trim();
            }
            catch (_e)
            {
                types += " ERROR";
            }
        }
        this.line("  types" + types);
        let length: number;
        try
        {
            length = rs.getLength();
        }
        catch (e)
        {
            this.line("  length EXCEPTION " + describeError(e));
            return;
        }
        this.line("  length " + length);
        for (let i = 0; i < Math.min(length, MAX_ROWS); i++)
        {
            const values: string[] = [];
            for (const c of rs.getColumns())
            {
                try
                {
                    values.push(DataTypeUtility.valueToString(c.getType().getCollapsed(i)));
                }
                catch (e)
                {
                    if (e instanceof InvalidImmediateValueException)
                        values.push("INVALID " + e.getInvalid());
                    else if (e instanceof Error)
                        values.push("ERROR " + e.name);
                    else
                        throw e;
                }
            }
            this.line("  " + values.join(" | "));
        }
    }

    // Loads the source, then the destination with the source's trim, dumping both; returns the destination format.
    public loadSourceAndDest<S, D>(imp: GuessFormat.Import<S, D>, srcFormat: S): D | null
    {
        let src: GuessFormat.Import.SrcDetails;
        try
        {
            src = imp.loadSource(srcFormat);
        }
        catch (e)
        {
            this.line("source EXCEPTION " + describeError(e));
            return null;
        }
        this.line("source trim " + src.trimChoice.toString() + " names " + (src.columnNameOverrides === null ? "null" : "[" + src.columnNameOverrides.join(", ") + "]"));
        this.dumpRecordSet(src.recordSet);
        let dest: Pair<D, RecordSet>;
        try
        {
            dest = imp.loadDest(srcFormat, src.trimChoice);
        }
        catch (e)
        {
            this.line("dest EXCEPTION " + describeError(e));
            return null;
        }
        const format = dest.getFirst();
        if (format instanceof GuessFormat.FinalTextFormat)
        {
            this.line("dest " + format.initialTextFormat.toString() + " " + format.trimChoice.toString());
            this.describeColumns(format.columnTypes);
        }
        else if (format instanceof ImportPlainTable.PlainImportInfo)
        {
            this.line("dest " + format.trim.toString());
            this.describeColumns(format.columnInfo);
        }
        this.dumpRecordSet(dest.getSecond());
        return format;
    }

    private describeColumns(columns: readonly ColumnInfo[]): void
    {
        for (const c of columns)
            this.line("  column " + c.title.getRaw() + ": " + describeType(c.type));
    }
}

// As ImportersHarness.describeType: a date column's formatter is given as its position in the flexible formatters.
function describeType(type: ColumnType): string
{
    if (type instanceof CleanDateColumnType)
    {
        const s = type.toString();
        const rest = s.substring(s.lastIndexOf("\"") + 2);
        const formatters = type.getDateTimeInfo().getFlexibleFormatters().flatMap(l => l);
        const index = formatters.findIndex(f => f.toString() === type.getDateTimeFormatter().toString());
        return "CleanDate #" + index + " " + rest;
    }
    return type.toString();
}

function escape(s: string): string
{
    return s.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t").replaceAll("|", "\\|");
}

function makeManager(): TableManager
{
    return new DummyManager();
}

function text(d: Dump, file: JavaFile): void
{
    const mgr = makeManager();
    const typeManager = mgr.getTypeManager();
    const imp = GuessFormat.guessTextFormat(typeManager, mgr.getUnitManager(), TextImporter.getInitial(file), null, null);
    const srcFormat = imp.currentSrcFormat().get();
    d.line("guessed " + (srcFormat === null ? "null" : srcFormat.toString()));
    if (srcFormat === null)
        return;
    const dest = d.loadSourceAndDest(imp, srcFormat);
    if (dest === null)
        return;
    d.line("text file:");
    try
    {
        d.dumpRecordSet(TextImporter.makeRecordSet(typeManager, file, dest));
    }
    catch (e)
    {
        d.line("EXCEPTION " + describeError(e));
    }
}

function html(d: Dump, file: JavaFile, fromWikipedia: boolean): void
{
    const mgr = makeManager();
    const doc = jsoupParse(file.readAllBytes());
    const tables = Array.from(doc.querySelectorAll("table"));
    for (let i = 0; i < tables.length; i++)
    {
        const table = tables[i]!;
        // As importHTMLFile: only tables without nested tables can be imported
        if (Array.from(table.children).every(e => !e.matches("table") && e.querySelector("table") === null))
        {
            table.insertAdjacentHTML("afterbegin", "<div class='overlay'></div>");
            const wrapper = doc.createElement("a");
            wrapper.setAttribute("class", "gui_import");
            wrapper.setAttribute("href", "gui_import:id" + i);
            table.replaceWith(wrapper);
            wrapper.appendChild(table);
        }
        else
            continue;
        d.line("TABLE " + i);
        let imp: HTMLImporter.HTMLImport;
        let vals: string[][];
        let columnNames: string[];
        try
        {
            const read = HTMLImporter.readTable(table);
            vals = read.getFirst();
            columnNames = read.getSecond();
            ImporterUtility.rectangulariseAndRemoveBlankRows(vals);
            imp = HTMLImporter.makeImport(mgr, vals, columnNames, fromWikipedia);
        }
        catch (e)
        {
            d.line("read EXCEPTION " + describeError(e));
            continue;
        }
        d.line("names " + columnNames.map(escape).join("|"));
        for (const row of vals)
            d.line("row " + row.map(escape).join("|"));
        for (const trim of [true, false])
        {
            imp.trimWhitespace.value = trim;
            d.line("trim whitespace " + String(trim));
            d.loadSourceAndDest(imp, UnitType.UNIT);
        }
    }
}

function excel(d: Dump, file: JavaFile): void
{
    const mgr = makeManager();
    let vals: string[][];
    try
    {
        vals = new ExcelImporter().readFirstSheet(file);
    }
    catch (e)
    {
        if (e instanceof ExcelImporter.InvalidFormatException)
        {
            // Ignored by importFile, so the import dialog is not shown:
            d.line("no import");
            return;
        }
        throw e;
    }
    d.loadSourceAndDest(ExcelImporter.makeImport(mgr, vals), UnitType.UNIT);
}

function exportTables(d: Dump, base: string, src: string): void
{
    const mgr = makeManager();
    mgr.loadAll(src, _w => {});
    for (const table of mgr.getAllTables())
    {
        const id = table.getId().getRaw();
        d.line("TABLE " + id);
        try
        {
            const csv = new TextDecoder().decode(new CSVExporter().exportData(table));
            d.line("CSV");
            d.out += csv;
            d.line("END CSV");
        }
        catch (e)
        {
            d.line("CSV EXCEPTION " + describeError(e));
        }
        try
        {
            const htmlText = new TextDecoder().decode(new HTMLExporter().exportData(table));
            d.line("HTML");
            d.out += htmlText.replace(/<p>Exported on [^<]*<\/p>/, "<p>Exported on (time)</p>");
            d.line("END HTML");
        }
        catch (e)
        {
            d.line("HTML EXCEPTION " + describeError(e));
        }
        // Read the Java's export, as Java read it:
        d.line("EXCEL");
        excel(d, new JavaFile("/" + base + ".xlsx", readFileSync(DIR + "java-" + base + "-" + id.replace(/[^A-Za-z0-9]/g, "_") + ".xlsx")));
        d.line("END EXCEL");
    }
}

function process_(name: string): string
{
    const d = new Dump();
    d.line("FILE " + name);
    const bytes = new Uint8Array(readFileSync(DIR + name));
    try
    {
        if (name.startsWith("txt-"))
            text(d, new JavaFile("/" + name, bytes));
        else if (name.startsWith("html-"))
            html(d, new JavaFile("/" + name, bytes), name.includes("-wiki"));
        else if (name.startsWith("xlsx-"))
            excel(d, new JavaFile("/" + name, bytes));
        else
            exportTables(d, name.replace(/\.rec$/, ""), new TextDecoder().decode(bytes));
    }
    catch (e)
    {
        d.line("EXCEPTION " + describeError(e));
    }
    return d.out;
}

// ---------------------------------------------------------------------------------------------
// Generating the inputs

function choose<T>(r: JavaRandom, items: readonly T[]): T
{
    return items[r.nextInt(items.length)]!;
}

const WORDS = ["apple", "Banana split", "cherry", "Dürer", "東京", "x", "N/A", "NA", "-", "true", "Yes", "n", "12abc", "a, b", "say \"hi\"", "it's", "  spaced  ", "€", "£5", "100%", "#1"];

function genTextFile(r: JavaRandom): Uint8Array
{
    const sep = choose(r, [",", ";", "\t", "|", " ", ":", ","]);
    const quote = choose(r, ["", "\"", "\"", "'"]);
    const nCols = 1 + r.nextInt(7);
    const kinds = Array.from({ length: nCols }, () => choose(r, ["int", "intComma", "dec", "currencyPre", "currencySuf", "percent", "numNA", "numBlank", "date", "time", "bool", "text", "text", "blank", "mixed"]));
    const dateFormatters = new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY).getFlexibleFormatters().flatMap(l => l);
    const timeFormatters = new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY).getFlexibleFormatters().flatMap(l => l);
    const colDateFormat = kinds.map(() => choose(r, dateFormatters));
    const colTimeFormat = kinds.map(() => choose(r, timeFormatters));
    const currency = kinds.map(() => choose(r, ["$", "€", "£", "¥", "US$"]));
    const boolSet = kinds.map(() => choose(r, [["true", "false"], ["TRUE", "FALSE"], ["yes", "no"], ["Y", "N"], ["t", "f"]]));
    const dp = kinds.map(() => 1 + r.nextInt(4));
    const value = (c: number): string =>
    {
        const n = r.nextInt(2000000) - 1000000;
        switch (kinds[c]!)
        {
            case "int": return String(n);
            case "intComma": return n.toLocaleString("en-US");
            case "dec": return (n / Math.pow(10, dp[c]!)).toFixed(dp[c]! - r.nextInt(2));
            case "currencyPre": return currency[c]! + (r.nextBoolean() ? " " : "") + Math.abs(n);
            case "currencySuf": return Math.abs(n) + currency[c]!;
            case "percent": return (n % 100) + "%";
            case "numNA": return r.nextInt(5) === 0 ? "NA" : String(n);
            case "numBlank": return r.nextInt(5) === 0 ? "" : String(n);
            case "date": return LocalDate.of(1950 + r.nextInt(80), 1 + r.nextInt(12), 1 + r.nextInt(28)).format(colDateFormat[c]!);
            case "time": return LocalTime.of(r.nextInt(24), r.nextInt(60), r.nextInt(60)).format(colTimeFormat[c]!);
            case "bool": return choose(r, boolSet[c]!);
            case "text": return choose(r, WORDS);
            case "blank": return "";
            default: return choose(r, [String(n), choose(r, WORDS), "", "3.5", "2020-01-01"]);
        }
    };
    const encodeCell = (s: string): string =>
    {
        if (quote !== "" && (s.includes(sep) || s.includes(quote) || r.nextInt(6) === 0))
            return quote + s.replaceAll(quote, quote + quote) + quote;
        return s;
    };
    const lines: string[] = [];
    const garbage = r.nextInt(3);
    for (let i = 0; i < garbage; i++)
        lines.push(choose(r, ["# Generated report", "Report for 2020", "", "Notes: see below", "Total" + sep + "3"]));
    if (r.nextInt(10) < 7)
        lines.push(kinds.map((k, i) => encodeCell(choose(r, ["Col " + i, k, "Amount (" + i + ")", "1st", "Name", "Name"]))).join(sep));
    const rows = r.nextInt(40);
    for (let row = 0; row < rows; row++)
    {
        if (r.nextInt(20) === 0)
            lines.push("");
        let cells = kinds.map((_k, c) => encodeCell(value(c)));
        if (r.nextInt(15) === 0)
            cells = cells.slice(0, r.nextInt(cells.length + 1));
        lines.push(cells.join(sep));
    }
    const newline = choose(r, ["\n", "\n", "\r\n"]);
    let content = lines.join(newline);
    if (r.nextBoolean())
        content += newline;
    const charset = choose(r, [Charset.UTF_8, Charset.UTF_8, Charset.UTF_8, Charset.ISO_8859_1, Charset.UTF_16]);
    return javaEncode(content, canEncode(charset, content) ? charset : Charset.UTF_8);
}

function genHTMLFile(r: JavaRandom): string
{
    const cellContent = (): string => choose(r, [
        "plain", " padded  text ", "a<br>b", "<b>bold</b> and <i>italic</i>", "&amp; &lt;x&gt; &nbsp;y&eacute;", "12", "3.25", "-7",
        "1,234", "2021-03-04", "<div>block</div>after", "<pre>  pre  formatted </pre>", "Name[1]", "Value [a 2] [3]", "", "  ",
        "<span>x</span><span>y</span>", "<script>var x = 1;</script>shown", "line\nbreak", "$5", "true", "<p>para</p><p>two</p>",
    ]);
    const tableHTML = (depth: number): string =>
    {
        const cols = 1 + r.nextInt(5);
        let s = "<table>";
        if (r.nextInt(4) === 0)
            s += "<caption>A caption</caption>";
        const headStyle = r.nextInt(3);
        const header = Array.from({ length: cols }, (_x, i) => choose(r, ["Col " + i, "Name", "Amount[1]", "Price ($)", ""])).map(h => "<th>" + h + "</th>").join("");
        if (headStyle === 0)
            s += "<thead><tr>" + header + "</tr></thead><tbody>";
        else if (headStyle === 1)
            s += "<tr>" + header + "</tr>";
        const rows = r.nextInt(12);
        for (let row = 0; row < rows; row++)
        {
            s += "<tr>";
            for (let c = 0; c < cols; c++)
            {
                const tag = r.nextInt(12) === 0 ? "th" : "td";
                let attrs = "";
                if (r.nextInt(10) === 0)
                    attrs += " colspan=\"" + choose(r, ["2", "3", "x", "1"]) + "\"";
                if (r.nextInt(10) === 0)
                    attrs += " rowspan=\"" + choose(r, ["2", "3", "abc"]) + "\"";
                const content = depth === 0 && r.nextInt(25) === 0 ? tableHTML(1) : cellContent();
                s += "<" + tag + attrs + ">" + content + "</" + tag + ">";
            }
            s += "</tr>\n";
        }
        if (headStyle === 0)
            s += "</tbody>";
        if (r.nextInt(5) === 0)
            s += "<tfoot><tr><td>foot</td></tr></tfoot>";
        return s + "</table>";
    };
    let s = "<html><head>" + (r.nextBoolean() ? "<meta charset=\"utf-8\">" : "") + "<title>Test</title></head><body>";
    const tables = 1 + r.nextInt(3);
    for (let t = 0; t < tables; t++)
        s += "<p>Before</p>" + tableHTML(0);
    return s + "</body></html>";
}

function genExcelFile(r: JavaRandom): Uint8Array
{
    const ws: XLSX.WorkSheet = {};
    const rows = 1 + r.nextInt(20);
    const cols = 1 + r.nextInt(6);
    const startRow = r.nextInt(3);
    const startCol = r.nextInt(2);
    const kinds = Array.from({ length: cols }, () => choose(r, ["int", "dec", "date", "time", "datetime", "text", "bool", "mixed", "formula"]));
    for (let row = 0; row < rows; row++)
    {
        for (let c = 0; c < cols; c++)
        {
            if (r.nextInt(12) === 0)
                continue;
            const addr = XLSX.utils.encode_cell({ r: startRow + row, c: startCol + c });
            const n = r.nextInt(2000000) - 1000000;
            if (row === 0 && r.nextBoolean())
            {
                ws[addr] = { t: "s", v: choose(r, ["Name", "Amount", "Date", "When", "Col " + c, "Total (£)"]) };
                continue;
            }
            switch (kinds[c]!)
            {
                case "int": ws[addr] = { t: "n", v: n }; break;
                case "dec": ws[addr] = { t: "n", v: n / choose(r, [10, 100, 1000, 3, 7]), ...(r.nextBoolean() ? { z: choose(r, ["0.00", "#,##0.0", "General"]) } : {}) }; break;
                case "date": ws[addr] = { t: "n", v: 1 + r.nextInt(60000), z: choose(r, ["yyyy-mm-dd", "m/d/yy", "d-mmm-yy", "dd/mm/yyyy"]) }; break;
                case "time": ws[addr] = { t: "n", v: r.nextInt(86400) / 86400, z: choose(r, ["h:mm", "hh:mm:ss", "h:mm AM/PM"]) }; break;
                case "datetime": ws[addr] = { t: "n", v: 20000 + r.nextInt(30000) + r.nextInt(86400) / 86400, z: "yyyy-mm-dd hh:mm" }; break;
                case "text": ws[addr] = { t: "s", v: choose(r, WORDS) }; break;
                case "bool": ws[addr] = { t: "b", v: r.nextBoolean() }; break;
                case "formula": ws[addr] = { t: "n", v: n * 2, f: "1+1" }; break;
                default: ws[addr] = choose<XLSX.CellObject>(r, [{ t: "n", v: n }, { t: "s", v: choose(r, WORDS) }, { t: "e", v: 0x2A }, { t: "b", v: false }, { t: "s", v: "" }]);
            }
        }
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: startRow + rows - 1, c: startCol + cols - 1 } });
    if (r.nextInt(3) === 0)
    {
        const mr = startRow + r.nextInt(rows);
        const mc = startCol + r.nextInt(cols);
        ws["!merges"] = [{ s: { r: mr, c: mc }, e: { r: mr + r.nextInt(3), c: mc + r.nextInt(2) } }];
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function generateInputs(): void
{
    mkdirSync(DIR, { recursive: true });
    const pad = (n: number): string => String(n).padStart(2, "0");
    for (let i = 1; i <= TEXT_COUNT; i++)
        writeFileSync(DIR + "txt-" + pad(i) + ".txt", genTextFile(new JavaRandom(1000 + i)));
    for (let i = 1; i <= HTML_COUNT; i++)
        writeFileSync(DIR + "html-" + pad(i) + (i % 4 === 0 ? "-wiki" : "") + ".html", genHTMLFile(new JavaRandom(2000 + i)));
    // One HTML file in another charset, declared in a meta element:
    writeFileSync(DIR + "html-latin1.html", javaEncode("<html><head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=ISO-8859-1\"></head><body><table><tr><th>Caf\u00e9</th></tr><tr><td>cr\u00e8me br\u00fbl\u00e9e</td></tr></table></body></html>", Charset.ISO_8859_1));
    for (let i = 1; i <= EXCEL_COUNT; i++)
        writeFileSync(DIR + "xlsx-" + pad(i) + ".xlsx", genExcelFile(new JavaRandom(3000 + i)));
    // Not an Office Open XML file:
    writeFileSync(DIR + "xlsx-notxml.xlsx", "Not a spreadsheet\n");
    // Saved files, and the port's Excel export of each of their tables (which Java also reads):
    for (let i = 1; i <= REC_COUNT; i++)
    {
        const base = "rec-" + pad(i);
        copyFileSync(DATA_GOLDEN + "input-" + pad(i) + ".rec", DIR + base + ".rec");
        const mgr = makeManager();
        mgr.loadAll(readFileSync(DIR + base + ".rec", "utf8"), _w => {});
        for (const table of mgr.getAllTables())
            writeFileSync(DIR + "xlsx-port-" + base + "-" + table.getId().getRaw().replace(/[^A-Za-z0-9]/g, "_") + ".xlsx", new ExcelExporter().exportData(table));
    }
}

const inputs = existsSync(DIR) ? readdirSync(DIR).filter(f => /^(txt|html|xlsx|rec)-/.test(f)).sort() : [];

describe("ImportersGolden", () =>
{
    if (process.env["GENERATE_IMPORTER_INPUTS"] === "1")
    {
        test("generate inputs", () =>
        {
            generateInputs();
        });
        return;
    }

    test("there are golden files", () =>
    {
        expect(inputs.length).toBeGreaterThan(0);
    });

    for (const name of inputs)
    {
        test(name, () =>
        {
            // (Known difference: the port's class names have no package, see javaClassName.)
            const base = name.replace(/\.[a-z]+$/, "");
            const expected = KNOWN_DIFFERENCES.has(name) ? readFileSync(DIR + "port-" + base + ".txt", "utf8") : readFileSync(DIR + "java-" + base + ".txt", "utf8").replace(/class xyz\.columnal\.[a-z.]*\.([A-Za-z]+)/g, "class $1");
            const actual = process_(name);
            if (process.env.DUMP_PORT_OUTPUT !== undefined)
                writeFileSync(process.env.DUMP_PORT_OUTPUT + "/port-" + base + ".txt", actual);
            expect(actual).toEqual(expected);
        });
    }

    test("known differences", () =>
    {
        const portFiles = readdirSync(DIR).filter(f => f.startsWith("port-")).map(f => f.substring("port-".length).replace(/\.txt$/, "")).sort();
        expect(portFiles).toEqual([...KNOWN_DIFFERENCES.keys()].map(n => n.replace(/\.[a-z]+$/, "")).sort());
        // Each is still a difference from Java:
        for (const name of KNOWN_DIFFERENCES.keys())
        {
            const base = name.replace(/\.[a-z]+$/, "");
            expect(readFileSync(DIR + "port-" + base + ".txt", "utf8"), name).not.toEqual(readFileSync(DIR + "java-" + base + ".txt", "utf8").replace(/class xyz\.columnal\.[a-z.]*\.([A-Za-z]+)/g, "class $1"));
        }
    });

    // The port's Excel export of each table is read by Java (POI) just as Java's own export is:
    for (const name of inputs.filter(n => n.startsWith("xlsx-port-")))
    {
        test("Java reads " + name + " as its own export", () =>
        {
            const fromPort = readFileSync(DIR + "java-" + name.replace(/\.xlsx$/, "") + ".txt", "utf8").split("\n").slice(1).join("\n");
            const m = /^xlsx-port-(rec-\d+)-(.*)\.xlsx$/.exec(name)!;
            const javaExport = readFileSync(DIR + "java-" + m[1]! + ".txt", "utf8");
            // The Java export's section, in the rec file's output:
            const tables = javaExport.split(/^TABLE /m);
            const section = tables.find(t => t.split("\n")[0]!.replace(/[^A-Za-z0-9]/g, "_") === m[2]!)!;
            const excelPart = section.substring(section.indexOf("EXCEL\n") + "EXCEL\n".length, section.indexOf("END EXCEL\n"));
            // Known difference: the time zone data that js-joda has stops at 2500 (after which there
            // is no daylight saving time), where Java's rules carry on, so a date and time from then
            // can be an hour different (see CONVENTIONS.md "Dates and times").  Rows with one are left out:
            const withoutFarFuture = (dump: string): string => dump.split("\n").filter(l => !/\b(2[5-9]|[3-9]\d)\d\d-\d\d-\d\d\b/.test(l)).join("\n");
            expect(withoutFarFuture(fromPort)).toEqual(withoutFarFuture(excelPart));
        });
    }
});
