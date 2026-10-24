// java.time for the port: js-joda (a BSD-licensed JavaScript port of java.time / ThreeTen), with
// time-zone rules and en-US locale data, plus adaptations where js-joda differs from Java 21.
// The rest of the engine imports java.time classes from here, never from js-joda directly.
//
// Differences from js-joda that this module fixes:
//  - Zone parsing (appendZoneId, appendZoneRegionId, appendZoneOrOffsetId, appendZoneText) follows
//    java.time's algorithm, with java.time's own zone ID list and en-US zone name table
//    (JavaZoneData.ts, extracted from the JDK).
//  - Formatters use the en-US locale by default, as a Java app in an en-US locale does.
//  - Exception messages are given in Java's form (javaMessage).
import "@js-joda/timezone";
import { Locale } from "@js-joda/locale";
import "@js-joda/locale_en";
import {
    ChronoField,
    DateTimeException,
    DateTimeFormatter,
    DateTimeFormatterBuilder,
    DateTimeParseException,
    Month,
    ParsePosition,
    TemporalAccessor,
    TemporalQueries,
    TemporalQuery,
    TextStyle,
    ValueRange,
    YearMonth,
    ZoneId,
    ZoneOffset,
} from "@js-joda/core";
import { JAVA_SHORT_ZONE_NAMES, JAVA_ZONE_IDS } from "./JavaZoneData.js";

export * from "@js-joda/core";
export { Locale };

/** The locale java.time formatters use here (Java uses the platform's default locale). */
export const DEFAULT_LOCALE = Locale.US;

// --- Patches to js-joda, so that values behave as in Java 21 ------------------------------------

// PORT-NOTE: js-joda prints a year from 10000 up with a "+" (as LocalDate does); Java's
// YearMonth.toString doesn't: YearMonth.of(10000, 1) is "10000-01" (which, oddly, Java's own
// YearMonth.parse then rejects, as it needs the "+").
YearMonth.prototype.toString = function (this: YearMonth): string
{
    const year = this.year();
    const month = this.monthValue();
    const absYear = Math.abs(year);
    let buf: string;
    if (absYear < 1000)
        buf = (year < 0 ? "-" : "") + String(absYear).padStart(4, "0");
    else
        buf = String(year);
    return buf + (month < 10 ? "-0" : "-") + month;
};

// PORT-NOTE: Java's message for an out-of-range field value is "Invalid value for X (valid values
// a - b): v"; js-joda says "Invalid int value for X: v".
ValueRange.prototype.checkValidIntValue = function (this: ValueRange, value: number, field: { toString(): string }): number
{
    if (!this.isValidIntValue(value))
        throw new DateTimeException(`Invalid value for ${field.toString()} (valid values ${this.toString()}): ${value}`);
    return value;
};

// --- Zone parsing, as java.time does it ---------------------------------------------------------

// Internal js-joda types used by printer-parsers:
interface ParseContext
{
    charEquals(a: string, b: string): boolean;
    isCaseSensitive(): boolean;
    setParsedZone(zone: ZoneId): void;
}

interface PrintContext
{
    getValueQuery<R>(query: TemporalQuery<R>): R | null;
}

interface StringBuilderLike
{
    append(s: string): StringBuilderLike;
}

/** A longest-match lookup of texts at a position, as java.time's PrefixTree does. */
class TextTree
{
    private readonly byLength: [number, Map<string, string>][];

    constructor(entries: Iterable<[string, string]>, caseSensitive: boolean)
    {
        const lengths = new Map<number, Map<string, string>>();
        for (const [key, value] of entries)
        {
            const k = caseSensitive ? key : key.toLowerCase();
            if (!lengths.has(key.length))
                lengths.set(key.length, new Map());
            lengths.get(key.length)!.set(k, value);
        }
        this.byLength = [...lengths.entries()].sort((a, b) => b[0] - a[0]);
        this.caseSensitive = caseSensitive;
    }

    private readonly caseSensitive: boolean;

    /** The value and length of the longest key matching text at position, or null. */
    public match(text: string, position: number): { value: string; length: number } | null
    {
        for (const [length, keys] of this.byLength)
        {
            if (position + length > text.length)
                continue;
            const sub = text.substring(position, position + length);
            const value = keys.get(this.caseSensitive ? sub : sub.toLowerCase());
            if (value !== undefined)
                return { value, length };
        }
        return null;
    }
}

let zoneIdTrees: [TextTree, TextTree] | null = null;
let zoneTextTrees: [TextTree, TextTree] | null = null;

function zoneIdTree(caseSensitive: boolean): TextTree
{
    zoneIdTrees ??= [true, false].map(cs => new TextTree(JAVA_ZONE_IDS.map(id => [id, id] as [string, string]), cs)) as [TextTree, TextTree];
    return zoneIdTrees[caseSensitive ? 0 : 1];
}

function zoneTextTree(caseSensitive: boolean): TextTree
{
    // Zone IDs, then the short names (which take precedence where they coincide, e.g. "CET"):
    zoneTextTrees ??= [true, false].map(cs => new TextTree([...JAVA_ZONE_IDS.map(id => [id, id] as [string, string]), ...JAVA_SHORT_ZONE_NAMES], cs)) as [TextTree, TextTree];
    return zoneTextTrees[caseSensitive ? 0 : 1];
}

// Offset parsers like java.time's OffsetIdPrinterParser.INSTANCE_ID_Z and INSTANCE_ID_ZERO:
const OFFSET_ID_Z = new DateTimeFormatterBuilder().appendOffset("+HH:MM:ss", "Z").toFormatter();
const OFFSET_ID_ZERO = new DateTimeFormatterBuilder().appendOffset("+HH:MM:ss", "0").toFormatter();

/** Parses an offset at position, returning [offset seconds, end position], or null. */
function parseOffset(parser: DateTimeFormatter, text: string, position: number): [number, number] | null
{
    const pos = new ParsePosition(position);
    const parsed = parser.parseUnresolved(text, pos) as unknown as { fieldValues: { get(f: ChronoField): number | undefined } } | null;
    if (parsed === null || pos.getErrorIndex() >= 0)
        return null;
    return [parsed.fieldValues.get(ChronoField.OFFSET_SECONDS)!, pos.getIndex()];
}

// Java's ZoneIdPrinterParser.parseOffsetBased: an offset, or a "UT"/"UTC"/"GMT" prefix optionally
// followed by an offset.
function parseOffsetBased(context: ParseContext, text: string, prefixPos: number, position: number, parser: DateTimeFormatter): number
{
    const prefix = text.substring(prefixPos, position).toUpperCase();
    if (position >= text.length)
    {
        context.setParsedZone(ZoneId.of(prefix));
        return position;
    }
    // '0' or 'Z' after prefix is not part of a valid ZoneId; reject
    if (text[position] === "0" || context.charEquals(text[position]!, "Z"))
    {
        context.setParsedZone(ZoneId.of(prefix));
        return position;
    }
    try
    {
        const result = parseOffset(parser, text, position);
        if (result === null)
        {
            if (parser === OFFSET_ID_Z)
                return ~prefixPos;
            context.setParsedZone(ZoneId.of(prefix));
            return position;
        }
        const [offsetSecs, endPos] = result;
        const zoneOffset = ZoneOffset.ofTotalSeconds(offsetSecs);
        context.setParsedZone(prefix === "" ? zoneOffset : ZoneId.ofOffset(prefix, zoneOffset));
        return endPos;
    }
    catch (e)
    {
        if (e instanceof DateTimeException)
            return ~prefixPos;
        throw e;
    }
}

/**
 * A zone printer-parser that behaves like java.time's ZoneIdPrinterParser (or, with a text
 * style, its ZoneTextPrinterParser subclass when parsing).
 */
class JavaZonePrinterParser
{
    constructor(private readonly query: TemporalQuery<ZoneId | null>, private readonly description: string, private readonly zoneText: boolean)
    {
    }

    public print(context: PrintContext, buf: StringBuilderLike): boolean
    {
        const zone = context.getValueQuery(this.query);
        if (zone === null)
            return false;
        // PORT-NOTE: for appendZoneText, Java prints the localized zone name; Columnal only uses
        // zone text for parsing, so the ID is printed.
        buf.append(zone.id());
        return true;
    }

    public parse(context: ParseContext, text: string, position: number): number
    {
        const length = text.length;
        if (position > length)
            throw new RangeError("Index out of bounds: " + position); // Java: IndexOutOfBoundsException
        if (position === length)
            return ~position;

        // handle fixed time-zone IDs
        const nextChar = text[position]!;
        if (nextChar === "+" || nextChar === "-")
        {
            return parseOffsetBased(context, text, position, position, OFFSET_ID_Z);
        }
        else if (length >= position + 2)
        {
            const nextNextChar = text[position + 1]!;
            if (context.charEquals(nextChar, "U") && context.charEquals(nextNextChar, "T"))
            {
                if (length >= position + 3 && context.charEquals(text[position + 2]!, "C"))
                {
                    // Zone texts can start with "UTC", so for those the tree is used instead:
                    if (!this.zoneText)
                        return parseOffsetBased(context, text, position, position + 3, OFFSET_ID_ZERO);
                }
                else
                {
                    return parseOffsetBased(context, text, position, position + 2, OFFSET_ID_ZERO);
                }
            }
            else if (context.charEquals(nextChar, "G") && length >= position + 3 && context.charEquals(nextNextChar, "M") && context.charEquals(text[position + 2]!, "T"))
            {
                if (length >= position + 4 && context.charEquals(text[position + 3]!, "0"))
                {
                    context.setParsedZone(ZoneId.of("GMT0"));
                    return position + 4;
                }
                return parseOffsetBased(context, text, position, position + 3, OFFSET_ID_ZERO);
            }
        }

        // parse
        const tree = this.zoneText ? zoneTextTree(context.isCaseSensitive()) : zoneIdTree(context.isCaseSensitive());
        const match = tree.match(text, position);
        if (match === null)
        {
            if (context.charEquals(nextChar, "Z"))
            {
                context.setParsedZone(ZoneOffset.UTC);
                return position + 1;
            }
            return ~position;
        }
        context.setParsedZone(ZoneId.of(match.value));
        return position + match.length;
    }

    public toString(): string
    {
        return this.description;
    }
}

// java.time's TemporalQueries.zoneId() limited to regions (for appendZoneRegionId):
class RegionOnlyQuery extends TemporalQuery<ZoneId | null>
{
    public override queryFrom(temporal: TemporalAccessor): ZoneId | null
    {
        const zone = temporal.query(TemporalQueries.zoneId());
        return zone !== null && !(zone instanceof ZoneOffset) ? zone : null;
    }

    public override toString(): string
    {
        return "ZoneRegionId()";
    }
}
const QUERY_REGION_ONLY = new RegionOnlyQuery();

interface InternalBuilder
{
    _appendInternal(pp: unknown): number;
}

/**
 * java.time's DateTimeFormatterBuilder: js-joda's, with java.time's zone parsing, and
 * formatters in the default (en-US) locale.
 */
export class JavaDateTimeFormatterBuilder extends DateTimeFormatterBuilder
{
    public override appendZoneId(): this
    {
        (this as unknown as InternalBuilder)._appendInternal(new JavaZonePrinterParser(TemporalQueries.zoneId(), "ZoneId()", false));
        return this;
    }

    public appendZoneRegionId(): this
    {
        (this as unknown as InternalBuilder)._appendInternal(new JavaZonePrinterParser(QUERY_REGION_ONLY, "ZoneRegionId()", false));
        return this;
    }

    public appendZoneOrOffsetId(): this
    {
        (this as unknown as InternalBuilder)._appendInternal(new JavaZonePrinterParser(TemporalQueries.zone(), "ZoneOrOffsetId()", false));
        return this;
    }

    /** Java: appendZoneText(TextStyle).  Only TextStyle.SHORT names are supported for parsing (all Columnal uses). */
    public appendZoneTextJava(textStyle: TextStyle): this
    {
        if (textStyle !== TextStyle.SHORT)
            throw new RangeError("Only TextStyle.SHORT zone text is supported");
        (this as unknown as InternalBuilder)._appendInternal(new JavaZonePrinterParser(TemporalQueries.zoneId(), "ZoneText(" + textStyle.toString() + ")", true));
        return this;
    }

    public override toFormatter(): DateTimeFormatter
    {
        return super.toFormatter().withLocale(DEFAULT_LOCALE as never);
    }
}

// --- Parsing and exceptions -------------------------------------------------------------------

/** Removes js-joda's additions (", at index", "Caused by" blocks) from an exception message. */
function stripJsJodaSuffixes(message: string): string
{
    const causedBy = message.indexOf("\n-------\nCaused by:");
    return causedBy === -1 ? message : message.substring(0, causedBy);
}

/** The message Java would give for a java.time exception thrown by js-joda. */
export function javaMessage(e: Error): string
{
    let message = stripJsJodaSuffixes(e.message);
    if (e instanceof DateTimeParseException)
    {
        const suffix = `: ${e.parsedString()}, at index: ${e.errorIndex()}`;
        if (message.endsWith(suffix))
            message = message.substring(0, message.length - suffix.length);
    }
    // LocalDate.of with a day beyond the end of the month: js-joda gives the numbers, Java
    // gives the month's name and the day, such as "Invalid date 'APRIL 31'":
    const invalidDate = /^Invalid date '-?\d+' '(\d+)' '(\d+)'$/u.exec(message);
    if (invalidDate !== null)
        message = "Invalid date '" + Month.of(Number(invalidDate[1])).name() + " " + invalidDate[2] + "'";
    return message;
}

interface InternalFormatter
{
    _parseToBuilder(text: string, position: ParsePosition | null): { resolve(style: unknown, fields: unknown): TemporalAccessor };
    _resolverStyle: unknown;
    _resolverFields: unknown;
}

/**
 * Java's DateTimeFormatter.parse(CharSequence, ParsePosition): parses from the position (not
 * necessarily to the end), updating it, and resolves the result.
 */
export function parseFromPosition(formatter: DateTimeFormatter, text: string, position: ParsePosition): TemporalAccessor
{
    const f = formatter as unknown as InternalFormatter;
    try
    {
        return f._parseToBuilder(text, position).resolve(f._resolverStyle, f._resolverFields);
    }
    catch (ex)
    {
        // Java wraps any other exception (e.g. from resolving) in a DateTimeParseException:
        if (ex instanceof DateTimeParseException || ex instanceof RangeError || !(ex instanceof Error))
            throw ex;
        const abbr = text.length > 64 ? text.substring(0, 64) + "..." : text;
        throw new DateTimeParseException("Text '" + abbr + "' could not be parsed: " + javaMessage(ex), text, 0, ex);
    }
}

/**
 * Java's "e instanceof DateTimeException".  In Java, DateTimeParseException is a subclass of
 * DateTimeException, but in js-joda it is not, so catch blocks must use this.
 */
export function isDateTimeException(e: unknown): e is Error
{
    return e instanceof DateTimeException || e instanceof DateTimeParseException;
}

export { DateTimeException, DateTimeParseException };

/**
 * Java's ZoneId.systemDefault(): the system's time zone, as a named region (such as Europe/London).
 *
 * PORT-NOTE: js-joda's ZoneId.systemDefault() is a zone called "SYSTEM" whose rules come from the
 * JavaScript Date, which can disagree with itself far from the present (Date maps a distant year to
 * a nearby one for daylight saving time), so this uses the named zone's rules from the time zone
 * database, as Java does.  If the browser doesn't name its zone, or the name is unknown, it falls
 * back to js-joda's.
 */
export function javaSystemDefaultZone(): ZoneId
{
    try
    {
        const name = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (name !== undefined && name !== "")
            return ZoneId.of(name);
    }
    catch (_e)
    {
        // Not a zone that js-joda knows
    }
    return ZoneId.systemDefault();
}
