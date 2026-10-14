// Port of the nested class xyz.columnal.data.datatype.DataType.DateTimeInfo (types module), in its
// own file.
import type { ParserRuleContext } from "antlr4ng";
import { javaTrim } from "../../../java/JavaString.js";
import type { DataParser } from "../../../parsers/generated/DataParser.js";
import type { DataParser2 } from "../../../parsers/generated/DataParser2.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { ParseException } from "../../../utility/error/parse/ParseException.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { comparing, javaStringHashCode, type Comparator } from "../../../java/JavaObject.js";
import {
    ChronoField,
    DateTimeParseException,
    JavaDateTimeFormatterBuilder,
    LocalDate,
    LocalDateTime,
    LocalTime,
    SignStyle,
    TextStyle,
    Year,
    YearMonth,
    ZonedDateTime,
    ZoneId,
    ZoneOffset,
    type DateTimeFormatter,
    type TemporalAccessor,
} from "../../../java/time/JavaTime.js";
import type { TemporalAccessor as TemporalValue } from "../../../java/time/TemporalAccessor.js";
import { DataType } from "./DataType.js";
import { DataTypeUtility } from "./DataTypeUtility.js";

export class DateTimeInfo
{
    private static readonly STRICT_FORMATTERS = new Map<DateTimeInfo.DateTimeType, DateTimeFormatter>();
    private static readonly FLEXIBLE_FORMATTERS = new Map<DateTimeInfo.DateTimeType, readonly (readonly DateTimeFormatter[])[]>();

    public getStrictFormatter(): DateTimeFormatter
    {
        let f = DateTimeInfo.STRICT_FORMATTERS.get(this.getType());
        if (f === undefined)
        {
            f = DateTimeInfo.makeFormatter(this.getType());
            DateTimeInfo.STRICT_FORMATTERS.set(this.getType(), f);
        }
        return f;
    }

    // Each inner list is a grouping that is likely to have
    // multiple matches and thus show up an ambiguous parse.
    public getFlexibleFormatters(): readonly (readonly DateTimeFormatter[])[]
    {
        const existing = DateTimeInfo.FLEXIBLE_FORMATTERS.get(this.getType());
        if (existing !== undefined)
            return existing;
        const calc = this.makeFlexibleFormatter(this.getType());
        DateTimeInfo.FLEXIBLE_FORMATTERS.set(this.getType(), calc);
        return calc;
    }

    private makeFlexibleFormatter(type: DateTimeInfo.DateTimeType): readonly (readonly DateTimeFormatter[])[]
    {
        const { m, l } = DateTimeInfo;
        const F = DateTimeInfo.F;
        const DateTimeType = DateTimeInfo.DateTimeType;
        // Shared among some branches:
        const r: (readonly DateTimeFormatter[])[] = [];
        switch (type)
        {
            case DateTimeType.YEARMONTHDAY:
                // All the formats here use space as a separator, and assume that
                // the items have been fed through the pre-process function in here.
                return [
                    l(m(" ", F.DAY, F.MONTH_TEXT_SHORT, F.YEAR4)), // dd MMM yyyy
                    l(m(" ", F.DAY, F.MONTH_TEXT_LONG, F.YEAR4)), // dd MMM yyyy

                    l(m(" ", F.MONTH_TEXT_SHORT, F.DAY, F.YEAR4)), // MMM dd yyyy
                    l(m(" ", F.MONTH_TEXT_LONG, F.DAY, F.YEAR4)), // MMM dd yyyy

                    l(m(" ", F.YEAR4, F.MONTH_TEXT_SHORT, F.DAY)), // yyyy MMM dd

                    l(m(" ", F.YEAR4, F.MONTH_NUM, F.DAY)), // yyyy MM dd

                    l(m(" ", F.DAY, F.MONTH_NUM, F.YEAR4), m(" ", F.MONTH_NUM, F.DAY, F.YEAR4)), // dd MM yyyy or MM dd yyyy

                    l(m(" ", F.DAY, F.MONTH_NUM, F.YEAR2), m(" ", F.MONTH_NUM, F.DAY, F.YEAR2)), // dd MM yy or MM dd yy
                ];
            case DateTimeType.TIMEOFDAY:
                return [
                    l(m(":", F.HOUR, F.MIN, F.SEC_OPT_FRAC_OPT)), // HH:mm[:ss[.S]]
                    l(m(":", F.HOUR12, F.MIN, F.SEC_OPT_FRAC_OPT, F.AMPM)), // hh:mm[:ss[.S]] PM
                ];
            case DateTimeType.DATETIME:
                for (const timeFormats of new DateTimeInfo(DateTimeType.TIMEOFDAY).getFlexibleFormatters())
                {
                    for (const dateFormats of new DateTimeInfo(DateTimeType.YEARMONTHDAY).getFlexibleFormatters())
                    {
                        const newFormatsSpace = Utility.allPairs(dateFormats, timeFormats, (d, t) => new JavaDateTimeFormatterBuilder().append(d).appendLiteral(" ").append(t).toFormatter());
                        const newFormatsT = Utility.allPairs(dateFormats, timeFormats, (d, t) => new JavaDateTimeFormatterBuilder().append(d).appendLiteral("T").append(t).toFormatter());
                        r.push(newFormatsSpace);
                        r.push(newFormatsT);
                    }
                }
                return r;
            case DateTimeType.YEARMONTH:
                return [
                    l(m(" ", F.MONTH_NUM, F.YEAR4)),
                    l(m(" ", F.MONTH_TEXT_SHORT, F.YEAR2)),
                    l(m(" ", F.MONTH_TEXT_SHORT, F.YEAR4)),
                    l(m(" ", F.MONTH_TEXT_LONG, F.YEAR4)),
                    l(m(" ", F.YEAR4, F.MONTH_NUM)),
                ];
            case DateTimeType.DATETIMEZONED:
                for (const dateTimeFormats of new DateTimeInfo(DateTimeType.DATETIME).getFlexibleFormatters())
                {
                    r.push(Utility.mapListI(dateTimeFormats, dateTimeFormat =>
                    {
                        const b = new JavaDateTimeFormatterBuilder();
                        b.append(dateTimeFormat);
                        b.optionalStart().appendLiteral(" ").optionalEnd();
                        b.appendZoneRegionId();
                        return b.toFormatter();
                    }));
                    r.push(Utility.mapListI(dateTimeFormats, dateTimeFormat =>
                    {
                        const b = new JavaDateTimeFormatterBuilder();
                        b.append(dateTimeFormat);
                        b.optionalStart().appendLiteral(" ").optionalEnd();
                        b.appendZoneTextJava(TextStyle.SHORT);
                        return b.toFormatter();
                    }));
                    r.push(Utility.mapListI(dateTimeFormats, dateTimeFormat =>
                    {
                        const b = new JavaDateTimeFormatterBuilder();
                        b.append(dateTimeFormat);
                        b.optionalStart().appendLiteral(" ").optionalEnd();
                        b.appendOffsetId().appendLiteral("[");
                        b.appendZoneRegionId().appendLiteral("]");
                        return b.toFormatter();
                    }));
                }
                return r;
        }
        return [[this.getStrictFormatter()]];
    }

    // public for testing
    public static m(sep: string, ...items: DateTimeInfo.F[]): DateTimeFormatter
    {
        const F = DateTimeInfo.F;
        const b = new JavaDateTimeFormatterBuilder();
        for (let i = 0; i < items.length; i++)
        {
            switch (items[i])
            {
                case F.SEC_OPT_FRAC_OPT:
                    b.optionalStart();
                    if (i !== 0) b.appendLiteral(sep);
                    b.appendValue(ChronoField.SECOND_OF_MINUTE, 2, 2, SignStyle.NEVER);
                    b.optionalStart();
                    // From http://stackoverflow.com/questions/30090710/java-8-datetimeformatter-parsing-for-optional-fractional-seconds-of-varying-sign
                    b.appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true);
                    b.optionalEnd();
                    b.optionalEnd();
                    break;
                case F.MIN:
                    if (i !== 0) b.appendLiteral(sep);
                    b.appendValue(ChronoField.MINUTE_OF_HOUR, 2, 2, SignStyle.NEVER);
                    break;
                case F.HOUR:
                    b.appendValue(ChronoField.HOUR_OF_DAY, 1, 2, SignStyle.NEVER);
                    break;
                case F.HOUR12:
                    b.appendValue(ChronoField.CLOCK_HOUR_OF_AMPM, 1, 2, SignStyle.NEVER);
                    break;
                case F.AMPM:
                    b.parseCaseInsensitive()
                        .optionalStart()
                        .appendLiteral(" ")
                        .optionalEnd();
                    // Java's appendText(field) is appendText(field, TextStyle.FULL):
                    b.appendText(ChronoField.AMPM_OF_DAY, TextStyle.FULL)
                        .parseCaseSensitive();
                    break;
                case F.DAY:
                    if (i !== 0) b.appendLiteral(sep);
                    b.appendValue(ChronoField.DAY_OF_MONTH, 1, 2, SignStyle.NEVER);
                    break;
                case F.MONTH_TEXT_SHORT:
                    if (i !== 0) b.appendLiteral(sep);
                    b.parseCaseInsensitive().appendText(ChronoField.MONTH_OF_YEAR, TextStyle.SHORT).parseCaseSensitive();
                    break;
                case F.MONTH_TEXT_LONG:
                    if (i !== 0) b.appendLiteral(sep);
                    b.parseCaseInsensitive().appendText(ChronoField.MONTH_OF_YEAR, TextStyle.FULL).parseCaseSensitive();
                    break;
                case F.MONTH_NUM:
                    if (i !== 0) b.appendLiteral(sep);
                    b.appendValue(ChronoField.MONTH_OF_YEAR, 1, 2, SignStyle.NEVER);
                    break;
                case F.YEAR2:
                    if (i !== 0) b.appendLiteral(sep);
                    // From http://stackoverflow.com/questions/29490893/parsing-string-to-local-date-doesnt-use-desired-century
                    b.appendValueReduced(ChronoField.YEAR, 2, 2, Year.now().value() - 80);
                    break;
                case F.YEAR4:
                    if (i !== 0) b.appendLiteral(sep);
                    b.appendValue(ChronoField.YEAR, 4, 4, SignStyle.NEVER);
                    break;
            }
        }
        return b.toFormatter();
    }

    public static l(...args: DateTimeFormatter[]): DateTimeFormatter[]
    {
        return args;
    }

    private static makeFormatter(type: DateTimeInfo.DateTimeType): DateTimeFormatter
    {
        const DateTimeType = DateTimeInfo.DateTimeType;
        const builder = new JavaDateTimeFormatterBuilder();
        if (DateTimeType.hasYearMonth(type))
        {
            builder.appendValue(ChronoField.YEAR, 4, 10, SignStyle.EXCEEDS_PAD)
                .appendLiteral("-")
                .appendValue(ChronoField.MONTH_OF_YEAR, 2);
        }
        if (DateTimeType.hasDay(type))
            builder.appendLiteral("-").appendValue(ChronoField.DAY_OF_MONTH, 2);
        if ((DateTimeType.hasYearMonth(type) || DateTimeType.hasDay(type)) && DateTimeType.hasTime(type))
            builder.appendLiteral(" ");
        if (DateTimeType.hasTime(type))
            builder.appendValue(ChronoField.HOUR_OF_DAY, 2)
                .appendLiteral(":")
                .appendValue(ChronoField.MINUTE_OF_HOUR, 2)
                .optionalStart()
                .appendLiteral(":")
                .appendValue(ChronoField.SECOND_OF_MINUTE, 2)
                .optionalStart()
                .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
                .optionalEnd()
                .optionalEnd();
        if (DateTimeType.hasZoneOffset(type))
            builder.appendOffsetId();
        if (DateTimeType.hasZoneId(type))
        {
            builder
                .appendLiteral(" ")
                .parseCaseSensitive();
            builder.appendZoneOrOffsetId();
        }
        return builder.toFormatter();
    }

    /**
     * This parses in two senses.  First, it parses using the provided DataParser.
     * We don't actually use that directly to get the value info out, instead
     * feeling it to the formatter.  This may seem odd, but we already have the formatter.
     * However, the parser needs to know what data tokens got consumed to parse
     * the next item, which is not easily extracted out of the data/time formatter.
     * Hence this slightly odd double layer.
     * (Java has overloads for DataParser and DataParser2.)
     * @return
     */
    public parse(p: DataParser | DataParser2): Either<string, TemporalValue>
    {
        let parsed: Either<string, ParserRuleContext> | null;
        switch (this.type)
        {
            case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                parsed = DataType.tryParseOrInvalid(() => p.ymdOrInvalid(), c => c.invalidItem(), c => c.ymd());
                break;
            case DateTimeInfo.DateTimeType.YEARMONTH:
                parsed = DataType.tryParseOrInvalid(() => p.ymOrInvalid(), c => c.invalidItem(), c => c.ym());
                break;
            case DateTimeInfo.DateTimeType.TIMEOFDAY:
                parsed = DataType.tryParseOrInvalid(() => p.localTimeOrInvalid(), c => c.invalidItem(), c => c.localTime());
                break;
            //case TIMEOFDAYZONED:
                //return p.offsetTime();
            case DateTimeInfo.DateTimeType.DATETIME:
                parsed = DataType.tryParseOrInvalid(() => p.localDateTimeOrInvalid(), c => c.invalidItem(), c => c.localDateTime());
                break;
            case DateTimeInfo.DateTimeType.DATETIMEZONED:
                parsed = DataType.tryParseOrInvalid(() => p.zonedDateTimeOrInvalid(), c => c.invalidItem(), c => c.zonedDateTime());
                break;
            default:
                throw new InternalException("Unrecognised format: " + String(this.type));
        }
        if (parsed === null)
            throw new ParseException("Date value ", p);
        return parsed.mapEx<TemporalValue>(c => {
            const formatter = this.getStrictFormatter();
            try
            {
                return this.fromParsed(formatter.parse(javaTrim(c.getText())));
            }
            catch (e)
            {
                if (!(e instanceof DateTimeParseException))
                    throw e;
                throw new UserException("Problem reading date/time of type " + DateTimeInfo.DateTimeType[this.getType()] + " from {" + c.getText() + "}", e);
            }
        });
    }

    private readonly type: DateTimeInfo.DateTimeType;

    public constructor(type: DateTimeInfo.DateTimeType)
    {
        this.type = type;
    }

    public static readonly DEFAULT_VALUE: TemporalAccessor = ZonedDateTime.of(1900, 1, 1, 0, 0, 0, 0, ZoneId.of("UTC"));

    public getDefaultValue(): TemporalValue
    {
        switch (this.type)
        {
            case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                return LocalDate.from(DateTimeInfo.DEFAULT_VALUE);
            case DateTimeInfo.DateTimeType.YEARMONTH:
                return YearMonth.from(DateTimeInfo.DEFAULT_VALUE);
            case DateTimeInfo.DateTimeType.TIMEOFDAY:
                return LocalTime.from(DateTimeInfo.DEFAULT_VALUE);
            //case TIMEOFDAYZONED:
            //    return OffsetTime.from(DEFAULT_VALUE);
            case DateTimeInfo.DateTimeType.DATETIME:
                return LocalDateTime.from(DateTimeInfo.DEFAULT_VALUE);
            case DateTimeInfo.DateTimeType.DATETIMEZONED:
                return ZonedDateTime.from(DateTimeInfo.DEFAULT_VALUE);
        }
        throw new InternalException("Unknown type: " + String(this.type));
    }

    public fromParsed(t: TemporalAccessor): TemporalValue
    {
        const r = DataTypeUtility.value(this, t);
        if (r !== null)
            return r;
        else
            throw new InternalException("Error loading date: " + t.toString());
    }

    public getType(): DateTimeInfo.DateTimeType
    {
        return this.type;
    }

    public sameType(dateTimeInfo: DateTimeInfo | null): boolean
    {
        return dateTimeInfo !== null && this.type === dateTimeInfo.type;
    }

    public hashCodeForType(): number
    {
        return this.type;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof DateTimeInfo)) return false;
        return this.type === o.type;
    }

    public hashCode(): number
    {
        // Java: Objects.hash(type)
        return (31 + javaStringHashCode(DateTimeInfo.DateTimeType[this.type])) | 0;
    }

    /**
     * Gets a comparator for this particular temporal type.
     * @param pool    If true, give a comparator suitable for object pools.  Here, we should only
     *                return zero iff equals(..) is true and the values are completely equal.
     *                If false, give a comparator for user
     *                code.  You can particularly see the difference for OffsetTime, where
     *                11:21+00:00 and 10:21-01:00 are equals for user comparison purposes, but not
     *                for the object pool, since they are not the same value and need to be stored
     *                differently.
     */
    public getComparator(pool: boolean): Comparator<TemporalAccessor>
    {
        const DateTimeType = DateTimeInfo.DateTimeType;
        const get = (field: ChronoField) => (t: TemporalAccessor) => t.get(field);
        switch (this.type)
        {
            case DateTimeType.YEARMONTHDAY:
                return comparing(get(ChronoField.YEAR), get(ChronoField.MONTH_OF_YEAR), get(ChronoField.DAY_OF_MONTH));
            case DateTimeType.YEARMONTH:
                return comparing(get(ChronoField.YEAR), get(ChronoField.MONTH_OF_YEAR));
            case DateTimeType.TIMEOFDAY:
                return comparing(get(ChronoField.HOUR_OF_DAY), get(ChronoField.MINUTE_OF_HOUR), get(ChronoField.SECOND_OF_MINUTE), get(ChronoField.NANO_OF_SECOND));
            case DateTimeType.DATETIME:
                return comparing(get(ChronoField.YEAR), get(ChronoField.MONTH_OF_YEAR), get(ChronoField.DAY_OF_MONTH), get(ChronoField.HOUR_OF_DAY), get(ChronoField.MINUTE_OF_HOUR), get(ChronoField.SECOND_OF_MINUTE), get(ChronoField.NANO_OF_SECOND));
            case DateTimeType.DATETIMEZONED:
            {
                // Java: Comparator.comparing(keyExtractor, keyComparator)
                const key = (t: TemporalAccessor): ZonedDateTime => pool ? ZonedDateTime.from(t) : ZonedDateTime.from(t).withZoneSameInstant(ZoneOffset.UTC);
                const inner = comparing<TemporalAccessor>(get(ChronoField.YEAR), get(ChronoField.MONTH_OF_YEAR), get(ChronoField.DAY_OF_MONTH), get(ChronoField.HOUR_OF_DAY), get(ChronoField.MINUTE_OF_HOUR), get(ChronoField.SECOND_OF_MINUTE), get(ChronoField.NANO_OF_SECOND), t => ZonedDateTime.from(t).zone().toString());
                return (a, b) => inner(key(a), key(b));
            }
        }
        throw new InternalException("Unknown date type: " + this.type);
    }

    public toString(): string
    {
        return "DateTimeInfo{type=" + DateTimeInfo.DateTimeType[this.type] + "}";
    }
}

export namespace DateTimeInfo
{
    // public for testing
    export enum F { SEC_OPT_FRAC_OPT, MIN, HOUR, HOUR12, AMPM, DAY, MONTH_TEXT_SHORT, MONTH_TEXT_LONG, MONTH_NUM, YEAR2, YEAR4 }

    export enum DateTimeType
    {
        /** LocalDate */
        YEARMONTHDAY,
        /** YearMonth */
        YEARMONTH,
        /** LocalTime */
        TIMEOFDAY,
        /** LocalDateTime */
        DATETIME,
        /** ZonedDateTime */
        DATETIMEZONED,
    }

    export namespace DateTimeType
    {
        export function hasDay(t: DateTimeType): boolean
        {
            switch (t)
            {
                case DateTimeType.YEARMONTHDAY:
                case DateTimeType.DATETIME:
                case DateTimeType.DATETIMEZONED:
                    return true;
                default:
                    return false;
            }
        }

        export function hasYearMonth(t: DateTimeType): boolean
        {
            switch (t)
            {
                case DateTimeType.YEARMONTH:
                case DateTimeType.YEARMONTHDAY:
                case DateTimeType.DATETIME:
                case DateTimeType.DATETIMEZONED:
                    return true;
                default:
                    return false;
            }
        }

        export function hasTime(t: DateTimeType): boolean
        {
            switch (t)
            {
                case DateTimeType.TIMEOFDAY:
                case DateTimeType.DATETIME:
                case DateTimeType.DATETIMEZONED:
                    return true;
                default:
                    return false;
            }
        }

        export function literalPrefix(t: DateTimeType): string
        {
            switch (t)
            {
                case DateTimeType.YEARMONTHDAY:
                    return "date";
                case DateTimeType.YEARMONTH:
                    return "dateym";
                case DateTimeType.TIMEOFDAY:
                    return "time";
                case DateTimeType.DATETIME:
                    return "datetime";
                case DateTimeType.DATETIMEZONED:
                    return "datetimezoned";
            }
        }

        export function hasZoneOffset(_t: DateTimeType): boolean
        {
            return false; //this == TIMEOFDAYZONED;
        }

        export function hasZoneId(t: DateTimeType): boolean
        {
            return t === DateTimeType.DATETIMEZONED;
        }
    }
}
