// Port of xyz.columnal.rinterop.RUtility (r-interop module; package-private in Java).
import { Decimal, decimalFromDouble, longValue } from "../../java/JavaBigDecimal.js";
import { javaListGet } from "../../java/JavaCollections.js";
import { javaDoubleToInt } from "../../java/JavaDouble.js";
import { javaStringCompare } from "../../java/JavaObject.js";
import { javaReplace } from "../../java/JavaString.js";
import { Instant, LocalDate, LocalDateTime, ZonedDateTime, ZoneId, ZoneOffset } from "../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { ListEx } from "../../utility/utility/Utility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { ConvertToR } from "./ConvertToR.js";
import type { RValue } from "./RValue.js";
import { RVisitor } from "./RVisitor.js";
import { SpecificRVisitor } from "./SpecificRVisitor.js";

import PairListEntry = RVisitor.PairListEntry;

export class RUtility
{
    public static readonly STRING_SINGLE = 9;
    public static readonly LOGICAL_VECTOR = 10;
    public static readonly INT_VECTOR = 13;
    public static readonly DOUBLE_VECTOR = 14;
    public static readonly STRING_VECTOR = 16;
    public static readonly GENERIC_VECTOR = 19;
    public static readonly PAIR_LIST = 2;
    public static readonly NIL = 254;
    public static readonly NA_AS_INTEGER = 0x80000000 | 0;
    public static readonly SYMBOL = 1;
    public static readonly CLASS_DATA_FRAME: readonly string[] = ["data.frame"];
    public static readonly CLASS_TIBBLE: readonly string[] = ["tbl_df", "tbl", "data.frame"];

    public static intVector(values: readonly number[], attributes: RValue | null): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitIntList(values, attributes);
            },
        };
    }

    public static doubleVector(values: readonly number[], attributes: RValue | null): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitDoubleList(values, attributes);
            },
        };
    }

    public static logicalVector(values: readonly boolean[], isNA: readonly boolean[] | null, attributes: RValue | null): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitLogicalList(values, isNA, attributes);
            },
        };
    }

    public static genericVector(values: readonly RValue[], attributes: RValue | null, isObject: boolean): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitGenericList(values, attributes, isObject);
            },
        };
    }

    // Java: stringVector(@Nullable String singleValue) and stringVector(ImmutableList<Optional<String>> values, @Nullable RValue attributes)
    public static stringVector(singleValue: string | null): RValue;
    public static stringVector(values: readonly (string | null)[], attributes: RValue | null): RValue;
    public static stringVector(a: string | null | readonly (string | null)[], attributes?: RValue | null): RValue
    {
        if (attributes === undefined)
            return RUtility.stringVector([a as string | null], null);
        const values = a as readonly (string | null)[];
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitStringList(values, attributes);
            },
        };
    }

    public static string(value: string | null, isSymbol: boolean): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitString(value, isSymbol);
            },
        };
    }

    public static pairListFromMap(values: ReadonlyMap<string, RValue>): RValue
    {
        return RUtility.makePairList([...values.entries()].sort((a, b) => javaStringCompare(a[0], b[0])).map(e => new PairListEntry(null, RUtility.string(e[0], true), e[1])));
    }

    public static makePairList(values: readonly PairListEntry[]): RValue
    {
        return {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitPairList(values);
            },
        };
    }

    public static getStringNN(rValue: RValue): string
    {
        return rValue.visit(new class extends SpecificRVisitor<string>
        {
            public override visitString(s: string | null, _isSymbol: boolean): string
            {
                if (s !== null)
                    return s;
                else
                    throw new UserException("Unexpected NA in internal String");
            }
        }());
    }

    public static getString(rValue: RValue): string | null
    {
        return rValue.visit(new class extends SpecificRVisitor<string | null>
        {
            public override visitString(s: string | null, _isSymbol: boolean): string | null
            {
                return s;
            }
        }());
    }

    // (Java's List.get and array indexing throw IndexOutOfBoundsException for a bad index, as javaListGet does.)
    public static getListItem(info: RValue, index: number): RValue
    {
        return info.visit(new class extends SpecificRVisitor<RValue>
        {
            public override visitStringList(values: readonly (string | null)[], _attributes: RValue | null): RValue
            {
                return RUtility.string(javaListGet(values, index), false);
            }

            public override visitGenericList(values: readonly RValue[], _attributes: RValue | null, _isObject: boolean): RValue
            {
                return javaListGet(values, index);
            }

            public override visitPairList(items: readonly PairListEntry[]): RValue
            {
                return javaListGet(items, index).item;
            }

            public override visitDoubleList(values: readonly number[], attributes: RValue | null): RValue
            {
                return RUtility.doubleVector([javaListGet(values, index)], attributes);
            }

            public override visitIntList(values: readonly number[], attributes: RValue | null): RValue
            {
                return RUtility.intVector([javaListGet(values, index)], attributes);
            }

            public override visitLogicalList(values: readonly boolean[], isNA: readonly boolean[] | null, attributes: RValue | null): RValue
            {
                return RUtility.logicalVector([javaListGet(values, index)], isNA === null ? null : [javaListGet(isNA, index)], attributes);
            }

            public override visitTemporalList(dateTimeType: DateTimeInfo.DateTimeType, values: readonly (TemporalAccessor | null)[], attributes: RValue | null): RValue
            {
                const item = javaListGet(values, index);
                return {
                    visit<T>(visitor: RVisitor<T>): T
                    {
                        return visitor.visitTemporalList(dateTimeType, [item], attributes);
                    },
                };
            }

            public override visitFactorList(values: readonly number[], levelNames: readonly string[]): RValue
            {
                const item = javaListGet(values, index);
                return {
                    visit<T>(visitor: RVisitor<T>): T
                    {
                        return visitor.visitFactorList([item], levelNames);
                    },
                };
            }
        }());
    }

    // Java: valueImmediate(int[]) and valueImmediate(boolean[])
    public static valueImmediate(values: readonly number[] | readonly boolean[]): ListEx
    {
        return DataTypeUtility.valueImmediate(values.map(v => typeof v === "boolean" ? v : new Decimal(v)));
    }

    public static isClass(attrMap: ReadonlyMap<string, RValue>, ...classNames: readonly string[]): boolean
    {
        const classRList = attrMap.get("class") ?? null;
        if (classRList === null)
            return false;
        for (let i = 0; i < classNames.length; i++)
        {
            if (classNames[i] !== RUtility.getString(RUtility.getListItem(classRList, i)))
                return false;
        }
        return true;
    }

    public static pairListToMap(attributes: RValue | null): ReadonlyMap<string, RValue>
    {
        if (attributes === null)
            return new Map();
        return new Map(Utility.pairListToMap(attributes.visit(new class extends SpecificRVisitor<Pair<string, RValue>[]>
        {
            public override visitPairList(items: readonly PairListEntry[]): Pair<string, RValue>[]
            {
                return Utility.mapListExI(items, e => {
                    if (e.tag === null)
                        throw new UserException("Missing tag name ");
                    return new Pair(RUtility.getStringNN(e.tag), e.item);
                });
            }
        }())));
    }

    // Java: makeClassAttributes(String className, ...) and makeClassAttributes(String[] className, ...)
    public static makeClassAttributes(className: string | readonly string[], otherItems: ReadonlyMap<string, RValue>): RValue
    {
        if (typeof className === "string")
            return RUtility.pairListFromMap(new Map(Utility.appendToMap(otherItems, "class", RUtility.stringVector(className), null)));
        return RUtility.pairListFromMap(new Map(Utility.appendToMap(otherItems, "class", RUtility.stringVector(className.map(s => s), null), null)));
    }

    public static dateTimeZonedVector(values: readonly number[], attr: RValue | null): RValue
    {
        const attrMap = RUtility.pairListToMap(attr);
        const tzone = attrMap.get("tzone") ?? null;
        if (tzone !== null)
        {
            const b: (TemporalAccessor | null)[] = [];
            for (const value of values)
            {
                if (Number.isNaN(value))
                    b.push(null);
                else
                {
                    const bd = RUtility.doubleToValue(value);
                    const zdt: TemporalAccessor = ZonedDateTime.ofInstant(Instant.ofEpochSecond(Number(longValue(bd)), nanoPart(bd)), ZoneId.of(RUtility.getStringNN(RUtility.getListItem(tzone, 0))));
                    b.push(zdt);
                }
            }
            return ConvertToR.temporalVector(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED), b);
        }
        else
        {
            const b: (TemporalAccessor | null)[] = [];
            for (const value of values)
            {
                if (Number.isNaN(value))
                    b.push(null);
                else
                {
                    const bd = RUtility.doubleToValue(value);
                    const ldt: TemporalAccessor = LocalDateTime.ofInstant(Instant.ofEpochSecond(Number(longValue(bd)), nanoPart(bd)), ZoneId.of("UTC"));
                    b.push(ldt);
                }
            }
            return ConvertToR.temporalVector(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME), b);
        }
    }

    public static dateVector(values: readonly number[], attr: RValue | null): RValue
    {
        if (values.every(d => Number.isNaN(d) || d === javaDoubleToInt(d)))
        {
            const dates: (TemporalAccessor | null)[] = values.map(d => {
                if (Number.isNaN(d))
                    return null;
                const date: TemporalAccessor = LocalDate.ofEpochDay(javaDoubleToInt(d));
                return date;
            });
            return {
                visit<T>(visitor: RVisitor<T>): T
                {
                    return visitor.visitTemporalList(DateTimeInfo.DateTimeType.YEARMONTHDAY, dates, attr);
                },
            };
        }
        else
        {
            const dates: (TemporalAccessor | null)[] = values.map(d => {
                if (Number.isNaN(d))
                    return null;
                const bd = RUtility.doubleToValue(d).times(new Decimal(60.0 * 60.0 * 24.0));
                // PORT-NOTE: as in Java, the nanoseconds are taken from the absolute value of the
                // fraction, so a negative time with a fraction of a second is a second out.
                const date: TemporalAccessor = LocalDateTime.ofEpochSecond(Number(longValue(bd)), Math.abs(nanoPart(bd)), ZoneOffset.UTC);
                return date;
            });
            return {
                visit<T>(visitor: RVisitor<T>): T
                {
                    return visitor.visitTemporalList(DateTimeInfo.DateTimeType.DATETIME, dates, attr);
                },
            };
        }
    }

    public static doubleToValue(value: number): Decimal
    {
        // Go through Double.toString which zeroes out the boring end part:
        return decimalFromDouble(value);
    }

    public static escapeString(original: string, addQuotes: boolean): string
    {
        // Must replace backslashes first
        let content = javaReplace(original, "\\", "\\\\");
        content = javaReplace(content, "'", "\\'");
        content = javaReplace(content, "\"", "\\\"");
        content = javaReplace(content, "\n", "\\n");
        content = javaReplace(content, "\r", "\\r");
        return addQuotes ? "\"" + content + "\"" : content;
    }
}

// Java: bd.remainder(BigDecimal.ONE).scaleByPowerOfTen(9).longValue() (the fraction's sign follows bd)
function nanoPart(bd: Decimal): number
{
    return Number(longValue(bd.minus(bd.trunc()).times(1e9)));
}
