// Port of xyz.columnal.rinterop.ConvertToR (r-interop module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { Column } from "../../data/data/Column.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { type Decimal, doubleValue } from "../../java/JavaBigDecimal.js";
import { javaEnumName } from "../../java/JavaEnum.js";
import { javaReplace } from "../../java/JavaString.js";
import { TreeSet } from "../../java/TreeMap.js";
import type { LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime } from "../../java/time/JavaTime.js";
import { javaSystemDefaultZone, ZoneOffset } from "../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { DataType, DataTypeVisitorEx, TagType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { GetValue, type DataTypeValue, type DataTypeVisitorGet } from "../../types/data/datatype/DataTypeValue.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { TaggedValue } from "../../utility/utility/TaggedValue.js";
import type { ListEx, Record } from "../../utility/utility/Utility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { ConvertFromR } from "./ConvertFromR.js";
import { RUtility } from "./RUtility.js";
import type { RValue } from "./RValue.js";
import type { RVisitor } from "./RVisitor.js";

export class ConvertToR
{
    public static convertTableToR(recordSet: RecordSet, tableType: ConvertFromR.TableType): RValue
    {
        // A table is a generic list of columns with class data.frame
        return RUtility.genericVector(Utility.mapListExI(recordSet.getColumns(), c => ConvertToR.convertColumnToR(c, tableType)),
            RUtility.makeClassAttributes(tableType === ConvertFromR.TableType.DATA_FRAME ? RUtility.CLASS_DATA_FRAME : RUtility.CLASS_TIBBLE, new Map<string, RValue>([
                ["names", RUtility.stringVector(Utility.mapListExI(recordSet.getColumns(), c => ConvertToR.usToRColumn(c.getName(), tableType, false)), null)],
                ["row.names", RUtility.intVector([RUtility.NA_AS_INTEGER, -recordSet.getLength() | 0], null)],
            ])), true);
    }

    public static usToRColumn(columnId: ColumnId, tableType: ConvertFromR.TableType, quotesIfNeeded: boolean): string
    {
        return tableType === ConvertFromR.TableType.TIBBLE ? (columnId.getRaw().includes(" ") && quotesIfNeeded ? "\"" + columnId.getRaw() + "\"" : columnId.getRaw()) : javaReplace(columnId.getRaw(), " ", ".");
    }

    private static convertColumnToR(column: Column, tableType: ConvertFromR.TableType): RValue
    {
        const dataTypeValue = column.getType();
        const length = column.getLength();
        try
        {
            return ConvertToR.convertListToR(dataTypeValue, length, tableType === ConvertFromR.TableType.TIBBLE);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            throw new UserException("Failed to convert column to R of type " + column.getType().getType().toDisplay(true) + " because: " + e.message, e);
        }
    }

    // (Java: private, but used by the visitor below, which is an anonymous class in Java)
    public static convertListToR(dataTypeValue: DataTypeValue, length: number, allowSubLists: boolean): RValue
    {
        return dataTypeValue.applyGet(new ConvertListToRVisitor(length, allowSubLists));
    }

    public static temporalVector(dateTimeInfo: DateTimeInfo, values: readonly (TemporalAccessor | null)[]): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                if (dateTimeInfo.getType() === DateTimeInfo.DateTimeType.DATETIMEZONED && values.length !== 0)
                {
                    // If no non-NA, won't matter:
                    const firstPresent = values.find(v => v !== null) ?? null;
                    const zone = firstPresent !== null ? (firstPresent as ZonedDateTime).zone() : javaSystemDefaultZone();

                    return visitor.visitTemporalList(dateTimeInfo.getType(), Utility.mapListI(values, mv => mv === null ? null : DataTypeUtility.valueZonedDateTime((mv as ZonedDateTime).withZoneSameInstant(zone))), RUtility.makeClassAttributes("POSIXct", new Map([["tzone", RUtility.stringVector(zone.toString())]])));
                }
                else if (dateTimeInfo.getType() === DateTimeInfo.DateTimeType.TIMEOFDAY)
                    return visitor.visitTemporalList(dateTimeInfo.getType(), values, null);
                else
                    return visitor.visitTemporalList(dateTimeInfo.getType(), values, RUtility.makeClassAttributes("Date", new Map()));
            },
        };
    }

    public static getIfInteger(n: Decimal): number | null
    {
        return Utility.withNumberInt<number | null>(n, l => {
            if (BigInt.asIntN(32, l) !== l)
                return null;
            return Number(l);
        }, _bd => {
            // Java: bd.intValueExact(), which fails for any number which is not a whole number in
            // int range (and every whole number in long range goes to the callback above)
            return null;
        });
    }
}

class ConvertListToRVisitor implements DataTypeVisitorGet<RValue>
{
    public constructor(private readonly length: number, private readonly allowSubLists: boolean)
    {
    }

    public number(g: GetValue<Decimal>, _displayInfo: NumberInfo): RValue
    {
        const length = this.length;
        // Need to work out if they are all ints, otherwise must use doubles.
        // Start with ints and go from there
        const ints: number[] = new Array<number>(length).fill(0);
        let i: number;
        for (i = 0; i < length; i++)
        {
            const n = g.get(i);
            const nInt = ConvertToR.getIfInteger(n);
            if (nInt !== null)
                ints[i] = nInt;
            else
                break;
        }
        if (i === length)
            return RUtility.intVector(ints, null);

        // Convert all ints to doubles:
        const doubles: number[] = new Array<number>(length).fill(0);
        for (let j = 0; j < i; j++)
        {
            doubles[j] = ints[j]!;
        }
        for (; i < length; i++)
        {
            doubles[i] = doubleValue(Utility.toBigDecimal(g.get(i)));
        }
        return RUtility.doubleVector(doubles, null);
    }

    public text(g: GetValue<string>): RValue
    {
        const list: (string | null)[] = [];
        for (let i = 0; i < this.length; i++)
        {
            list.push(g.get(i));
        }
        return RUtility.stringVector(list, null);
    }

    public bool(g: GetValue<boolean>): RValue
    {
        const bools: boolean[] = [];
        for (let i = 0; i < this.length; i++)
        {
            bools.push(g.get(i));
        }
        return RUtility.logicalVector(bools, null, null);
    }

    public date(dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): RValue
    {
        const values: (TemporalAccessor | null)[] = [];
        for (let i = 0; i < this.length; i++)
        {
            values.push(g.get(i));
        }
        return ConvertToR.temporalVector(dateTimeInfo, values);
    }

    public tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): RValue
    {
        const length = this.length;
        if (tagTypes.length === 1)
        {
            const onlyTag = tagTypes[0]!;
            const onlyTagInner = onlyTag.getInner();
            if (onlyTagInner !== null)
            {
                // Flatten by ignoring taggedness:
                return onlyTagInner.fromCollapsed(GetValue.of((i, prog) => {
                    const inner = g.getWithProgress(i, prog).getInner();
                    if (inner === null)
                        throw new InternalException("Null inner value on tag with inner type");
                    return inner;
                })).applyGet(this);
            }
        }
        if (tagTypes.length === 2)
        {
            let onlyInner: DataType | null = null;
            if (tagTypes[0]!.getInner() !== null && tagTypes[1]!.getInner() === null)
                onlyInner = tagTypes[0]!.getInner();
            else if (tagTypes[0]!.getInner() === null && tagTypes[1]!.getInner() !== null)
                onlyInner = tagTypes[1]!.getInner();
            if (onlyInner !== null)
            {
                // Can convert to equivalent of maybe; inner plus missing values as NA:
                const inners: (Value | null)[] = [];
                for (let i = 0; i < length; i++)
                {
                    const taggedValue = g.get(i);
                    if (taggedValue.getInner() !== null)
                        inners.push(taggedValue.getInner());
                    else
                        inners.push(null);
                }
                const visitor: DataTypeVisitorEx<RValue> = {
                    number(_numberInfo: NumberInfo): RValue
                    {
                        return RUtility.doubleVector(inners.map(mn => mn === null ? NaN : doubleValue(Utility.toBigDecimal(mn as Decimal))), null);
                    },

                    text(): RValue
                    {
                        return RUtility.stringVector(Utility.mapListI(inners, v => v === null ? null : v as string), null);
                    },

                    date(dateTimeInfo: DateTimeInfo): RValue
                    {
                        switch (dateTimeInfo.getType())
                        {
                            case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                                return RUtility.dateVector(inners.map(md => md === null ? NaN : (md as LocalDate).toEpochDay()), RUtility.makeClassAttributes("Date", new Map()));
                            case DateTimeInfo.DateTimeType.YEARMONTH:
                                return RUtility.dateVector(inners.map(md => md === null ? NaN : (md as YearMonth).atDay(1).toEpochDay()), RUtility.makeClassAttributes("Date", new Map()));
                            case DateTimeInfo.DateTimeType.TIMEOFDAY:
                                return RUtility.doubleVector(inners.map(mn => mn === null ? NaN : (mn as LocalTime).toNanoOfDay() / 1_000_000_000.0), null);
                            case DateTimeInfo.DateTimeType.DATETIMEZONED:
                                return RUtility.dateTimeZonedVector(inners.map(md => {
                                    if (md === null)
                                        return NaN;
                                    const zdt = md as ZonedDateTime;
                                    return zdt.toEpochSecond() + (zdt.nano() / 1_000_000_000.0);
                                }), RUtility.makeClassAttributes("POSIXct", new Map()));
                            case DateTimeInfo.DateTimeType.DATETIME:
                                return RUtility.dateTimeZonedVector(inners.map(md => {
                                    if (md === null)
                                        return NaN;
                                    const ldt = md as LocalDateTime;
                                    const seconds = ldt.toEpochSecond(ZoneOffset.UTC) + ldt.nano() / 1_000_000_000.0;
                                    return seconds;
                                }), RUtility.makeClassAttributes("POSIXct", new Map()));
                        }
                        throw new InternalException("Unsupported date-time type: " + javaEnumName(DateTimeInfo.DateTimeType, dateTimeInfo.getType()));
                    },

                    bool(): RValue
                    {
                        return RUtility.logicalVector(inners.map(mb => DataTypeUtility.unvalue((mb ?? false) as boolean)), inners.map(b => b === null), null);
                    },

                    tagged(_innerTypeName: TypeId, _innerTypeVars: readonly Either<Unit, DataType>[], innerTags: readonly TagType<DataType>[]): RValue
                    {
                        if (innerTags.every(tt => tt.getInner() === null))
                        {
                            const vals: number[] = new Array<number>(length).fill(0);
                            for (let i = 0; i < length; i++)
                            {
                                const val = g.get(i);
                                if (val.getTagIndex() === 0)
                                    vals[i] = RUtility.NA_AS_INTEGER;
                                else
                                {
                                    const valInner = val.getInner();
                                    if (valInner === null)
                                        throw new InternalException("Null inner value of present optional value in row " + i);
                                    vals[i] = Utility.cast(valInner, TaggedValue).getTagIndex() + 1;
                                }
                            }

                            // Convert to factors:
                            return {
                                visit<T>(visitor: RVisitor<T>): T
                                {
                                    return visitor.visitFactorList(vals, Utility.mapListI(innerTags, tt => tt.getName()));
                                },
                            };
                        }

                        throw new UserException("Nested tagged types are not supported");
                    },

                    record(_fields: ReadonlyMap<ExpressionIdentifier, DataType>): RValue
                    {
                        throw new UserException("Records are not supported in R");
                    },

                    array(_inner: DataType): RValue
                    {
                        throw new UserException("Lists are not supported in R");
                    },
                };
                return onlyInner.apply(visitor);
            }
        }
        if (tagTypes.every(tt => tt.getInner() === null))
        {
            const vals: number[] = new Array<number>(length).fill(0);
            for (let i = 0; i < length; i++)
            {
                vals[i] = g.get(i).getTagIndex() + 1;
            }

            // Convert to factors:
            return {
                visit<T>(visitor: RVisitor<T>): T
                {
                    return visitor.visitFactorList(vals, Utility.mapListI(tagTypes, tt => tt.getName()));
                },
            };
        }

        throw new UserException("Cannot convert complex tagged type " + typeName.getRaw() + " to R");
    }

    public record(types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): RValue
    {
        if (this.allowSubLists)
        {
            const listOfRecords: RValue[] = [];
            for (let outer = 0; outer < this.length; outer++)
            {
                const outerValue = g.get(outer);
                const content = outerValue.getFullContent();

                const fieldNames: (string | null)[] = [];
                const fieldValues: RValue[] = [];

                const orderedKeys = new TreeSet<ExpressionIdentifier>(content.keys());
                for (const name of orderedKeys)
                {
                    const fieldType = types.get(name) ?? null;
                    if (fieldType === null)
                        throw new InternalException("Could not find type for field: \"" + name + "\"");
                    fieldValues.push(RUtility.getListItem(ConvertToR.convertListToR(fieldType.fromCollapsed(GetValue.of((_i, _prog) => content.get(name)!)), 1, this.allowSubLists), 0));
                    fieldNames.push(name);
                }
                listOfRecords.push(RUtility.genericVector(fieldValues, RUtility.pairListFromMap(new Map([["names", RUtility.stringVector(fieldNames, null)]])), false));
            }
            return RUtility.genericVector(listOfRecords, null, false);
        }
        throw new UserException("Cannot convert records to R");
    }

    public array(inner: DataType, g: GetValue<ListEx>): RValue
    {
        if (this.allowSubLists)
        {
            const listOfLists: RValue[] = [];
            for (let outer = 0; outer < this.length; outer++)
            {
                const outerValues = g.get(outer);
                listOfLists.push(ConvertToR.convertListToR(inner.fromCollapsed(GetValue.of((innerIndex, _prog) => outerValues.get(innerIndex))), outerValues.size(), true));
            }
            return RUtility.genericVector(listOfLists, null, false);
        }
        throw new UserException("Cannot convert lists to R");
    }
}
