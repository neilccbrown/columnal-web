// Port of xyz.columnal.exporters.ExcelExporter (exporters module).
//
// PORT-NOTE: Java writes the workbook with Apache POI; here SheetJS writes it.  The cells have the
// same values and number formats.  POI turns a java.util.Date into Excel's date number using the
// system time zone (see excelDate), which is kept.
import * as XLSX from "xlsx";
import type { ExpressionIdentifier, Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";
import { doubleValue, type Decimal } from "../../java/JavaBigDecimal.js";
import { javaSystemDefaultZone, LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime } from "../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataType, type TagType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { GetValue } from "../../types/data/datatype/DataTypeValue.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Log } from "../../utility/log/Log.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { UnitType } from "../../utility/utility/UnitType.js";
import type { ListEx, Record } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Exporter } from "./Exporter.js";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export class ExcelExporter implements Exporter
{
    public exportData(data: Table): Uint8Array
    {
        const workbook = XLSX.utils.book_new();
        // POI's default name for the first sheet:
        const sheet: XLSX.WorkSheet = {};
        let lastRow = 0;
        let lastColumn = 0;
        const createCell = (row: number, column: number, cell: XLSX.CellObject): XLSX.CellObject =>
        {
            sheet[XLSX.utils.encode_cell({ r: row, c: column })] = cell;
            lastRow = Math.max(lastRow, row);
            lastColumn = Math.max(lastColumn, column);
            return cell;
        };

        const rs = data.getData();
        const columns = rs.getColumns();
        for (let columnIndex = 0; columnIndex < columns.length; columnIndex++)
        {
            const column = columns[columnIndex]!;
            createCell(0, columnIndex, { t: "s", v: column.getName().getRaw() });
        }
        for (let row = 0; rs.indexValid(row); row++)
        {
            const rowIndexFinal = row;

            for (let columnIndex = 0; columnIndex < columns.length; columnIndex++)
            {
                const column = columns[columnIndex]!;
                // A new cell is blank:
                const cell = createCell(1 + row, columnIndex, { t: "z" });
                const setCellValue = (value: number | string | boolean): void =>
                {
                    cell.t = typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s";
                    cell.v = value;
                };
                const setCellStyle = (format: string): void =>
                {
                    cell.z = format;
                };
                const putString = (_dataType: DataType, g: GetValue<Value>): UnitType =>
                {
                    setCellValue(DataTypeUtility.valueToString(g.get(rowIndexFinal)));
                    return UnitType.UNIT;
                };
                try
                {
                    column.getType().applyGet<UnitType>({
                        number(g: GetValue<Decimal>, _displayInfo: NumberInfo): UnitType
                        {
                            setCellValue(doubleValue(g.get(rowIndexFinal)));
                            return UnitType.UNIT;
                        },

                        text(g: GetValue<string>): UnitType
                        {
                            setCellValue(g.get(rowIndexFinal));
                            return UnitType.UNIT;
                        },

                        bool(g: GetValue<boolean>): UnitType
                        {
                            setCellValue(g.get(rowIndexFinal));
                            return UnitType.UNIT;
                        },

                        date(dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): UnitType
                        {
                            // PORT-NOTE: bug fix.  Java put a date before 1900 (which Excel's dates
                            // can't show) as -1; here it is written as text, as a year and month is.
                            const putDate = (format: string, local: LocalDateTime, value: TemporalAccessor): void =>
                            {
                                const excelDate = ExcelExporter.excelDate(local);
                                if (excelDate === null)
                                    setCellValue(DataTypeUtility.valueToString(value));
                                else
                                {
                                    setCellStyle(format);
                                    setCellValue(excelDate);
                                }
                            };
                            const value = g.get(rowIndexFinal);
                            switch (dateTimeInfo.getType())
                            {
                                case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                                    putDate("yyyy-MM-dd", LocalDate.from(value).atStartOfDay(), value);
                                    break;
                                case DateTimeInfo.DateTimeType.YEARMONTH:
                                    setCellValue(YearMonth.from(value).toString());
                                    break;
                                case DateTimeInfo.DateTimeType.TIMEOFDAY:
                                    setCellStyle("HH:mm:ss");
                                    setCellValue(LocalTime.from(value).toNanoOfDay() / (1_000_000_000.0 * 24.0 * 60.0 * 60.0));
                                    break;
                                case DateTimeInfo.DateTimeType.DATETIME:
                                    // PORT-NOTE: bug fix.  Java took the date and time as UTC, and then
                                    // wrote it in the system time zone, so it moved by the zone's offset
                                    // from UTC; here it is written as it is.
                                    putDate("yyyy-MM-dd HH:mm:ss", LocalDateTime.from(value), value);
                                    break;
                                case DateTimeInfo.DateTimeType.DATETIMEZONED:
                                    // The moment, as a date and time in the system time zone (as in Java):
                                    putDate("yyyy-MM-dd HH:mm:ss", LocalDateTime.ofInstant(ZonedDateTime.from(value).toInstant(), javaSystemDefaultZone()), value);
                                    break;
                            }
                            return UnitType.UNIT;
                        },

                        tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tagTypes: readonly TagType<DataType>[], g: GetValue<Value>): UnitType
                        {
                            const dataType = data.getManager().getTypeManager().lookupType(typeName, typeVars);
                            if (dataType !== null)
                                return putString(dataType, g);
                            else
                                throw new UserException("Could not find column type: " + typeName.getRaw());
                        },

                        record(types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): UnitType
                        {
                            return putString(DataType.record(types), g);
                        },

                        array(inner: DataType, g: GetValue<ListEx>): UnitType
                        {
                            return putString(DataType.array(inner), g);
                        },
                    });
                }
                catch (e)
                {
                    if (!(e instanceof InternalException || e instanceof UserException))
                        throw e;
                    if (e instanceof InternalException)
                        Log.log(e);
                    setCellValue("Error: " + e.getLocalizedMessage());
                }
            }
        }
        sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } });
        XLSX.utils.book_append_sheet(workbook, sheet, "Sheet0");
        return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    }

    /**
     * POI's DateUtil.getExcelDate(Date), for a date and time (whole days since the start of 1900,
     * counting Excel's 29 February 1900, plus the fraction of the day).  Null before 1900, which
     * Excel's dates can't show (POI gives -1).
     */
    private static excelDate(local: LocalDateTime): number | null
    {
        if (local.year() < 1900)
            return null;
        const fraction = (((local.hour() * 60 + local.minute()) * 60 + local.second()) * 1000 + Math.trunc(local.nano() / 1_000_000)) / DAY_MILLISECONDS;
        // POI's absoluteDay(cal, false): the day of the year plus the days in the years since 1900
        const yr = local.year();
        const yr1 = yr - 1;
        const leapDays = Math.trunc(yr1 / 4) - Math.trunc(yr1 / 100) + Math.trunc(yr1 / 400) - 460;
        const daysInPriorYears = 365 * (yr - 1900) + leapDays;
        // (Adding in the same order as POI, for the same rounding:)
        let value = fraction + (local.dayOfYear() + daysInPriorYears);
        if (value >= 60)
            value++;
        return value;
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.excel.files");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.xlsx"];
    }
}
