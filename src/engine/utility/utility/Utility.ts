// Port of xyz.columnal.utility.Utility (utility module).
//
// Java's nested types (ListEx, Record, EpsilonType, ...) are exported at the top level, as Java
// code imports them directly (import ...Utility.ListEx).  Java streams become arrays, Optional
// becomes T | null, and Java Lists become arrays.  Numbers are canonical Decimals: see
// src/engine/java/JavaBigDecimal.ts.
//
// PORT-DEFERRED: methods that use the desktop file system or JavaFX are not ported yet:
//   countLines, ReadState, readColumnChunk, skipFirstNRows (with the importers, Phase 6);
//   usedFile, readRecentFilesList, getAutoSaveDirectory, getUndoDirectory, getStorageDirectory,
//   getNewAutoSaveFile, getProperty, setProperty, MRU_FILE_NAME, saveLock (browser storage, Phase 9);
//   addStyleClass, middle (JavaFX; the GUI is rebuilt).
import { BailErrorStrategy, BaseErrorListener, CharStream, CommonTokenStream, ParseCancellationException, RecognitionException, type ATNSimulator, type Lexer, type Parser, type Recognizer, type Token, type TokenStream, type Vocabulary } from "antlr4ng";
import type { AbsColIndex, AbsRowIndex, ExpressionIdentifier, Localized, UserIndex } from "../../anns/Annotations.js";
import { Damerau } from "../../java/Damerau.js";
import { HashMap, HashSet, type ReadonlyMapLike } from "../../java/HashMap.js";
import { ArithmeticException, canonical, checkFinite, Decimal, decimalFromBigInt, decimalFromDouble, doubleValue, fitsLong, intValue, longValue, ONE, parseBigDecimal, powDecimal128, toBigInteger, toJavaString, toPlainString } from "../../java/JavaBigDecimal.js";
import { isLetterOrDigit, isWhitespace } from "../../java/JavaCharacter.js";
import { IndexOutOfBoundsException } from "../../java/JavaExceptions.js";
import { javaEquals, javaHashCode, javaStringCompare } from "../../java/JavaObject.js";
import { javaDoubleToString, javaParseDouble } from "../../java/JavaDouble.js";
import { javaParseInt, javaParseLong, javaRegionMatches, javaSplit, javaTrim, NumberFormatException } from "../../java/JavaString.js";
import { Rational } from "../../java/Rational.js";
import { isTemporalAccessor, type TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataLexer } from "../../parsers/generated/DataLexer.js";
import { DataLexer2 } from "../../parsers/generated/DataLexer2.js";
import { DataParser } from "../../parsers/generated/DataParser.js";
import { DataParser2 } from "../../parsers/generated/DataParser2.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { ParseException } from "../error/parse/ParseException.js";
import { Log } from "../log/Log.js";
import { TaggedValue } from "./TaggedValue.js";
import type { Value } from "./Value.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Class<T> = abstract new (...args: any[]) => T;

/** Anything with the shape of a parsed @BEGIN/@END detail block (Java has four overloads of getDetail for the different parser contexts). */
interface DetailLike
{
    detailLine(): readonly { DETAIL_LINE(): { getText(): string } }[];
}

function mapLike<K, V>(likeThis: ReadonlyMapLike<K, unknown>): Map<K, V> | HashMap<K, V>
{
    return likeThis instanceof HashMap ? new HashMap<K, V>() : new Map<K, V>();
}

function javaClassName(x: unknown): string
{
    if (x === null || x === undefined)
        return "null";
    if (typeof x === "object")
        return "class " + ((x as { constructor?: { name?: string } }).constructor?.name ?? "Object");
    return "class " + typeof x;
}

export enum EpsilonType { ABSOLUTE, RELATIVE }

export class Utility
{
    public static mapList<T, R>(list: readonly T[], func: (t: T) => R): R[]
    {
        return list.map(t => func(t));
    }

    public static mapListI<T, R>(list: readonly T[], func: (t: T) => R): R[]
    {
        return list.map(t => func(t));
    }

    public static mapListInt<T, R>(list: readonly T[], func: (t: T) => R): R[]
    {
        return list.map(t => func(t));
    }

    public static mapListEx<T, R>(list: readonly T[], func: (t: T) => R): R[]
    {
        return list.map(t => func(t));
    }

    /** Java: mapListExI(List, ExFunction) and mapListExI(ListEx, ExFunction). */
    public static mapListExI<T, R>(list: readonly T[] | ListEx, func: (t: T) => R): R[]
    {
        if (list instanceof ListEx)
        {
            const r: R[] = [];
            for (let i = 0; i < list.size(); i++)
            {
                r.push(func(list.get(i) as T));
            }
            return r;
        }
        return list.map(t => func(t));
    }

    public static mapListExI_Index<T, R>(list: readonly T[], func: (index: number, t: T) => R): R[]
    {
        return list.map((t, i) => func(i, t));
    }

    public static mapList_Index<T, R>(list: readonly T[], func: (index: number, t: T) => R): R[]
    {
        return list.map((t, i) => func(i, t));
    }

    // Java: mapArray(Class<R> cls, T[] src, Function<T, R> func)
    public static mapArray<T, R>(src: readonly T[], func: (t: T) => R): R[]
    {
        return src.map(t => func(t));
    }

    public static mapValues<K, T, R>(original: ReadonlyMapLike<K, T>, apply: (t: T) => R): ReadonlyMapLike<K, R>
    {
        const r = mapLike<K, R>(original);
        original.forEach((v, k) => r.set(k, apply(v)));
        return r;
    }

    public static mapValuesInt<K, T, R>(original: ReadonlyMapLike<K, T>, apply: (t: T) => R): ReadonlyMapLike<K, R>
    {
        return Utility.mapValues(original, apply);
    }

    public static mapValuesEx<K, T, R>(original: ReadonlyMapLike<K, T>, apply: (t: T) => R): ReadonlyMapLike<K, R>
    {
        return Utility.mapValues(original, apply);
    }

    // Given a table of values, skips the first "skipRows" rows,
    // Then extracts all values which are not from completely blank rows.
    public static sliceSkipBlankRows(vals: readonly (readonly string[])[], skipRows: number, columnIndex: number): string[]
    {
        const items: string[] = [];
        for (let i = skipRows; i < vals.length; i++)
        {
            const row = vals[i]!;
            if (row.length !== 0 && !row.every(s => s === ""))
            {
                if (columnIndex < row.length)
                    items.push(row[columnIndex]!);
                else if (row.length !== 0)
                    items.push(row[row.length - 1]!);
            }
        }
        return items;
    }

    /**
     * Used to compare two unpacked values.
     *
     * Compares two lists lexicographically, i.e. it starts by comparing the first item
     * If that differs, that's the result, otherwise compare the next items, and so on.
     *
     * The types of the first item in each list should match each other, and the
     * types should match at each subsequent stage if the lists up to that point
     * are identical.  That is:
     *
     * 0, "hi", "bye" can compare to 1, 2.
     * 0, "hi", "bye" can compare to 0, "a", "b"
     * 0, "hi", "bye" CANNOT compare to 0, 1, "c"
     *
     * The list can contain lists (which recurse to compare), any comparable
     * of the same type (e.g. String, Temporal, etc). Numbers are compared using compareNumbers;
     * see that method for more details.
     *
     * Java: compareLists(List, List), compareLists(List, List, epsilon) and compareLists(ListEx, ListEx, epsilon).
     */
    public static compareLists(a: readonly Value[] | ListEx, b: readonly Value[] | ListEx, epsilon: Pair<EpsilonType, Decimal> | null = null): number
    {
        const aSize = a instanceof ListEx ? a.size() : a.length;
        const bSize = b instanceof ListEx ? b.size() : b.length;
        for (let i = 0; i < aSize; i++)
        {
            if (i >= bSize)
                return 1; // A was larger
            const ax = a instanceof ListEx ? a.get(i) : a[i]!;
            const bx = b instanceof ListEx ? b.get(i) : b[i]!;
            const cmp = Utility.compareValues(ax, bx, epsilon);
            if (cmp !== 0)
                return cmp;
        }
        if (aSize === bSize)
            return 0; // Same
        else
            return -1; // B must have been longer
    }

    public static compareValues(ax: Value, bx: Value, epsilon: Pair<EpsilonType, Decimal> | null = null): number
    {
        let cmp: number;
        if (Decimal.isDecimal(ax))
            cmp = Utility.compareNumbers(ax, Utility.cast(bx, Decimal), epsilon);
        else if (ax instanceof ListEx)
            cmp = Utility.compareLists(ax, Utility.cast(bx, ListEx), epsilon);
        else if (typeof ax === "string" || typeof ax === "boolean" || isTemporalAccessor(ax))
        {
            // Java: Comparable.compareTo, which throws ClassCastException for mismatched types
            if (typeof ax === "string")
            {
                if (typeof bx !== "string")
                    throw new InternalException("Mismatched internal types");
                cmp = javaStringCompare(ax, bx);
            }
            else if (typeof ax === "boolean")
            {
                if (typeof bx !== "boolean")
                    throw new InternalException("Mismatched internal types");
                cmp = ax === bx ? 0 : ax ? 1 : -1;
            }
            else
            {
                if (!isTemporalAccessor(bx))
                    throw new InternalException("Mismatched internal types");
                cmp = (ax as TemporalAccessor).compareTo(bx);
            }
        }
        else if (ax instanceof TaggedValue)
        {
            const at = Utility.cast(ax, TaggedValue);
            const bt = Utility.cast(bx, TaggedValue);
            cmp = at.getTagIndex() < bt.getTagIndex() ? -1 : at.getTagIndex() > bt.getTagIndex() ? 1 : 0;
            if (cmp !== 0)
                return cmp;
            const a2 = at.getInner();
            const b2 = bt.getInner();
            if (a2 !== null && b2 !== null)
                return Utility.compareValues(a2, b2, epsilon);
            return 0; // Assume bx null too, if types match.
        }
        else if (ax instanceof Record)
        {
            const ao = Utility.cast(ax, Record);
            const bo = Utility.cast(bx, Record);
            const byName = (r: Record) => [...r.getFullContent().entries()].sort((x, y) => javaStringCompare(x[0], y[0]));
            const aoByName = byName(ao);
            const boByName = byName(bo);

            if (aoByName.length !== boByName.length)
                throw new InternalException("Trying to compare records of different size");
            for (let i = 0; i < aoByName.length; i++)
            {
                const ae = aoByName[i]!;
                const be = boByName[i]!;
                if (ae[0] !== be[0])
                    throw new InternalException("Record field names do not match: " + ae[0] + " vs " + be[0]);
                cmp = Utility.compareValues(ae[1], be[1], epsilon);
                if (cmp !== 0)
                    return cmp;
            }
            return 0;
        }
        else
            throw new InternalException("Uncomparable types: " + javaClassName(ax) + " " + javaClassName(bx));
        return cmp;
    }

    /**
     * Gets the fractional part as a String, excluding the dot
     *
     * @param minDisplayDP The minimum number of decimal places to show.  If zero,
     *                     empty string will be returned if the number is an integer.
     * @param maxDisplayDP The maximum number of decimal places to show.  There is
     *                     an in-built maximum in effect of around 35, as that is the
     *                     maximum precision possible in a BigDecimal.  So if this
     *                     number is much higher than 35, it effectively means no maximum.
     *                     Must be at least 1 (otherwise, why call this function?).
     *                     Passing a negative number is equivalent to unlimited.
     */
    public static getFracPartAsString(number: Decimal, minDisplayDP: number, maxDisplayDP: number): string
    {
        // Munged from http://stackoverflow.com/a/30761234/412908
        let s = toPlainString(number.abs());
        const dot = s.indexOf(".");
        if (dot !== -1)
        {
            s = s.substring(dot + 1);
            while (s.length < minDisplayDP)
                s = s + "0";
            if (maxDisplayDP > 0 && s.length > maxDisplayDP)
            {
                s = s.substring(0, maxDisplayDP - 1) + "…";
            }
            return s;
        }
        // Otherwise it's an integer:
        return "0".repeat(Math.max(0, minDisplayDP));
    }

    // getFracPar(5.06, 3), will give 60.
    public static getFracPart(number: Decimal, bottomDigit: number): bigint
    {
        // From http://stackoverflow.com/a/30761234/412908
        if (number.isInteger())
            return 0n;
        return toBigInteger(number.mod(ONE).times(new Decimal(10).pow(bottomDigit)).abs());
    }

    public static getIntegerPart(number: Decimal): Decimal
    {
        return canonical(number.trunc());
    }

    /** Java: converts a Long to BigDecimal.  Here every number is already a Decimal. */
    public static toBigDecimal(n: Decimal): Decimal
    {
        return n;
    }

    public static parseAsOne<R, PARSER extends Parser>(input: string, makeLexer: (input: CharStream) => Lexer, makeParser: (tokens: TokenStream) => PARSER, withParser: (parser: PARSER) => R): R
    {
        const inputStream = CharStream.fromString(input);
        // Could try speeding things up with: https://github.com/antlr/antlr4/issues/192
        const del = new DescriptiveErrorListener();
        const lexer = makeLexer(inputStream);
        lexer.removeErrorListeners();
        lexer.addErrorListener(del);
        const tokens = new CommonTokenStream(lexer);
        const parser = makeParser(tokens);
        parser.errorHandler = new BailErrorStrategy();
        parser.removeErrorListeners();
        parser.addErrorListener(del);
        try
        {
            const r = withParser(parser);
            if (del.errors.length !== 0)
                throw new UserException("Parse errors while loading \"" + (input.length < 80 ? input : (input.substring(0, 80) + "…")) + "\":\n" + del.errors.join("\n"));
            return r;
        }
        catch (e)
        {
            if (!(e instanceof ParseCancellationException))
                throw e;
            if (e.cause instanceof RecognitionException)
                throw new ParseException(input, parser, e.cause);
            else
                throw new ParseException(input, parser, e);
        }
    }

    public static prependToList<T>(header: T, data: Iterable<T>): T[]
    {
        return [header, ...data];
    }

    public static appendToList<T>(data: readonly T[], last: T): T[]
    {
        return [...data, last];
    }

    /**
     * Creates a new map containing the given map, plus the new entry.
     * The insertion order of the original map will be respected, and the new item will be placed at the end.
     * If the key was already in the map, it will be replaced, and the new value will still appear at the end.
     * Additionally, removeKey will be removed if it is present.
     */
    public static appendToMap<K, V>(data: ReadonlyMapLike<K, V>, key: K, value: V, removeKey: K | null): ReadonlyMapLike<K, V>
    {
        const builder = mapLike<K, V>(data);
        data.forEach((v, k) =>
        {
            if (!javaEquals(k, key) && !javaEquals(k, removeKey))
                builder.set(k, v);
        });
        builder.set(key, value);
        return builder;
    }

    public static appendToSet<T>(data: Iterable<T>, item: T): HashSet<T>
    {
        const builder = new HashSet<T>();
        for (const existing of data)
        {
            // Can't add twice with builder:
            if (!javaEquals(existing, item))
                builder.add(existing);
        }
        builder.add(item);
        return builder;
    }

    public static report(e: InternalException): void
    {
        Log.log(e); // TODO log and send back
    }

    public static parseNumber(number: string): Decimal
    {
        const n = Utility.parseNumberOpt(number);
        if (n === null)
            throw new UserException("Problem parsing number \"" + number + "\"");
        return n;
    }

    // Java: returns Optional<Number>, a Long if possible, else a BigDecimal with trailing zeros stripped.
    public static parseNumberOpt(number: string): Decimal | null
    {
        // First try as a long:
        try
        {
            return decimalFromBigInt(javaParseLong(number));
        }
        catch (ex)
        {
            if (!(ex instanceof NumberFormatException))
                throw ex;
            // Not a long, then
        }
        // Last try: big decimal (and re-throw if not)
        try
        {
            return parseBigDecimal(number, true);
        }
        catch (e)
        {
            if (!(e instanceof NumberFormatException))
                throw e;
            return null;
        }
    }

    // Java: returns OptionalInt
    public static parseIntegerOpt(number: string): number | null
    {
        // First try as an integer:
        try
        {
            return javaParseInt(number, 10);
        }
        catch (ex)
        {
            if (!(ex instanceof NumberFormatException))
                throw ex;
            return null;
        }
    }

    // Java: returns OptionalDouble
    public static parseDoubleOpt(number: string): number | null
    {
        // First try as a double:
        try
        {
            return javaParseDouble(number);
        }
        catch (ex)
        {
            if (!(ex instanceof NumberFormatException))
                throw ex;
            return null;
        }
    }

    public static rationalToPower(original: Rational, power: number): Rational
    {
        if (power < 0)
        {
            original = original.reciprocal();
            power = -power;
        }
        let r = original;
        while (power > 1)
        {
            r = r.times(original);
            power -= 1;
        }
        return r;
    }

    public static parseRational(text: string): Rational
    {
        return Rational.ofBigDecimal(parseBigDecimal(text, false));
    }

    // PORT-NOTE: Java negates a Long without overflow checking, so -(Long.MIN_VALUE) wrongly
    // gives Long.MIN_VALUE; numbers here are canonical decimals, so the result is correct.
    public static negate(n: Decimal): Decimal
    {
        return canonical(n.neg());
    }

    // If !add, subtract
    // (Java uses long arithmetic for two Longs, falling back to DECIMAL128 on overflow; DECIMAL128
    // holds any long sum exactly, so the canonical result is the same.)
    public static addSubtractNumbers(lhs: Decimal, rhs: Decimal, add: boolean): Decimal
    {
        return canonical(checkFinite(add ? lhs.plus(rhs) : lhs.minus(rhs)));
    }

    public static multiplyNumbers(lhs: Decimal, rhs: Decimal): Decimal
    {
        return canonical(checkFinite(lhs.times(rhs)));
    }

    public static divideNumbers(lhs: Decimal, rhs: Decimal): Decimal
    {
        if (rhs.isZero())
            throw new UserException("Division by zero");
        else
            return canonical(checkFinite(lhs.div(rhs)));
    }

    /**
     * PORT-NOTE: Java uses exact (BigDecimal.pow) arithmetic only when the power is a whole
     * number that is stored as an integer: a BigDecimal power such as 2.0 (rather than 2) goes
     * down the double-precision path.  Numbers here are canonical, so 2.0 is 2 and gets the
     * exact path.  Java's Math.pow and JavaScript's ** may also differ in the last bit.
     */
    public static raiseNumber(lhs: Decimal, rhs: Decimal): Decimal
    {
        // It must fit in an int and not be massive/tiny:
        const rhsIsInt = rhs.isInteger() && rhs.gte(-0x80000000) && rhs.lte(0x7fffffff);
        if (!rhsIsInt || Math.abs(intValue(rhs)) >= 1000)
        {
            // We must use doubles, nothing else supported:
            const lhsd = doubleValue(lhs);
            const rhsd = doubleValue(rhs);
            if (lhsd < 0 && rhsd !== Math.floor(rhsd))
            {
                throw new UserException("Attempting to raise negative number (" + javaDoubleToString(lhsd) + ") to non-integral power (" + javaDoubleToString(rhsd) + ")");
            }

            const result = lhsd ** rhsd;
            if (Number.isFinite(result))
                return decimalFromDouble(result);
            else
                throw new UserException("Cannot store result of calculation " + javaDoubleToString(lhsd) + "^" + javaDoubleToString(rhsd) + ": " + javaDoubleToString(result));
        }
        else // Integer power, we can use big decimal:
        {
            try
            {
                return powDecimal128(lhs, intValue(rhs));
            }
            catch (e)
            {
                if (!(e instanceof ArithmeticException))
                    throw e;
                throw new UserException("Cannot store result of calculation: " + e.message + " " + toJavaString(lhs) + "^" + toJavaString(rhs));
            }
        }
    }

    /**
     * Calls withLong for a whole number within long range, otherwise withBigDecimal.
     * PORT-NOTE: Java dispatches on whether the number is stored as a Long or a BigDecimal;
     * with canonical numbers, a whole number such as 5.0 counts as a long.
     */
    public static withNumber<T>(num: Value, withLong: (l: bigint) => T, withBigDecimal: (d: Decimal) => T): T
    {
        const n = Utility.cast(num, Decimal);
        if (fitsLong(n))
            return withLong(longValue(n));
        else
            return withBigDecimal(n);
    }

    public static withNumberInt<T>(num: Value, withLong: (l: bigint) => T, withBigDecimal: (d: Decimal) => T): T
    {
        return Utility.withNumber(num, withLong, withBigDecimal);
    }

    public static isIntegral(o: Value): boolean
    {
        // From http://stackoverflow.com/a/12748321/412908
        return Utility.cast(o, Decimal).isInteger();
    }

    public static listToString<T>(options: readonly T[]): string
    {
        return "[" + options.map(o => String(o)).join(", ") + "]";
    }

    public static replaceList<T>(members: readonly T[], replaceIndex: number, newValue: T): T[]
    {
        const r = [...members];
        if (replaceIndex < 0 || replaceIndex >= r.length)
            throw new IndexOutOfBoundsException("Index " + replaceIndex + " out of bounds for length " + r.length);
        r[replaceIndex] = newValue;
        return r;
    }

    public static valueList(value: Value): ListEx
    {
        if (!(value instanceof ListEx))
            throw new InternalException("Unexpected type problem: expected list but found " + javaClassName(value));
        return value;
    }

    public static valueRecord(value: Value): Record
    {
        if (!(value instanceof Record))
            throw new InternalException("Unexpected type problem: expected record but found " + javaClassName(value));
        return value;
    }

    public static getAtIndex(objects: ListEx, userIndex: UserIndex): Value
    {
        if (userIndex < 1)
            throw new UserException("List index " + userIndex + " out of bounds, should be between 1 and " + objects.size() + " (inclusive)");
        try
        {
            // User index is one-based:
            return objects.get(userIndex - 1);
        }
        catch (e)
        {
            if (!(e instanceof IndexOutOfBoundsException))
                throw e;
            throw new UserException("List index " + userIndex + " out of bounds, should be between 1 and " + objects.size() + " (inclusive)");
        }
    }

    public static valueNumber(o: Value): Decimal
    {
        if (Decimal.isDecimal(o))
            return o;
        throw new InternalException("Expected number but found " + javaClassName(o));
    }

    public static valueBoolean(o: Value): boolean
    {
        if (typeof o === "boolean")
            return o;
        throw new InternalException("Expected boolean but found " + javaClassName(o));
    }

    public static valueString(o: Value): string
    {
        if (typeof o === "string")
            return o;
        throw new InternalException("Expected text but found " + javaClassName(o));
    }

    public static valueTemporal(o: Value): TemporalAccessor
    {
        if (isTemporalAccessor(o))
            return o;
        throw new InternalException("Expected temporal but found " + javaClassName(o));
    }

    public static valueTagged(o: Value): TaggedValue
    {
        if (o instanceof TaggedValue)
            return o;
        throw new InternalException("Expected tagged value but found " + javaClassName(o));
    }

    // Like indexOf on lists, but uses only reference equality, and thus doesn't mind about initialization
    public static indexOfRef<T>(list: readonly T[], item: T): number
    {
        return list.indexOf(item);
    }

    public static containsRef<T>(list: readonly T[], item: T): boolean
    {
        return Utility.indexOfRef(list, item) !== -1;
    }

    // Java returns a virtual list; PORT-NOTE: here it is a real array.
    public static replicate<T>(length: number, value: T): T[]
    {
        return new Array<T>(length).fill(value);
    }

    // Java: streamNullable with 1 to 4 arguments: returns all the non-null values
    public static streamNullable<T>(...items: (T | null | undefined)[]): T[]
    {
        return items.filter((x): x is T => x !== null && x !== undefined);
    }

    // Java: concatStreams with 2 to 5 streams
    public static concatStreams<T>(...streams: (readonly T[])[]): T[]
    {
        return streams.flat() as T[];
    }

    public static allPairs<A, B, R>(as: readonly A[], bs: readonly B[], func: (a: A, b: B) => R): R[]
    {
        const r: R[] = [];
        for (const a of as)
        {
            for (const b of bs)
            {
                r.push(func(a, b));
            }
        }
        return r;
    }

    /**
     * Filters a stream down to only the items of the given class
     */
    public static filterClass<S, T extends S>(stream: readonly S[], targetClass: Class<T>): T[]
    {
        return stream.filter((x): x is T => x instanceof targetClass);
    }

    public static filterList<T>(src: readonly T[], filterBy: (t: T) => boolean): T[]
    {
        return src.filter(filterBy);
    }

    public static filterOutNulls<T>(stream: readonly (T | null | undefined)[]): T[]
    {
        return stream.filter((x): x is T => x !== null && x !== undefined);
    }

    // Java: filters a Stream<Optional<T>> down to the present values
    public static filterOptional<T>(stream: readonly (T | null)[]): T[]
    {
        return Utility.filterOutNulls(stream);
    }

    // Java: concat with 2 or 3 lists
    public static concat<T>(...lists: (readonly T[])[]): T[]
    {
        return lists.flat() as T[];
    }

    public static concatI<T>(a: readonly T[], b: readonly T[]): T[]
    {
        return [...a, ...b];
    }

    // Java: returns OptionalInt
    public static findFirstIndex<T>(curValue: readonly T[], match: (t: T) => boolean): number | null
    {
        const i = curValue.findIndex(match);
        return i === -1 ? null : i;
    }

    // Java: returns OptionalInt
    public static findLastIndex<T>(curValue: readonly T[], match: (t: T) => boolean): number | null
    {
        const i = curValue.findLastIndex(match);
        return i === -1 ? null : i;
    }

    /**
     * Java: cast(x, Class<T>).  Pass String or Boolean for the Java String/Boolean classes,
     * Decimal for Number/BigDecimal, or a class.
     */
    public static cast(x: unknown, cls: StringConstructor): string;
    public static cast(x: unknown, cls: BooleanConstructor): boolean;
    public static cast(x: unknown, cls: typeof Decimal): Decimal;
    public static cast<T>(x: unknown, cls: Class<T>): T;
    public static cast(x: unknown, cls: unknown): unknown
    {
        const r = Utility.castOrNull(x, cls as Class<unknown>);
        if (r !== null)
            return r;
        throw new InternalException("Cannot cast " + javaClassName(x) + " into " + Utility.className(cls));
    }

    private static className(cls: unknown): string
    {
        if (cls === String)
            return "class java.lang.String";
        if (cls === Boolean)
            return "class java.lang.Boolean";
        if (cls === Decimal)
            return "class java.lang.Number";
        return "class " + ((cls as { name?: string }).name ?? "?");
    }

    public static castOrNull(x: unknown, cls: StringConstructor): string | null;
    public static castOrNull(x: unknown, cls: BooleanConstructor): boolean | null;
    public static castOrNull(x: unknown, cls: typeof Decimal): Decimal | null;
    public static castOrNull<T>(x: unknown, cls: Class<T>): T | null;
    public static castOrNull(x: unknown, cls: unknown): unknown
    {
        if (cls === String)
            return typeof x === "string" ? x : null;
        if (cls === Boolean)
            return typeof x === "boolean" ? x : null;
        if (cls === Decimal)
            return Decimal.isDecimal(x) ? x : null;
        return x instanceof (cls as Class<unknown>) ? x : null;
    }

    // Java: casts an Object[] tuple
    public static castTuple(x: unknown, tupleSize: number): unknown[]
    {
        if (!Array.isArray(x))
            throw new InternalException("Cannot cast " + javaClassName(x) + " into class [Ljava.lang.Object;");
        if (x.length !== tupleSize)
            throw new InternalException("Tuple wrong size: " + tupleSize);
        return x;
    }

    public static replaceNull(x: Value | null, y: Value): Value
    {
        return x === null ? y : x;
    }

    // Could this be merged with replaceNull, above?
    public static orElse<T>(x: T | null | undefined, y: T): T
    {
        return x !== null && x !== undefined ? x : y;
    }

    public static makeListEx<T>(len: number, makeOne: (index: number) => T): T[]
    {
        const r: T[] = [];
        for (let i = 0; i < len; i++)
        {
            r.push(makeOne(i));
        }
        return r;
    }

    public static loadDataOld1(dataLines: readonly string[], withEachRow: (p: DataParser) => void): number
    {
        return Utility.loadDataLines(dataLines, s => new DataLexer(s), t => new DataParser(t), withEachRow);
    }

    public static loadData(dataLines: readonly string[], withEachRow: (p: DataParser2) => void): number
    {
        return Utility.loadDataLines(dataLines, s => new DataLexer2(s), t => new DataParser2(t), withEachRow);
    }

    // The shared body of Java's loadDataOld1 and loadData (identical apart from the grammar version).
    private static loadDataLines<P extends DataParser | DataParser2>(dataLines: readonly string[], makeLexer: (s: CharStream) => Lexer, makeParser: (t: TokenStream) => P, withEachRow: (p: P) => void): number
    {
        let count = 0;
        for (const lineText of dataLines)
        {
            count += 1;
            try
            {
                Utility.parseAsOne(lineText, makeLexer, makeParser, p =>
                {
                    try
                    {
                        p.startRow();
                        // PORT-NOTE: Java's isMatchedEOF() is public; antlr4ng's matchedEOF is protected.
                        if (!(p as unknown as { matchedEOF: boolean }).matchedEOF)
                        {
                            withEachRow(p);
                        }
                        p.endRow();
                        return 0;
                    }
                    catch (e)
                    {
                        if (!(e instanceof ParseCancellationException))
                            throw e;
                        throw new ParseException("token", p);
                    }
                });
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new UserException("Error loading data line: \"" + lineText + "\"", e);
            }
        }
        return count;
    }

    // Java: returns Optional<T>
    public static getLast<T>(list: readonly T[]): T | null
    {
        return list.length === 0 ? null : list[list.length - 1]!;
    }

    public static literal(vocabulary: Vocabulary, index: number): string
    {
        const s = vocabulary.getLiteralName(index)!;
        if (s.startsWith("'") && s.endsWith("'"))
            return s.substring(1, s.length - 1);
        else
            return s;
    }

    // Annotates that a String is universal, e.g. a symbol or a number, which doesn't need translating
    public static universal(s: string): Localized
    {
        return s;
    }

    // Annotates that a String is user input, which doesn't need translating
    public static userInput(s: string): Localized
    {
        return s;
    }

    // Java: concatLocal(a, b) and concatLocal(ImmutableList<String>)
    public static concatLocal(a: Localized | readonly Localized[], b?: Localized): Localized
    {
        return typeof a === "string" ? a + (b ?? "") : a.join("");
    }

    public static codePointToString(codepoint: number): string
    {
        return String.fromCodePoint(codepoint);
    }

    public static containsCodepoint(whole: string, codepoint: number): boolean
    {
        return whole.includes(Utility.codePointToString(codepoint));
    }

    /**
     * Sets the list to the given new size.  If elements
     * must be added, makeNew is called for each new element.
     * If elements must be removed, disposeOld is called for
     * each old element (removed from the end of the list)
     */
    public static resizeList<T>(list: T[], newSize: number, makeNew: (index: number) => T, disposeOld: (t: T) => void): void
    {
        while (list.length < newSize)
            list.push(makeNew(list.length));
        while (list.length > newSize)
            disposeOld(list.pop()!);
    }

    public static streamIndexed<T>(list: readonly T[]): Pair<number, T>[]
    {
        return list.map((t, i) => new Pair(i, t));
    }

    // Java: separate int and double versions, which behave the same
    public static clampIncl(lowBoundIncl: number, value: number, highBoundIncl: number): number
    {
        if (value < lowBoundIncl)
            return lowBoundIncl;
        else if (value > highBoundIncl)
            return highBoundIncl;
        else
            return value;
    }

    /**
     * Java: Double values are formatted with String.format("%f"), BigDecimals with toPlainString.
     * PORT-NOTE: a JavaScript number counts as a Java Double; "%f" is emulated with toFixed(6),
     * which may round a halfway case differently.
     */
    public static numberToString(value: Decimal | number): string
    {
        if (typeof value === "number")
            return value.toFixed(6);
        return toPlainString(value);
    }

    /**
     * Checks if the two ranges aMin--aMax and bMin--bMax overlap by at least overlapAmount (true = they do overlap by that much or more)
     */
    public static rangeOverlaps(overlapAmount: number, aMin: number, aMax: number, bMin: number, bMax: number): boolean
    {
        // From https://stackoverflow.com/questions/2953967/built-in-function-for-computing-overlap-in-python
        return Math.max(0, Math.min(aMax, bMax)) - Math.max(aMin, bMin) >= overlapAmount;
    }

    // If item present in map, return it, otherwise return null (Java: Optional)
    public static getIfPresent<K, V>(map: ReadonlyMapLike<K, V>, key: K): V | null
    {
        const value = map.get(key);
        return value !== null && value !== undefined ? value : null;
    }

    public static minRow(a: AbsRowIndex, b: AbsRowIndex): AbsRowIndex
    {
        return (a <= b) ? a : b;
    }

    public static maxRow(a: AbsRowIndex, b: AbsRowIndex): AbsRowIndex
    {
        return (a >= b) ? a : b;
    }

    public static minCol(a: AbsColIndex, b: AbsColIndex): AbsColIndex
    {
        return (a <= b) ? a : b;
    }

    public static maxCol(a: AbsColIndex, b: AbsColIndex): AbsColIndex
    {
        return (a >= b) ? a : b;
    }

    public static later<T>(t: T): T
    {
        return t;
    }

    public static preprocessDate(original: string): string
    {
        // We split on colons, which we preserve (because they are usually in time):
        const splitByColon = javaSplit(original, /:/u);
        let reAssembled = "";
        for (let i = 0; i < splitByColon.length; i++)
        {
            // Generally, we replace any punctuation or space sequence with a single space, before the first colon:
            // (Java's (?U)\p{Alnum} is alphabetic or a decimal digit.)
            if (i === 0)
                splitByColon[i] = splitByColon[i]!.replace(/[^\p{Alphabetic}\p{Nd}]+/gu, " ");
            reAssembled += splitByColon[i];
            if (i < splitByColon.length - 1)
                reAssembled += ":";
        }
        return reAssembled;
    }

    /**
     * Turns a list of pairs into a map, with insertion order matching the given list.
     */
    public static pairListToMap<K, V>(list: readonly Pair<K, V>[]): HashMap<K, V>
    {
        const builder = new HashMap<K, V>();
        for (const pair of list)
        {
            if (builder.has(pair.getFirst()))
                throw new RangeError("Multiple entries with same key: " + String(pair.getFirst())); // Java: Guava's IllegalArgumentException
            builder.set(pair.getFirst(), pair.getSecond());
        }
        return builder;
    }

    public static appendStream<T>(stream: readonly T[], appendItem: T): T[]
    {
        return [...stream, appendItem];
    }

    // List.get, but throws InternalException if out of bounds
    public static getI<T>(list: readonly T[], index: number): T
    {
        if (index < 0 || index >= list.length)
            throw new InternalException("List index out of bounds: " + index + " versus " + list.length);
        return list[index]!;
    }

    // Java creates a live mirror of the given list.  PORT-NOTE: here it maps eagerly, so later
    // changes to the original are not reflected (the Java comments say not to rely on that).
    public static mappedList<S, T>(original: readonly S[], mapping: (s: S) => T): T[]
    {
        return original.map(s => mapping(s));
    }

    // In characters, how long is the common subsequence at the start of the strings?
    public static longestCommonStart(a: string, aStartAt: number, b: string, bStartAt: number): number
    {
        let i = 0;
        for (; i + aStartAt < a.length && i + bStartAt < b.length; i++)
        {
            if (a[i + aStartAt] !== b[i + bStartAt])
                break;
        }
        return i;
    }

    public static longestCommonStartIgnoringCase(a: string, aStartAt: number, b: string, bStartAt: number): number
    {
        let i = 0;
        for (; i + aStartAt < a.length && i + bStartAt < b.length; i++)
        {
            // Borrowed from String's compareIgnoringCase:
            if (!javaRegionMatches(a, true, i + aStartAt, b, i + bStartAt, 1))
                break;
        }
        return i;
    }

    // Java: overloaded for MainParser.DetailContext, MainParser.DetailPrefixedContext,
    // MainParser2.DetailContext and TableParser2.DetailContext.
    public static getDetail(detail: DetailLike): string
    {
        return detail.detailLine().map(l => javaTrim(l.DETAIL_LINE().getText()) + "\n").filter(s => javaTrim(s) !== "").join("");
    }

    // Java: overloaded for MainParser.DetailPrefixedContext, MainParser2.DetailContext and TableParser2.DetailContext.
    public static getDetailLines(detail: DetailLike): string[]
    {
        return detail.detailLine().map(l => javaTrim(l.DETAIL_LINE().getText())).filter(s => s !== "").map(s => s + "\n");
    }

    public static splitLines(input: string): string[]
    {
        return javaSplit(input, /\r?\n/);
    }

    // We wrap the entire original sequence, but we only do
    // the date preprocess beginning at startPos
    public static wrapPreprocessDate(original: string, startPos: number): WrappedCharSequence
    {
        // Until we see first colon, we replace any sequences of
        // non-alphanumeric characters with a single space
        const replaceRanges: IndexRange[] = [];
        let checkedUpToInOriginal = startPos;
        let firstColonIndexInOriginal = Number.MAX_SAFE_INTEGER;
        const isLetterOrDigitChar = (i: number) => isLetterOrDigit(original.charCodeAt(i));
        const isWhitespaceChar = (i: number) => isWhitespace(original.charCodeAt(i));

        // Translated pos, and true if in a replaced range
        const translateWrappedToOriginal = (wrapped: number): Pair<number, boolean> =>
        {
            // Wrapped to original is identity transformation with no ranges.
            // Effect of range is to condense range into one char
            let add = 0;
            for (const rr of replaceRanges)
            {
                if (wrapped + add === rr.start)
                {
                    // Falls in range; replace with single space.
                    return new Pair(rr.start, true);
                }
                else if (wrapped + add > rr.start)
                {
                    // Ranges are start(incl) to end(excl) and are replaced by single space.
                    // So e.g. given "a   b" range will be 1, 4 and we should subtract two chars:
                    add += (rr.end - rr.start - 1);
                }
                else
                {
                    // Ranges are in order, so future ranges
                    // won't be before us, either
                    break;
                }
            }
            return new Pair(wrapped + add, false);
        };

        const checkUpTo = (index: number): void =>
        {
            while (checkedUpToInOriginal < index && checkedUpToInOriginal < original.length - 1)
            {
                // Must do more checking:
                checkedUpToInOriginal += 1;
                const c = original[checkedUpToInOriginal]!;
                const notLetterNorDigit = !isLetterOrDigitChar(checkedUpToInOriginal);
                const seenColon = firstColonIndexInOriginal !== Number.MAX_SAFE_INTEGER;
                const whitespace = isWhitespaceChar(checkedUpToInOriginal);
                if (c === ":")
                {
                    if (!seenColon)
                        firstColonIndexInOriginal = Math.min(firstColonIndexInOriginal, checkedUpToInOriginal);
                }
                else if (notLetterNorDigit && (!seenColon || whitespace))
                {
                    const start = checkedUpToInOriginal;
                    let end = start + 1;
                    while (end < original.length && ((!isLetterOrDigitChar(end) && !whitespace) || (isWhitespaceChar(end) && whitespace)))
                    {
                        end += 1;
                    }
                    // Form a replacement range
                    replaceRanges.push(new IndexRange(start, end));
                    checkedUpToInOriginal = end;
                }
            }
        };

        const wrapped: WrappedCharSequence = {
            length(): number
            {
                let length: number;
                for (length = startPos - 1; length < original.length && wrapped.translateWrappedToOriginalPos(length) < original.length; length++)
                {
                    checkUpTo(length + 1);
                }
                return length;
            },
            translateWrappedToOriginalPos(target: number): number
            {
                return translateWrappedToOriginal(target).getFirst();
            },
            charAt(index: number): string
            {
                if (index < 0)
                    throw new RangeError("Index cannot be negative: " + index); // Java: IllegalArgumentException
                if (index < startPos)
                    return original[index]!;

                checkUpTo(index);

                const mapped = translateWrappedToOriginal(index);
                if (mapped.getSecond())
                    return " ";
                else
                {
                    const c = original[mapped.getFirst()];
                    if (c === undefined)
                        throw new IndexOutOfBoundsException("index " + mapped.getFirst() + ", length " + original.length);
                    return c;
                }
            },
            subSequence(start: number, end: number): string
            {
                // For this, we use a string copy:
                let chars = "";
                for (let i = start; i < end; i++)
                {
                    chars += wrapped.charAt(i);
                }
                return chars;
            },
            toString(): string
            {
                return wrapped.subSequence(0, wrapped.length());
            },
        };
        return wrapped;
    }

    public static replicateM<T>(length: number, make: () => T): T[]
    {
        const r: T[] = [];
        for (let i = 0; i < length; i++)
        {
            r.push(make());
        }
        return r;
    }

    public static replicateM_Ex<T>(length: number, make: () => T): T[]
    {
        return Utility.replicateM(length, make);
    }

    public static countIn(small: string, large: string): number
    {
        let total = 0;
        for (let last = large.indexOf(small); last !== -1; last = large.indexOf(small, last + 1))
        {
            total += 1;
        }
        return total;
    }

    /**
     * Java: compareNumbers(a, b) and compareNumbers(a, b, epsilon).
     * Without epsilon this is just numeric comparison (-1, 0 or 1).
     */
    public static compareNumbers(a: Decimal, b: Decimal, epsilon: Pair<EpsilonType, Decimal> | null = null): number
    {
        const da = a;
        const db = b;
        if (epsilon === null)
            return da.cmp(db);
        else
        {
            try
            {
                if (epsilon.getFirst() === EpsilonType.RELATIVE)
                {
                    // PORT-NOTE: this is the Java code exactly, including what looks like a bug: it
                    // computes |a-b|/a - 1 (not |a-b|/|a|), which is < epsilon for almost all pairs,
                    // including any pair where a is negative.  (Java subtracts exactly, then divides
                    // with DECIMAL128; the subtraction here is exact for numbers within 34 digits
                    // of each other's magnitude.)
                    const diff = da.minus(db).abs();
                    if (da.eq(db) || (!da.isZero() && diff.div(da).minus(ONE).cmp(epsilon.getSecond()) < 0)
                        || (!db.isZero() && diff.div(db).minus(ONE).cmp(epsilon.getSecond()) < 0))
                        return 0;
                }
                else if (epsilon.getFirst() === EpsilonType.ABSOLUTE)
                {
                    if (da.minus(db).abs().cmp(epsilon.getSecond()) <= 0)
                        return 0;
                }
                return da.cmp(db);
            }
            catch (e)
            {
                if (!(e instanceof ArithmeticException))
                    throw e;
                return da.cmp(db);
            }
        }
    }

    // Java: mapOptionalInt(OptionalInt, UnaryOperator<Integer>)
    public static mapOptionalInt(src: number | null, op: (n: number) => number): number | null
    {
        return src !== null ? op(src) : null;
    }

    // Between each pair of items in the first stream, makes a new item and adds it
    public static intercalateStreamM<T>(original: readonly T[], makeSpacer: () => T): T[]
    {
        const inclSpacers: T[] = [];
        for (let i = 0; i < original.length; i++)
        {
            if (i > 0)
                inclSpacers.push(makeSpacer());
            inclSpacers.push(original[i]!);
        }
        return inclSpacers;
    }

    public static lexesAs(src: string, makeLexer: (input: CharStream) => Lexer, tokenType: number): boolean
    {
        const inputStream = CharStream.fromString(src);
        const lexer = makeLexer(inputStream);
        const errorListener = new DescriptiveErrorListener();
        // PORT-NOTE: Java leaves the default console error listener in place too, which only prints.
        lexer.removeErrorListeners();
        lexer.addErrorListener(errorListener);
        const token: Token = lexer.nextToken();
        return errorListener.errors.length === 0 && token.type === tokenType && token.text === src;
    }

    public static onNullable<T, R>(t: T | null, f: (t: T) => R): R | null
    {
        if (t === null)
        {
            return null;
        }
        else
        {
            return f(t);
        }
    }

    // Given an original user-entered String, and a stream of options
    // that can be converted to a String (or several alternatives), returns an ordered stream
    // (most likely first) of items that the user may have mis-spelt
    // Not all items are returned, only those that meet a threshold.
    public static findAlternatives<T>(raw: string, possibleItems: readonly T[], extractString: (t: T) => readonly string[]): T[]
    {
        const d = new Damerau();
        const threshold = raw.length <= 4 ? 1 : 2;
        const withDistance: Pair<number, T>[] = possibleItems.flatMap(item =>
        {
            // For each item, only keep the string that is the closest match:
            return extractString(item).map(s => new Pair(d.distance(raw.toLowerCase(), s.toLowerCase()), item)).sort((x, y) => x.getFirst() - y.getFirst()).slice(0, 1);
        });
        return withDistance.filter(p => p.getFirst() <= threshold).sort((x, y) => x.getFirst() - y.getFirst()).map(p => p.getSecond());
    }

    // Like longer.startsWith(shorter) but ignoring case
    public static startsWithIgnoreCase(longer: string, shorter: string, offsetInLonger: number = 0): boolean
    {
        return javaRegionMatches(longer, true, offsetInLonger, shorter, 0, shorter.length);
    }

    /**
     * Type-safe get method for Map.  Note important that it's Map[K,V] and not Map[? super K, V]
     */
    public static get<K, V>(map: ReadonlyMapLike<K, V>, key: K): V | null
    {
        return map.get(key) ?? null;
    }

    /**
     * Type-safe get method for Map.  Note important that it's Map[K,V] and not Map[? super K, V]
     */
    public static getOrThrow<K, V>(map: ReadonlyMapLike<K, V>, key: K, makeException: () => Error): V
    {
        const v = map.get(key);
        if (v !== null && v !== undefined)
            return v;
        else
            throw makeException();
    }

    /**
     * Type-safe contains method for Set.
     */
    public static contains<K>(set: { has(key: K): boolean }, key: K): boolean
    {
        return set.has(key);
    }

    /**
     * For running simulation on FX; only to be used where you're certain it's safe.
     */
    public static launderSimulationEx<T>(simulationSupplier: () => T): T
    {
        return simulationSupplier();
    }
}

export interface WrappedCharSequence
{
    length(): number;
    charAt(index: number): string;
    subSequence(start: number, end: number): string;
    toString(): string;
    translateWrappedToOriginalPos(position: number): number;
}

export class IndexRange
{
    public constructor(public readonly start: number, public readonly end: number)
    {
    }
}

export class DescriptiveErrorListener extends BaseErrorListener
{
    public readonly errors: string[] = [];

    public override syntaxError<S extends Token, T extends ATNSimulator>(recognizer: Recognizer<T>, _offendingSymbol: S | null, line: number, charPositionInLine: number, msg: string, _e: RecognitionException | null): void
    {
        let sourceName = recognizer.inputStream?.getSourceName() ?? "";
        // PORT-NOTE: antlr4ng reports an unnamed source as "<unknown>"; Java's ANTLR as an empty name.
        if (sourceName !== "" && sourceName !== "<unknown>")
        {
            sourceName = `${sourceName}:${line}:${charPositionInLine}: `;
        }
        else
            sourceName = "";

        this.errors.push(sourceName + "line " + line + ":" + charPositionInLine + " " + msg);
    }
}

export abstract class Record
{
    public abstract getField(name: ExpressionIdentifier): Value;

    // Java: returns an ImmutableMap (which keeps insertion order)
    public abstract getFullContent(): ReadonlyMap<ExpressionIdentifier, Value>;
}

export class RecordMap extends Record
{
    private readonly values: ReadonlyMap<ExpressionIdentifier, Value>;

    public constructor(values: ReadonlyMapLike<ExpressionIdentifier, Value>)
    {
        super();
        this.values = new Map(values);
    }

    public static immediate(values: ReadonlyMapLike<ExpressionIdentifier, Value>): RecordMap
    {
        return new RecordMap(values);
    }

    public override getField(name: ExpressionIdentifier): Value
    {
        const value = this.values.get(name);
        if (value === undefined)
            throw new InternalException("Record unexpectedly lacking field: \"" + name + "\"");
        return value;
    }

    public override getFullContent(): ReadonlyMap<ExpressionIdentifier, Value>
    {
        return this.values;
    }

    // Useful for debugging
    public override toString(): string
    {
        return "RecordMap{values={" + [...this.values].map(([k, v]) => k + "=" + String(v)).join(", ") + "}}";
    }
}

// Eugh -- nasty way to represent ValueFunction which must depend on Expression
export abstract class ValueFunctionBase
{
}

export abstract class ListEx
{
    public abstract size(): number;

    public abstract get(index: number): Value;

    // For comparison during testing
    public hashCode(): number
    {
        const size = this.size();
        let result = size;
        for (let i = 0; i < size; i++)
        {
            result = (Math.imul(31, result) + javaHashCode(this.get(i))) | 0;
        }
        return result;
    }

    // For comparison during testing
    public equals(obj: unknown): boolean
    {
        if (!(obj instanceof ListEx))
            return false;
        const size = this.size();
        if (size !== obj.size())
            return false;
        for (let i = 0; i < size; i++)
        {
            if (Utility.compareValues(this.get(i), obj.get(i)) !== 0)
                return false;
        }
        return true;
    }

    // To help during testing:
    public toString(): string
    {
        try
        {
            const size = this.size();
            let b = "[";
            for (let i = 0; i < size; i++)
                b += (i === 0 ? "" : ", ") + (Decimal.isDecimal(this.get(i)) ? toJavaString(this.get(i) as Decimal) : String(this.get(i)));
            b += "]";
            return b;
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            return "ERR: " + e.getLocalizedMessage();
        }
    }

    public static empty(): ListEx
    {
        return new class extends ListEx
        {
            public override size(): number
            {
                return 0;
            }

            public override get(_index: number): Value
            {
                throw new InternalException("Cannot access element of empty list");
            }
        }();
    }
}

export class ListExList extends ListEx
{
    private readonly items: readonly Value[];

    public constructor(items: readonly Value[])
    {
        super();
        this.items = items;
    }

    public static immediate(items: readonly Value[]): ListExList
    {
        return new ListExList(items);
    }

    public override size(): number
    {
        return this.items.length;
    }

    public override get(index: number): Value
    {
        if (index < 0 || index >= this.items.length)
            throw new IndexOutOfBoundsException("Index " + index + " out of bounds for length " + this.items.length);
        return this.items[index]!;
    }
}
