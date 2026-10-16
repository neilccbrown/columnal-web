// Port of xyz.columnal.data.datatype.DataTypeUtility (types module).
// The nested classes PositionedUserException, StringView and ComparableValue and the nested
// interface Truncater are top-level exports.
import type { ExpressionIdentifier, UnitIdentifier, UserIndex } from "../../../anns/Annotations.js";
import { Decimal, fitsLong, intValue, longValue, toBigInteger, toJavaString, toPlainString } from "../../../java/JavaBigDecimal.js";
import { javaStringCompare, type Comparable, type Comparator } from "../../../java/JavaObject.js";
import { HashSet } from "../../../java/HashMap.js";
import { javaListGet } from "../../../java/JavaCollections.js";
import { IndexOutOfBoundsException } from "../../../java/JavaExceptions.js";
import {
    isDateTimeException,
    LocalDate,
    LocalDateTime,
    LocalTime,
    ParsePosition,
    parseFromPosition,
    DateTimeParseException,
    YearMonth,
    ZonedDateTime,
    type DateTimeFormatter,
    type TemporalAccessor as JsJodaTemporalAccessor,
} from "../../../java/time/JavaTime.js";
import { isTemporalAccessor, type TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { Log } from "../../../utility/log/Log.js";
import { ParseProgress } from "../../../utility/utility/ParseProgress.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { UnitType } from "../../../utility/utility/UnitType.js";
import { javaClassName, ListEx, ListExList, Record, RecordMap, Utility, ValueFunctionBase } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { Unit } from "../unit/Unit.js";
import { DataType, FlatDataTypeVisitor, SpecificDataTypeVisitor, type DataTypeVisitorEx, type TagType } from "./DataType.js";
import { DateTimeInfo } from "./DateTimeInfo.js";
import type { NumberInfo } from "./NumberInfo.js";
import type { TypeId } from "./TypeId.js";

/**
 * Created by neil on 22/11/2016.
 */
export class DataTypeUtility
{
    /*
    public static @Value Object generateExample(DataType type, int index) throws UserException, InternalException
    { ... }
    */

    public static requireInteger(o: Value): number
    {
        return Utility.withNumber<number>(o, l => {
            // Java: l.longValue() != l.intValue()
            if (BigInt.asIntN(32, l) !== l)
                throw new UserException("Number too large: " + l.toString());
            return DataTypeUtility.value(Number(l));
        }, bd => {
            // Java: bd.intValueExact(), which throws ArithmeticException
            if (!bd.isInteger() || !fitsLong(bd) || BigInt.asIntN(32, longValue(bd)) !== longValue(bd))
                throw new UserException("Number not an integer or too large: " + toJavaString(bd));
            return DataTypeUtility.value(intValue(bd));
        });
    }

    public static userIndex(value: Value): UserIndex
    {
        const integer = DataTypeUtility.requireInteger(value);
        return integer;
    }

    public static unvalue<T>(v: T): T
    {
        return v;
    }

    /**
     * Java has many overloads of value(x), which just mark a plain value as a @Value (here
     * the identity), plus:
     *  - value(List<@Value Object>), which wraps the list in a ListExList
     *  - value(DateTimeInfo dest, TemporalAccessor t), which converts t to dest's type, or null
     */
    public static value<T extends Value | number>(v: T): T;
    public static value(list: readonly Value[]): ListEx;
    public static value(dest: DateTimeInfo, t: JsJodaTemporalAccessor): TemporalAccessor | null;
    public static value(a: unknown, t?: JsJodaTemporalAccessor): unknown
    {
        if (a instanceof DateTimeInfo)
            return DataTypeUtility.valueTemporal(a, t!);
        if (Array.isArray(a))
            return new ListExList(a as Value[]);
        return a;
    }

    public static valueDate(t: LocalDate): TemporalAccessor
    {
        return t as unknown as TemporalAccessor;
    }

    public static valueTime(t: LocalTime): TemporalAccessor
    {
        return t as unknown as TemporalAccessor;
    }

    public static valueZonedDateTime(t: ZonedDateTime): TemporalAccessor
    {
        return t as unknown as TemporalAccessor;
    }

    // Java: value(DateTimeInfo dest, TemporalAccessor t)
    private static valueTemporal(dest: DateTimeInfo, t: JsJodaTemporalAccessor): TemporalAccessor | null
    {
        // The java.time types are all Comparable:
        const v = (x: JsJodaTemporalAccessor): TemporalAccessor => x as unknown as TemporalAccessor;
        try
        {
            switch (dest.getType())
            {
                case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                    if (t instanceof LocalDate)
                        return v(t);
                    else
                        return v(LocalDate.from(t));
                case DateTimeInfo.DateTimeType.YEARMONTH:
                    if (t instanceof YearMonth)
                        return v(t);
                    else
                        return v(YearMonth.from(t));
                case DateTimeInfo.DateTimeType.TIMEOFDAY:
                    if (t instanceof LocalTime)
                        return v(t);
                    else
                        return v(LocalTime.from(t));
            /*
            case TIMEOFDAYZONED:
                if (t instanceof OffsetTime)
                    return t;
                else
                    return OffsetTime.from(t);
            */
                case DateTimeInfo.DateTimeType.DATETIME:
                    if (t instanceof LocalDateTime)
                        return v(t);
                    else if (t instanceof LocalDate) // This is mainly for R import help
                        return v(LocalDateTime.of(t, LocalTime.MIN));
                    else
                        return v(LocalDateTime.from(t));
                case DateTimeInfo.DateTimeType.DATETIMEZONED:
                    if (t instanceof ZonedDateTime)
                        return v(t);
                    else
                        return v(ZonedDateTime.from(t));
            }
        }
        catch (e)
        {
            if (!isDateTimeException(e))
                throw e;
            // Just return null, then
        }
        return null;
    }

    // If zone is already normalised, original will be returned
    private static normalizeZoneId(from: ZonedDateTime): ZonedDateTime
    {
        const z = from.zone();
        const n = z.normalized();
        if (z.equals(n))
            return from;
        else
            return ZonedDateTime.of(from.toLocalDateTime(), n);
    }

    public static valueImmediate(list: readonly Value[]): ListEx
    {
        return new ListExList(list);
    }

    public static _test_valueToString(item: Value): string
    {
        if (typeof item === "string")
        {
            return "\"" + GrammarUtility.escapeChars(item) + "\"";
        }
        else if (Decimal.isDecimal(item))
        {
            return Utility.numberToString(item);
        }
        return String(item);
    }

    // Java has valueToString(item) and valueToString(item, asExpressionOfType, surroundedByBrackets, truncater)
    // If asExpressionOfType != null, convert to Expression, else convert just to value
    public static valueToString(item: Value, asExpressionOfType: DataType | null = null, surroundedByBrackets: boolean = false, truncater: DataTypeUtility.Truncater | null = null): string
    {
        if (Decimal.isDecimal(item))
        {
            return DataTypeUtility.numberToString(item, asExpressionOfType, truncater);
        }
        else if (typeof item === "string")
        {
            return "\"" + GrammarUtility.escapeChars(item) + "\"";
        }
        else if (typeof item === "boolean")
        {
            return String(item);
        }
        else if (isTemporalAccessor(item))
        {
            return DataTypeUtility.temporalToString(item, asExpressionOfType);
        }
        else if (item instanceof TaggedValue)
        {
            const tv = item;
            const asExpressionOfTaggedType = asExpressionOfType === null ? null : asExpressionOfType.apply(new class extends SpecificDataTypeVisitor<Pair<TypeId, readonly TagType<DataType>[]>>
            {
                public override tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Pair<TypeId, readonly TagType<DataType>[]>
                {
                    return new Pair<TypeId, readonly TagType<DataType>[]>(typeName, tags);
                }
            }());
            const tagName = (asExpressionOfTaggedType !== null ? ("tag\\\\" + asExpressionOfTaggedType.getFirst().getRaw() + "\\") : "") + tv.getTagName();
            const tvInner = tv.getInner();
            if (tvInner !== null)
            {
                const typeInner = asExpressionOfTaggedType === null ? null : Utility.getI(asExpressionOfTaggedType.getSecond(), tv.getTagIndex()).getInner();
                if (asExpressionOfTaggedType !== null)
                    return "@call " + tagName + "(" + DataTypeUtility.valueToString(tvInner, typeInner, true, truncater) + ")";
                else
                    return tagName + "(" + DataTypeUtility.valueToString(tvInner, null, true, truncater) + ")";
            }
            else
            {
                return tagName;
            }
        }
        else if (item instanceof Record)
        {
            const record = item;
            let s = "";
            if (!surroundedByBrackets)
                s += "(";
            let first = true;
            const fieldTypes = asExpressionOfType === null ? null : asExpressionOfType.apply(new class extends SpecificDataTypeVisitor<ReadonlyMap<ExpressionIdentifier, DataType>>
            {
                public override record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ReadonlyMap<ExpressionIdentifier, DataType>
                {
                    return fields;
                }
            }());
            for (const [key, value] of [...record.getFullContent()].sort((a, b) => javaStringCompare(a[0], b[0])))
            {
                if (!first)
                    s += ", ";
                first = false;
                s += key + ": ";
                s += DataTypeUtility.valueToString(value, fieldTypes === null ? null : Utility.get(fieldTypes, key), false, truncater);
            }
            if (!surroundedByBrackets)
                s += ")";
            return s;
        }
        else if (item instanceof ListEx)
        {
            let s = "[";
            const listEx = item;
            for (let i = 0; i < listEx.size(); i++)
            {
                if (i !== 0)
                    s += ", ";
                const innerType = asExpressionOfType === null ? null : asExpressionOfType.apply(new class extends SpecificDataTypeVisitor<DataType>
                {
                    public override array(inner: DataType): DataType
                    {
                        return inner;
                    }
                }());
                s += DataTypeUtility.valueToString(listEx.get(i), innerType, false, truncater);
            }
            return s + "]";
        }
        else if (item instanceof ValueFunctionBase)
        {
            return "<function>";
        }
        else
        {
            throw new InternalException("Unknown internal type: " + javaClassName(item));
        }
    }

    /** Java: launders the Simulation thread requirement; here the same as valueToString(item). */
    public static valueToStringFX(item: Value): string
    {
        return Utility.launderSimulationEx(() => DataTypeUtility.valueToString(item));
    }

    public static numberToString(item: Value, asExpressionOfType: DataType | null, truncater: DataTypeUtility.Truncater | null): string
    {
        let number: string;
        if (truncater !== null)
        {
            const cast = Utility.cast(item, Decimal);
            number = truncater.truncateNumber(cast);
        }
        else
        {
            // Java: a BigDecimal is shown as an integer or plain decimal; a Long with toString
            const d = Utility.cast(item, Decimal);
            if (Utility.isIntegral(d))
            {
                number = toBigInteger(d).toString();
            }
            else
                number = toPlainString(d);
        }
        const asExpressionOfUnit = asExpressionOfType === null ? null : asExpressionOfType.apply(new class extends SpecificDataTypeVisitor<Unit>
        {
            public override number(displayInfo: NumberInfo): Unit
            {
                return displayInfo.getUnit();
            }
        }());
        return number + (asExpressionOfUnit !== null && !asExpressionOfUnit.equals(Unit.SCALAR) ? "{" + asExpressionOfUnit.toString() + "}" : "");
    }

    public static temporalToString(t: TemporalAccessor, asExpressionOfType: DataType | null): string
    {
        let type: DateTimeInfo.DateTimeType;
        if (t instanceof LocalDate)
        {
            type = DateTimeInfo.DateTimeType.YEARMONTHDAY;
        }
        else if (t instanceof YearMonth)
        {
            type = DateTimeInfo.DateTimeType.YEARMONTH;
        }
        else if (t instanceof LocalTime)
        {
            type = DateTimeInfo.DateTimeType.TIMEOFDAY;
        }
        else if (t instanceof LocalDateTime)
        {
            type = DateTimeInfo.DateTimeType.DATETIME;
        }
        else if (t instanceof ZonedDateTime)
        {
            type = DateTimeInfo.DateTimeType.DATETIMEZONED;
        }
        else
        {
            throw new InternalException("Unknown internal temporal type: " + javaClassName(t));
        }
        const dateTimeInfo = new DateTimeInfo(type);
        const s = dateTimeInfo.getStrictFormatter().format(t);
        if (asExpressionOfType !== null)
            return DateTimeInfo.DateTimeType.literalPrefix(dateTimeInfo.getType()) + "{" + s + "}";
        else
            return s;
    }

    public static makeDefaultTaggedValue<DT extends DataType>(tagTypes: readonly TagType<DT>[]): TaggedValue
    {
        const noInnerIndex = Utility.findFirstIndex(tagTypes, tt => tt.getInner() === null);
        if (noInnerIndex !== null)
        {
            return TaggedValue.immediate(noInnerIndex, null, DataTypeUtility.fromTags(tagTypes));
        }
        else
        {
            const inner = javaListGet(tagTypes, 0).getInner();
            if (inner === null)
                throw new InternalException("Impossible: no tags without inner value, yet no inner value!");
            return TaggedValue.immediate(0, DataTypeUtility.makeDefaultValue(inner), DataTypeUtility.fromTags(tagTypes));
        }
    }

    public static makeDefaultValue(dataType: DataType): Value
    {
        return dataType.apply<Value>({
            number(_numberInfo: NumberInfo): Value
            {
                return DataTypeUtility.value(new Decimal(0));
            },

            text(): Value
            {
                return DataTypeUtility.value("");
            },

            date(dateTimeInfo: DateTimeInfo): Value
            {
                return dateTimeInfo.getDefaultValue() as unknown as TemporalAccessor;
            },

            bool(): Value
            {
                return DataTypeUtility.value(false);
            },

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Value
            {
                return DataTypeUtility.makeDefaultTaggedValue(tags);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Value
            {
                const values = new Map<ExpressionIdentifier, Value>();
                for (const [key, value] of fields)
                {
                    values.set(key, DataTypeUtility.makeDefaultValue(value));
                }
                return RecordMap.immediate(values);
            },

            array(_inner: DataType | null): Value
            {
                return DataTypeUtility.valueImmediate([]);
            },
        });
    }

    /**
     * Fetches a ListEx from the simulation thread and returns it as a flat list on the FX thread.
     * PORT-NOTE: there is only one thread, so this reads the list directly (Java ran the fetch on
     * the worker thread and waited for it).  Errors are wrapped in an InternalException, as in Java.
     */
    public static fetchList(simList: ListEx): Value[]
    {
        try
        {
            const r: Value[] = [];
            for (let i = 0; i < simList.size(); i++)
            {
                r.push(simList.get(i));
            }
            return r;
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            throw new InternalException("Error fetching list", e);
        }
    }

    public static parseTemporalFlexible(dateTimeInfo: DateTimeInfo, src: DataTypeUtility.StringView): TemporalAccessor
    {
        src.skipSpaces();
        const formatters: DateTimeFormatter[] = dateTimeInfo.getFlexibleFormatters().flatMap(l => l);
        // Updated char position and return value:
        const possibles: Pair<number, TemporalAccessor>[] = [];
        const wrapped = Utility.wrapPreprocessDate(src.getParseProgress().src, src.getParseProgress().curCharIndex);
        // PORT-NOTE: Java passes the wrapped CharSequence to the formatter, which reads it lazily;
        // js-joda needs a string.  The wrapper's length() can count a final character whose
        // charAt throws (in Java too), when the text ends with punctuation, as in "[2020-07-21)]".
        // Java's formatters don't read that far after a date, so the string stops before it.
        let wrappedText = "";
        const wrappedLength = wrapped.length();
        try
        {
            for (let i = 0; i < wrappedLength; i++)
                wrappedText += wrapped.charAt(i);
        }
        catch (e)
        {
            if (!(e instanceof IndexOutOfBoundsException))
                throw e;
        }
        const possibleFormatters: DateTimeFormatter[] = [];
        for (const formatter of formatters)
        {
            try
            {
                const position = new ParsePosition(src.getParseProgress().curCharIndex);
                const temporalAccessor = parseFromPosition(formatter, wrappedText, position);
                const value = DataTypeUtility.value(dateTimeInfo, temporalAccessor);
                if (value !== null)
                {
                    possibles.push(new Pair(wrapped.translateWrappedToOriginalPos(position.getIndex()), value));
                    possibleFormatters.push(formatter);
                }
            }
            catch (e)
            {
                if (!(e instanceof DateTimeParseException))
                    throw e;
                // Try next one
            }
        }

        if (possibles.length === 1)
        {
            src.setPosition(possibles[0]!.getFirst());
            const value = DataTypeUtility.value(dateTimeInfo, possibles[0]!.getSecond());
            if (value !== null)
                return value;
        }
        else if (possibles.length > 1)
        {
            // Java: Collections.sort (stable) with Pair.comparatorFirst
            const possiblesByLength = [...possibles].sort(Pair.comparatorFirst<number, TemporalAccessor>());
            // Choose the longest one, if it's strictly longer than the others:
            const longest = possiblesByLength[possiblesByLength.length - 1]!.getFirst();
            if (longest > possiblesByLength[possiblesByLength.length - 2]!.getFirst())
            {
                const chosen = possiblesByLength[possiblesByLength.length - 1]!;
                src.setPosition(chosen.getFirst());
                const value = DataTypeUtility.value(dateTimeInfo, chosen.getSecond());
                if (value !== null)
                    return value;
            }
            // If all the values of longest length are the same, that's fine:
            // (Java: StreamEx.distinct(keyExtractor), which keeps the first with each key)
            const distinctValues: Pair<number, TemporalAccessor>[] = [];
            const seenKeys = new HashSet<Pair<number, TemporalAccessor>>();
            for (const p of possibles.filter(p => p.getFirst() === longest))
            {
                // Time zones are annoying because UTC can parse as UTC or Etc/UTC but they are both the same when
                // normalized so we normalize while checking for distinct values:
                const key = p.mapSecond(t => t instanceof ZonedDateTime ? DataTypeUtility.normalizeZoneId(t) as unknown as TemporalAccessor : t);
                if (seenKeys.add(key))
                    distinctValues.push(p);
            }
            if (distinctValues.length === 1)
            {
                const chosen = distinctValues[0]!;
                src.setPosition(chosen.getFirst());
                const value = DataTypeUtility.value(dateTimeInfo, chosen.getSecond());
                if (value !== null)
                    return value;
            }

            // Otherwise, throw because it's too ambiguous:
            throw new DataTypeUtility.PositionedUserException(String(distinctValues.length) + " ways to interpret " + dateTimeInfo.toString() + " value "
                + src.snippet() + ": "
                + Utility.listToString(Utility.mapList(possibles, p => p.getSecond()))
                + " using formatters "
                + Utility.listToString(possibleFormatters), src.getPosition());
        }
        //Log.debug("Wrapped: " + wrapped.toString() + " matches: " + possibles.size());
        throw new DataTypeUtility.PositionedUserException("Expected " + DataType.date(dateTimeInfo).toString() + " value but found: " + src.snippet(), src.getPosition());
    }

    // Java wraps any InternalException/UserException from comparing in a RuntimeException
    public static getValueComparator(): Comparator<Value>
    {
        return (a: Value, b: Value) => {
            return Utility.compareValues(a, b);
        };
    }

    public static isNumber(type: DataType): boolean
    {
        try
        {
            return type.apply<boolean>(new class extends FlatDataTypeVisitor<boolean>
            {
                public override number(_numberInfo: NumberInfo): boolean
                {
                    return true;
                }
            }(false));
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return false;
        }
    }

    public static getTaggedTypeName(type: DataType): TypeId
    {
        return type.apply<TypeId>(new class extends SpecificDataTypeVisitor<TypeId>
        {
            public override tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): TypeId
            {
                return typeName;
            }
        }());
    }

    public static getTagTypes(type: DataType): readonly TagType<DataType>[]
    {
        return type.apply<readonly TagType<DataType>[]>(new class extends SpecificDataTypeVisitor<readonly TagType<DataType>[]>
        {
            public override tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): readonly TagType<DataType>[]
            {
                return tags;
            }
        }());
    }

    /**
     * Returns a predicate that checks whether the unit is featured anywhere
     * in the given types (incl transitively)
     */
    public static featuresUnit(dataTypes: readonly DataType[]): (unit: UnitIdentifier) => boolean
    {
        // Pre-calculate set of all units contained by the given types:
        const allUnits = new Set<UnitIdentifier>();
        try
        {
            for (const dataType of dataTypes)
            {
                const visitor: DataTypeVisitorEx<UnitType> = {
                    number(numberInfo: NumberInfo): UnitType
                    {
                        addUnit(numberInfo.getUnit());
                        return UnitType.UNIT;
                    },

                    text(): UnitType
                    {
                        return UnitType.UNIT;
                    },

                    date(_dateTimeInfo: DateTimeInfo): UnitType
                    {
                        return UnitType.UNIT;
                    },

                    bool(): UnitType
                    {
                        return UnitType.UNIT;
                    },

                    tagged(_typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): UnitType
                    {
                        for (const typeVar of typeVars)
                        {
                            typeVar.ifLeft(addUnit);
                        }
                        for (const tag of tags)
                        {
                            tag.getInner()?.apply(visitor);
                        }
                        return UnitType.UNIT;
                    },

                    record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): UnitType
                    {
                        for (const value of fields.values())
                        {
                            value.apply(visitor);
                        }
                        return UnitType.UNIT;
                    },

                    array(inner: DataType): UnitType
                    {
                        inner.apply(visitor);
                        return UnitType.UNIT;
                    },
                };
                dataType.apply(visitor);
            }
            return u => allUnits.has(u);
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            // If in doubt, include all types:
            return _u => true;
        }

        function addUnit(unit: Unit): void
        {
            for (const u of unit.getDetails().keys())
                allUnits.add(u.getName());
        }
    }

    /**
     * Returns a predicate that checks whether the tagged type is featured anywhere
     * in the given types (incl transitively)
     */
    public static featuresTaggedType(dataTypes: readonly DataType[]): (typeId: TypeId) => boolean
    {
        // Pre-calculate set of all types contained within the given types:
        const allTypes = new HashSet<TypeId>();
        try
        {
            for (const dataType of dataTypes)
            {
                const visitor: DataTypeVisitorEx<UnitType> = {
                    number: () => UnitType.UNIT,
                    text: () => UnitType.UNIT,
                    date: () => UnitType.UNIT,
                    bool: () => UnitType.UNIT,

                    tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): UnitType
                    {
                        allTypes.add(typeName);
                        for (const tag of tags)
                        {
                            tag.getInner()?.apply(visitor);
                        }
                        return UnitType.UNIT;
                    },

                    record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): UnitType
                    {
                        for (const value of fields.values())
                        {
                            value.apply(visitor);
                        }
                        return UnitType.UNIT;
                    },

                    array(inner: DataType): UnitType
                    {
                        inner.apply(visitor);
                        return UnitType.UNIT;
                    },
                };
                dataType.apply(visitor);
            }
            return t => allTypes.has(t);
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            // If in doubt, include all types:
            return _u => true;
        }
    }

    public static fromTags<T>(tags: readonly TagType<T>[]): TaggedValue.TaggedTypeDefinitionBase
    {
        return {
            getTagName: (tagIndex: number) => {
                if (tagIndex >= 0 && tagIndex < tags.length)
                    return tags[tagIndex]!.getName();
                return "InvalidTag" + (tagIndex < 0 ? "Neg" : "") + Math.abs(tagIndex);
            },
        };
    }
}

export namespace DataTypeUtility
{
    export interface Truncater
    {
        truncateNumber(number: Decimal): string;
        // TODO also allow list truncation
    }

    export class PositionedUserException extends UserException
    {
        private readonly position: number;

        public constructor(message: string, position: number)
        {
            super(message);
            this.position = position;
        }

        public getPosition(): number
        {
            return this.position;
        }
    }

    // Keeps track of a trailing substring of a string.  Saves memory compared to copying
    // the substrings over and over.  The data is immutable, the position is mutable.  Wraps ParseProgress
    // (Java also has a whiteSpaceCategories list here, which is unused.)
    export class StringView
    {
        private parseProgress: ParseProgress;

        // Java has (String) and (ParseProgress) constructors
        public constructor(s: string | ParseProgress)
        {
            this.parseProgress = typeof s === "string" ? ParseProgress.fromStart(s) : s;
        }

        // Tries to read the given literal, having skipped any spaces at current position.
        // If found, the string is consumed and true is returned. If not found, the spaces
        // are still consumed, and false is returned.
        public tryRead(literal: string): boolean
        {
            this.skipSpaces();
            const attempt = this.parseProgress.consumeNext(literal);
            if (attempt === null)
                return false;
            this.parseProgress = attempt;
            return true;
        }

        public tryReadIgnoreCase(literal: string): boolean
        {
            this.skipSpaces();
            const attempt = this.parseProgress.consumeNextIC(literal);
            if (attempt === null)
                return false;
            this.parseProgress = attempt;
            return true;
        }

        public skipSpaces(): void
        {
            this.parseProgress = this.parseProgress.skipSpaces();
        }

        // TODO use styledstring here
        public snippet(): string
        {
            let s = "";
            // Add prefix:
            s += "\"" + this.parseProgress.src.substring(Math.max(0, this.parseProgress.curCharIndex - 20), this.parseProgress.curCharIndex) + ">>>";
            return s + this.parseProgress.src.substring(this.parseProgress.curCharIndex, Math.min(this.parseProgress.curCharIndex + 40, this.parseProgress.src.length)) + "\"";
        }

        // Reads up until that character, and also consumes that character
        // Returns null if end of string is found first
        public readUntil(c: string): string | null
        {
            const p = this.parseProgress.consumeUpToAndIncluding("" + c);
            if (p !== null)
            {
                this.parseProgress = p.getSecond();
                return p.getFirst();
            }
            return null;
        }

        // Doesn't skip spaces!
        public consumeNumbers(): string
        {
            const p = this.parseProgress.consumeNumbers();
            this.parseProgress = p.getSecond();
            return p.getFirst();
        }

        public setPosition(pos: number): void
        {
            this.parseProgress = ParseProgress.fromStart(this.parseProgress.src).skip(pos);
        }

        public getPosition(): number
        {
            return this.parseProgress.curCharIndex;
        }

        public getParseProgress(): ParseProgress
        {
            return this.parseProgress;
        }
    }

    /**
     * Things like TreeMap say that the Comparable instance should
     * be compatible with .equals, i.e. that if they compareTo equal,
     * then equals should return true.  But we have object arrays
     * which don't implement equals reasonably, and things like numbers
     * should compare equal even when they use different types.
     *
     * So this wraps an @Value Object just for the purpose of implementing
     * equals and compareTo sensibly, so you can use @Value Object as a key
     * in a TreeMap.
     */
    export class ComparableValue implements Comparable<ComparableValue>
    {
        private readonly value: Value;

        public constructor(value: Value)
        {
            this.value = value;
        }

        public hashCode(): number
        {
            // Accept hash collisions; should be using comparable implementation for maps anyway
            return 1;
        }

        public equals(obj: unknown): boolean
        {
            return obj instanceof ComparableValue && this.compareTo(obj) === 0;
        }

        public compareTo(o: ComparableValue): number
        {
            try
            {
                return Utility.compareValues(this.value, o.value);
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                // Don't want to throw, so this is best we can do:
                return -1;
            }
        }

        public getValue(): Value
        {
            return this.value;
        }

        // For debugging:
        public toString(): string
        {
            return "ComparableValue{" +
                    "value=" + DataTypeUtility._test_valueToString(this.value) +
                    "}";
        }
    }
}
