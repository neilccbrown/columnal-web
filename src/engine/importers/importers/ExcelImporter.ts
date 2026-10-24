// Port of xyz.columnal.importers.ExcelImporter (importers module).
//
// PORT-NOTE: Java reads the workbook with Apache POI; here SheetJS reads it.  The cell values are
// turned into text as POI's were (see getCellValueAsString).  Java opens the workbook as an XSSFWorkbook,
// which only reads the Office Open XML formats (.xlsx, .xlsm): see readWorkbook.
import * as XLSX from "xlsx";
import type { Localized } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { DataSource } from "../../data/data/DataSource.js";
import { ImmediateDataSource } from "../../data/data/DataSources.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { decimalFromDouble } from "../../java/JavaBigDecimal.js";
import { javaListGet } from "../../java/JavaCollections.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { LocalDate } from "../../java/time/JavaTime.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { SimulationConsumerNoError } from "../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Workers } from "../../utility/utility/Workers.js";
import type { GuessFormat } from "./GuessFormat.js";
import type { Importer } from "./Importer.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";
import { ImporterUtility } from "./ImporterUtility.js";
import { ImportPlainTable } from "./ImportPlainTable.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ExcelImporter implements Importer
{
    public getName(): Localized
    {
        return TranslationUtility.getString("importer.excel.files");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.xls", "*.xlsx", "*.xlsm"];
    }

    public importFile(dialogs: ImporterDialogs, mgr: TableManager, destination: CellPosition, src: JavaFile, _origin: URL, recordLoadedTable: SimulationConsumerNoError<DataSource>): void
    {
        let vals: string[][];
        try
        {
            vals = this.readFirstSheet(src);
        }
        catch (e)
        {
            if (e instanceof ExcelImporter.InvalidFormatException)
            {
                // TODO report an error
                return;
            }
            throw e;
        }

        const importInfo = ExcelImporter.makeImport(mgr, vals);

        dialogs.showImportChoices(src.getName(), importInfo, outcome =>
        {
            if (outcome !== null)
            {
                const outcomeNonNull = outcome;
                const makeDataSource: SimulationSupplier<DataSource> = () => new ImmediateDataSource(mgr, outcomeNonNull.getInitialLoadDetails(destination), ImporterUtility.makeEditableRecordSet(mgr.getTypeManager(), outcomeNonNull.getFormat().trim.trim(vals), outcomeNonNull.getFormat().columnInfo));
                Workers.onWorkerThread("Loading " + src.getName(), Workers.Priority.LOAD_FROM_DISK, () => ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.importing.excel"), () =>
                {
                    const dataSource = makeDataSource();
                    recordLoadedTable(dataSource);
                }));
            }
        });
    }

    /**
     * Reads the values of the first sheet of the workbook, as text, with the value of a merged
     * cell in each cell of the merged region.  The rows are rectangular, with blank rows removed.
     *
     * PORT-NOTE: split out of importFile (which then shows the import dialog), so that it can be
     * tested without the GUI.  Throws InvalidFormatException if the file can't be read (Java:
     * IOException or InvalidFormatException, which importFile ignores).
     */
    public readFirstSheet(src: JavaFile): string[][]
    {
        const workbook = ExcelImporter.readWorkbook(src.readAllBytes());
        // TODO offer sheet list as import choice
        const datatypeSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
        const date1904 = workbook.Workbook?.WBProps?.date1904 === true;

        const vals: string[][] = [];
        // Java: a HashMap from each cell address in a merged region to the region
        const mergedRegions = new Map<string, XLSX.Range>();
        for (const mergedRegion of datatypeSheet["!merges"] ?? [])
        {
            for (let row = mergedRegion.s.r; row <= mergedRegion.e.r; row++)
            {
                for (let col = mergedRegion.s.c; col <= mergedRegion.e.c; col++)
                {
                    mergedRegions.set(row + "," + col, mergedRegion);
                }
            }
        }

        // Java iterates through the rows and their cells, in order:
        const ref = datatypeSheet["!ref"];
        if (ref !== undefined)
        {
            const range = XLSX.utils.decode_range(ref);
            for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++)
            {
                for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++)
                {
                    const currentCell: XLSX.CellObject | undefined = datatypeSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
                    if (currentCell === undefined)
                        continue;
                    const val = ExcelImporter.getCellValueAsString(currentCell, date1904);
                    // No need to set if empty, that's the default:
                    if (val !== "")
                    {
                        const merged = mergedRegions.get(rowIndex + "," + columnIndex);
                        if (merged !== undefined)
                        {
                            for (let row = merged.s.r; row <= merged.e.r; row++)
                            {
                                for (let col = merged.s.c; col <= merged.e.c; col++)
                                {
                                    this.setValue(vals, row, col, val);
                                }
                            }
                        }
                        else
                        {
                            this.setValue(vals, rowIndex, columnIndex, val);
                        }
                    }
                }
            }
        }

        ImporterUtility.rectangulariseAndRemoveBlankRows(vals);
        return vals;
    }

    /**
     * Java: new XSSFWorkbook(src), which only reads the Office Open XML formats (zip files).
     *
     * PORT-NOTE: bug fix.  Java offered .xls files for import, but couldn't read them: POI threw a
     * NotOfficeXmlFileException, uncaught (so nothing happened for the user).  Here the older Excel
     * format (an OLE2 compound file, such as .xls) is read too, and any other file throws
     * InvalidFormatException, like a broken spreadsheet.
     */
    private static readWorkbook(bytes: Uint8Array): XLSX.WorkBook
    {
        const startsWith = (magic: readonly number[]): boolean => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
        const isZip = startsWith([0x50, 0x4B, 0x03, 0x04]);
        const isOLE2 = startsWith([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
        if (!isZip && !isOLE2)
            throw new ExcelImporter.InvalidFormatException("Not an Excel file");
        try
        {
            return XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false, cellFormula: false, dense: false });
        }
        catch (e)
        {
            throw new ExcelImporter.InvalidFormatException(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * The import (for the import dialog) of a sheet's values, as read by readFirstSheet.
     * PORT-NOTE: split out of importFile, like readFirstSheet.
     */
    public static makeImport(mgr: TableManager, vals: readonly (readonly string[])[]): ImportPlainTable
    {
        const numSrcColumns = vals.length === 0 ? 0 : vals[0]!.length;
        return new class extends ImportPlainTable
        {
            public override srcColumnName(index: number): Pair<ColumnId, Localized>
            {
                const columnId = ExcelImporter.excelColumnName(index);
                return new Pair(columnId, columnId.getRaw());
            }

            public override destColumnName(trimChoice: GuessFormat.TrimChoice, index: number): ColumnId
            {
                if (trimChoice.trimFromTop > 0)
                    return new ColumnId(IdentifierUtility.fixExpressionIdentifier(javaListGet(javaListGet(vals, trimChoice.trimFromTop - 1), index), ExcelImporter.excelColumnName(index).getRaw()));
                else
                    return ExcelImporter.excelColumnName(index);
            }
        }(numSrcColumns, mgr, vals);
    }

    protected setValue(vals: string[][], rowIndex: number, columnIndex: number, val: string): void
    {
        while (vals.length <= rowIndex)
        {
            // Can't use Collections.emptyList because this may be later
            // modified by rectangulariseAndRemoveBlankRows
            vals.push([]);
        }
        const row = vals[rowIndex]!;
        while (row.length <= columnIndex)
        {
            row.push("");
        }
        row[columnIndex] = val;
    }

    /**
     * PORT-NOTE: bug fix.  Java's naming was wrong after column Z: the column after Z (index 26) was
     * "BA" (Excel's is "AA"), and so on, and names repeated after 676 columns.  Here the names are
     * Excel's (bijective base 26: A to Z, AA to ZZ, AAA, ...).
     */
    /** @internal */
    public static excelColumnName(columnIndex: number): ColumnId
    {
        const A = "A".charCodeAt(0);
        let s = "";
        let remaining = columnIndex + 1;
        while (remaining > 0)
        {
            const digit = (remaining - 1) % 26;
            s = String.fromCharCode(digit + A) + s;
            remaining = Math.trunc((remaining - 1) / 26);
        }
        return new ColumnId(s);
    }

    /**
     * Java: getCellValueAsString(Cell, CellType), from the POI cell.  A formula cell has its cached
     * result, which SheetJS gives as the cell's value.
     */
    private static getCellValueAsString(currentCell: XLSX.CellObject, date1904: boolean): string
    {
        switch (currentCell.t)
        {
            case "n":
            {
                const value = currentCell.v as number;
                if (ExcelImporter.isCellDateFormatted(currentCell, value))
                    return ExcelImporter.formatDateF(ExcelImporter.getJavaDate(value, date1904));
                else
                    return ExcelImporter.formatNumber(value);
            }
            case "s":
                return String(currentCell.v ?? "");
            case "b":
                return (currentCell.v === true ? "true" : "false").toUpperCase();
            case "d":
                // Only with SheetJS's cellDates option, which is off:
                return ExcelImporter.formatDateF(LocalDate.parse((currentCell.v as Date).toISOString().substring(0, 10)));
            case "e":
            case "z":
            default:
                return "";
        }
    }

    // POI's DateUtil.isCellDateFormatted: a valid Excel date, in a date format
    private static isCellDateFormatted(cell: XLSX.CellObject, value: number): boolean
    {
        const format = cell.z;
        if (format === undefined || typeof format !== "string")
            return false;
        // DateUtil.isValidExcelDate:
        if (!(value > -Number.MIN_VALUE))
            return false;
        return (XLSX.SSF as { is_date(fmt: string): boolean }).is_date(format);
    }

    // POI's DateUtil.getJavaDate: the date part (the time zone does not matter, as only the date is shown)
    private static getJavaDate(date: number, use1904windowing: boolean): LocalDate
    {
        let wholeDays = Math.floor(date);
        const millisecondsInDay = Math.trunc((date - wholeDays) * MS_PER_DAY + 0.5);
        let startYear = 1900;
        let dayAdjust = -1; // Excel thinks 2/29/1900 is a valid date, which it isn't
        if (use1904windowing)
        {
            startYear = 1904;
            dayAdjust = 1; // 1904 date windowing uses 1/2/1904 as the first day
        }
        else if (wholeDays < 61)
        {
            // Date is prior to 3/1/1900, so adjust because Excel thinks 2/29/1900 exists
            // If Excel date == 2/29/1900, will become 3/1/1900 in Java representation
            dayAdjust = 0;
        }
        if (millisecondsInDay >= MS_PER_DAY)
            wholeDays += 1;
        // Java's Calendar.set(startYear, JANUARY, wholeDays + dayAdjust): day 1 is 1 January
        return LocalDate.of(startYear, 1, 1).plusDays(wholeDays + dayAdjust - 1);
    }

    // Java's String.format("%tF", date): yyyy-MM-dd
    private static formatDateF(date: LocalDate): string
    {
        const year = date.year();
        const yearStr = year < 0 ? "-" + String(-year).padStart(4, "0") : String(year).padStart(4, "0");
        return yearStr + "-" + String(date.monthValue()).padStart(2, "0") + "-" + String(date.dayOfMonth()).padStart(2, "0");
    }

    /**
     * PORT-NOTE: bug fix.  Java formatted the number with String.format("%f", d): always six decimal
     * places, so a number with more lost the rest (0.0000001 became 0.000000) and every number got
     * trailing zeros (1.5 became 1.500000, so the column was guessed to have six decimal places).
     * Here the number is written in full, as its shortest decimal (Java's BigDecimal.valueOf(d)),
     * without an exponent.
     */
    /** @internal */
    public static formatNumber(d: number): string
    {
        if (Number.isNaN(d))
            return "NaN";
        if (!Number.isFinite(d))
            return d > 0 ? "Infinity" : "-Infinity";
        return decimalFromDouble(d).toFixed();
    }
}

export namespace ExcelImporter
{
    /** org.apache.poi.openxml4j.exceptions.InvalidFormatException (or an IOException reading the file) */
    export class InvalidFormatException extends Error
    {
        public constructor(message: string)
        {
            super(message);
            this.name = "InvalidFormatException";
        }
    }
}
