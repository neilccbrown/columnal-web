// Port of xyz.columnal.importers.GuessFormat (importers module).
//
// PORT-DEFERRED: Import.getGUI (Phase 11).  For a text file, Java's getGUI shows a row for each
// of the charset, separator and quote choices (ImporterGUI.makeGUI, with the ChoiceDetails
// below) bound to the properties in guessTextFormat, and updates the source format whenever one
// changes.  The import dialogs are rebuilt in the GUI and are reached through ImporterDialogs.
import type { ExpressionIdentifier, Localized } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { BlankColumnType, BoolColumnType, CleanDateColumnType, ColumnType, NumericColumnType, OrBlankColumnType, TextColumnType } from "../../data/data/columntype/ColumnTypes.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { HashSet } from "../../java/HashMap.js";
import { parseBigDecimal } from "../../java/JavaBigDecimal.js";
import { Charset } from "../../java/JavaCharset.js";
import { codePoints, isCurrencySymbol, isDigit, isLetter, isWhitespace, stringFromCodePoints } from "../../java/JavaCharacter.js";
import { SimpleObjectProperty, type ObjectExpression } from "../../java/JavaFXBeans.js";
import { javaListGet } from "../../java/JavaCollections.js";
import { javaEquals, javaObjectsHash, javaStringHashCode } from "../../java/JavaObject.js";
import { javaOffsetByCodePoints, javaReplace, javaTrim, NumberFormatException } from "../../java/JavaString.js";
import { DateTimeParseException, LocalDate, LocalTime } from "../../java/time/JavaTime.js";
import { Platform } from "../../java/Platform.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../types/data/unit/UnitManager.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { Workers } from "../../utility/utility/Workers.js";
import { ChoiceDetails } from "./ChoiceDetails.js";
import { ColumnInfo } from "./ColumnInfo.js";
import { DateFormat } from "./DateFormat.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";
import { ImporterUtility } from "./ImporterUtility.js";
import type { JavaFile } from "../../java/JavaFile.js";

enum AlphabetItem
{
    NUMERIC, PUNCTUATION, BOOLEAN, LETTER
}

class RowInfo
{
    // Each item is one column's content on this row
    public readonly columnContents: string[] = [];
    // Each pair is (content, style)
    public readonly originalContentAndStyle: Pair<string, string>[] = [];
}

/**
 * Created by neil on 20/10/2016.
 */
export class GuessFormat
{
    public static readonly INITIAL_ROWS_TEXT_FILE = 10_000;
    public static readonly SEP_CHOICES: readonly string[] = [",", ";", "\t", ":", "|", " "];
    public static readonly QUOTE_CHOICES: readonly string[] = ["", "\"", "'"];

    /**
     *
     * @param mgr
     * @param vals List of rows, where each row is list of values
     * @return
     */
    public static guessGeneralFormat(mgr: UnitManager, vals: readonly (readonly string[])[], trimChoice: GuessFormat.TrimChoice, getColumnName: (trimChoice: GuessFormat.TrimChoice, index: number) => ColumnId): ColumnInfo[]
    {
        return GuessFormat.guessBodyFormat(mgr, trimChoice, vals, getColumnName);
    }

    public static charsetChoiceDetails(available: readonly Charset[]): ChoiceDetails<Charset>
    {
        // In future, we should allow users to specify
        // (For now, they can just re-save as UTF-8)
        return new ChoiceDetails<Charset>("guess.charset", "guess-format/charset", [...available], null);
    }

    public static separatorChoiceDetails(): ChoiceDetails<string>
    {
        return new ChoiceDetails<string>("guess.separator", "guess-format/separator", GuessFormat.SEP_CHOICES, GuessFormat.enterSingleChar(x => x));
    }

    public static quoteChoiceDetails(): ChoiceDetails<string>
    {
        return new ChoiceDetails<string>("guess.quote", "guess-format/quote", GuessFormat.QUOTE_CHOICES, GuessFormat.enterSingleChar(x => x));
    }

    public static guessTextFormat(typeManager: TypeManager, unitManager: UnitManager, initialByCharset: ReadonlyMap<Charset, readonly string[]>, itfOverride: GuessFormat.InitialTextFormat | null, trimOverride: GuessFormat.TrimChoice | null): GuessFormat.Import<GuessFormat.InitialTextFormat, GuessFormat.FinalTextFormat>
    {
        let initialCharsetGuess: Charset | null;
        if (itfOverride !== null)
        {
            initialCharsetGuess = itfOverride.charset;
        }
        else
        {
            initialCharsetGuess = GuessFormat.guessCharset([...initialByCharset.keys()]);
        }
        const charsetChoice = new SimpleObjectProperty<Charset | null>(initialCharsetGuess);
        let sepAndQuot: Pair<string | null, string | null> | null;
        if (itfOverride !== null)
            sepAndQuot = new Pair<string | null, string | null>(itfOverride.separator, itfOverride.quote);
        else
        {
            const lines = initialCharsetGuess === null ? undefined : GuessFormat.getByCharset(initialByCharset, initialCharsetGuess);
            sepAndQuot = lines === undefined ? null : GuessFormat.guessSepAndQuot(lines);
        }
        const sepChoice = new SimpleObjectProperty<string | null>(sepAndQuot === null ? null : sepAndQuot.getFirst());
        const quoteChoice = new SimpleObjectProperty<string | null>(sepAndQuot === null ? null : sepAndQuot.getSecond());
        const srcFormat = new SimpleObjectProperty<GuessFormat.InitialTextFormat | null>(GuessFormat.makeInitialTextFormat(charsetChoice, sepChoice, quoteChoice));

        const loadValues = (initial: readonly string[], sep: string | null, quot: string | null): string[][] =>
        {
            const rowInfos: RowInfo[] = [];
            for (let i = 0; i < initial.length; i++)
            {
                if (initial[i]! !== "")
                {
                    const rowInfo = GuessFormat.splitIntoColumns(initial[i]!, sep, quot);
                    rowInfos.push(rowInfo);
                }
            }
            return Utility.mapListI(rowInfos, r => r.columnContents);
        };

        return {
            currentSrcFormat(): ObjectExpression<GuessFormat.InitialTextFormat | null>
            {
                return srcFormat;
            },

            loadSource(initialTextFormat: GuessFormat.InitialTextFormat): GuessFormat.Import.SrcDetails
            {
                const initialCheck = GuessFormat.getByCharset(initialByCharset, initialTextFormat.charset);
                if (initialCheck === undefined)
                    throw new InternalException("initialByCharset key lookup returned null");

                const initial = initialCheck;

                const sep = initialTextFormat.separator;
                const quot = initialTextFormat.quote;

                const values = loadValues(initial, sep, quot);
                ImporterUtility.rectangulariseAndRemoveBlankRows(values);
                const trimChoice = trimOverride !== null ? trimOverride : GuessFormat.guessTrim(values);
                const columnInfos: ColumnInfo[] = [];
                if (values.length !== 0)
                {
                    for (let i = 0; i < values[0]!.length; i++)
                    {
                        const columnId = new ColumnId(IdentifierUtility.identNum("Col", (i + 1)));
                        columnInfos.push(new ColumnInfo(new TextColumnType(), columnId));
                    }
                }
                return new GuessFormat.Import.SrcDetails(trimChoice, ImporterUtility.makeEditableRecordSet(typeManager, values, columnInfos), null);
            },

            loadDest(initialTextFormat: GuessFormat.InitialTextFormat, trimChoice: GuessFormat.TrimChoice): Pair<GuessFormat.FinalTextFormat, RecordSet>
            {
                const initialCheck = GuessFormat.getByCharset(initialByCharset, initialTextFormat.charset);
                if (initialCheck === undefined)
                    throw new InternalException("initialByCharset key lookup returned null");

                const initial = initialCheck;

                const vals = loadValues(initial, initialTextFormat.separator, initialTextFormat.quote);
                ImporterUtility.rectangulariseAndRemoveBlankRows(vals);
                const columnTypes = GuessFormat.guessBodyFormat(unitManager, trimChoice, vals, null);
                // PORT-NOTE: Java's vals.get(0) throws IndexOutOfBoundsException here if there are
                // no rows (only when debug logging is on would anyone see the message, but the
                // exception is thrown regardless), so an empty file can't be imported.  That is kept.
                Log.debug("Vals width " + javaListGet(vals, 0).length + " cols " + columnTypes.length + " which are: " + Utility.listToString(columnTypes));
                return new Pair(new GuessFormat.FinalTextFormat(initialTextFormat, trimChoice, columnTypes), ImporterUtility.makeEditableRecordSet(typeManager, trimChoice.trim(vals), columnTypes));
            },
        };
    }

    // A Java Map<Charset, ...> lookup: Charsets are equal if they have the same name.
    private static getByCharset(initialByCharset: ReadonlyMap<Charset, readonly string[]>, charset: Charset): readonly string[] | undefined
    {
        for (const [c, lines] of initialByCharset)
        {
            if (c.equals(charset))
                return lines;
        }
        return undefined;
    }

    public static makeInitialTextFormat(charsetChoice: SimpleObjectProperty<Charset | null>, sepChoice: SimpleObjectProperty<string | null>, quoteChoice: SimpleObjectProperty<string | null>): GuessFormat.InitialTextFormat | null
    {
        const charset = charsetChoice.get();
        const sep = sepChoice.get();
        const quote = quoteChoice.get();
        if (charset !== null)
            return new GuessFormat.InitialTextFormat(charset, sep, quote);
        return null;
    }

    // vals must be rectangular
    public static guessTrim(values: readonly (readonly string[])[]): GuessFormat.TrimChoice
    {
        if (values.length === 0)
            return new GuessFormat.TrimChoice(0, 0, 0, 0);

        const numColumns = values[0]!.length;
        // We begin in the middle, and then expand outwards, as long as our alphabet hasn't had too many changes
        // in too many columns.

        const columnAlphabets: Set<AlphabetItem>[] = [];

        let trimFromTop = 0;
        const startingRow = values.length < 16 ? Math.trunc(values.length / 2) : 8;
        for (let row = startingRow; row >= 0; row--)
        {
            const rowVals = values[row]!;
            if (columnAlphabets.length === 0)
            {
                columnAlphabets.push(...Utility.mapList(rowVals, s => GuessFormat.calculateAlphabet(s)));
            }
            else
            {
                let alphabetsChanged = 0;
                for (let i = 0; i < numColumns; i++)
                {
                    const alphabet = GuessFormat.calculateAlphabet(rowVals[i]!);
                    let changed = false;
                    // EnumSet iterates in declaration order:
                    for (const alphabetItem of [...alphabet].sort((a, b) => a - b))
                    {
                        const columnAlphabet = columnAlphabets[i]!;
                        const wasNumericOnly = !columnAlphabet.has(AlphabetItem.LETTER) && !columnAlphabet.has(AlphabetItem.BOOLEAN);
                        const wasBooleanOnly = columnAlphabet.size === 1 && columnAlphabet.has(AlphabetItem.BOOLEAN) && startingRow - row > 1;
                        // Alphabet changes are: adding non-numeric to numeric
                        // or adding punctuation to non-letter
                        const added = !columnAlphabet.has(alphabetItem);
                        columnAlphabet.add(alphabetItem);
                        if (added && (wasNumericOnly || wasBooleanOnly))
                            changed = true;
                    }
                    if (changed)
                        alphabetsChanged += 1;
                }
                if (alphabetsChanged >= (numColumns < 4 ? Math.max(1, Math.trunc(numColumns / 2)) : Math.trunc(numColumns / 4)))
                {
                    trimFromTop = row + 1;
                    break;
                }
            }
        }

        // Now that we have trim from top, we trim the sides by removing any columns which are entirely blank
        // This is equivalent to finding the first non-blank:
        const trimFromTopFinal = trimFromTop;
        const firstMatch = (count: number, pred: (c: number) => boolean): number =>
        {
            for (let c = 0; c < count; c++)
            {
                if (pred(c))
                    return c;
            }
            return 0;
        };
        const trimLeft = firstMatch(numColumns, c => values.slice(trimFromTopFinal).some(row => row[c]! !== ""));
        const trimRight = firstMatch(numColumns - trimLeft, c => values.slice(trimFromTopFinal).some(row => row[numColumns - 1 - c]! !== ""));


        return new GuessFormat.TrimChoice(trimFromTop, 0, trimLeft, trimRight);
    }

    private static calculateAlphabet(s: string): Set<AlphabetItem>
    {
        // Replace numbers with zero:
        s = s.replace(/[+-]?[0-9]+(,[0-9]+)*(\.[0-9]+)?(e[+-]?[0-9]+)?/gu, "0");
        switch (s.toLowerCase())
        {
            case "t": case "f": case "true": case "false": case "yes": case "no": case "y": case "n":
                return new Set([AlphabetItem.BOOLEAN]);
        }
        const r = new Set<AlphabetItem>();
        for (const n of codePoints(s))
        {
            // PORT-NOTE: bug fix.  Java counted "%" as punctuation, so in a number column where
            // some values have a "%" suffix and the row guessTrim starts from doesn't, the first
            // row with a "%" above it looked like a header: rows of data were left out, and one
            // was taken for the column's name.  Here "%" counts as part of a number, as a currency
            // symbol does (and as guessBodyFormat takes both as a number's suffix).  Quote marks
            // (left on values when no quote character was guessed) are ignored, so that a quoted
            // "55%" doesn't look like a header either.
            if (isDigit(n) || isCurrencySymbol(n) || n === 0x25 /* '%' */)
            {
                r.add(AlphabetItem.NUMERIC);
            }
            else if (n === 0x22 /* '"' */ || n === 0x27 /* "'" */)
            {
                // Ignore
            }
            else if (isLetter(n))
            {
                r.add(AlphabetItem.LETTER);
            }
            else if (!isWhitespace(n))
            {
                r.add(AlphabetItem.PUNCTUATION);
            }
        }
        return r;
    }

    private static guessSepAndQuot(lines: readonly string[]): Pair<string, string>
    {
        let bestSepAndQuot = new Pair<string, string>("", "");
        let bestScore = -Number.MAX_VALUE;

        for (const quot of GuessFormat.QUOTE_CHOICES)
        {
            for (const sep of GuessFormat.SEP_CHOICES)
            {
                // Guava's HashMultiset: iterates each distinct count, in the order first added,
                // as many times as it was added.
                const counts = new Map<number, number>();
                for (let i = 0; i < lines.length; i++)
                {
                    if (lines[i]! !== "")
                    {
                        const count = GuessFormat.splitIntoColumns(lines[i]!, sep, quot).columnContents.length;
                        counts.set(count, (counts.get(count) ?? 0) + 1);
                    }
                }

                if (counts.size === 0 || (counts.size === 1 && counts.has(1)))
                {
                    // All columns size one; totally rubbish, don't bother remembering
                }
                else if (counts.size === 1)
                {
                    // All sizes the same, but not all zero
                    return new Pair(sep, quot);
                }
                else
                {
                    // Higher score is better choice so negate variance:
                    // Also add mean to bias towards more columns if similar variance
                    const values: number[] = [];
                    for (const [count, times] of counts)
                    {
                        for (let t = 0; t < times; t++)
                            values.push(count);
                    }
                    const score = (GuessFormat.guavaMeanOf(values) / 10.0) - GuessFormat.guavaSampleVariance(values);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestSepAndQuot = new Pair(sep, quot);
                    }

                }
            }
        }

        return bestSepAndQuot;
    }

    // Guava's Stats.meanOf, which computes a running mean (all values here are finite):
    private static guavaMeanOf(values: readonly number[]): number
    {
        let mean = values[0]!;
        let count = 1;
        for (let i = 1; i < values.length; i++)
        {
            const value = values[i]!;
            count++;
            mean += (value - mean) / count;
        }
        return mean;
    }

    // Guava's Stats.of(values).sampleVariance(), using Welford's algorithm as StatsAccumulator does:
    private static guavaSampleVariance(values: readonly number[]): number
    {
        let count = 0;
        let mean = 0;
        let sumOfSquaresOfDeltas = 0;
        for (const value of values)
        {
            if (count === 0)
            {
                count = 1;
                mean = value;
            }
            else
            {
                count++;
                const delta = value - mean;
                mean += delta / count;
                sumOfSquaresOfDeltas += delta * (value - mean);
            }
        }
        return Math.max(sumOfSquaresOfDeltas, 0) / (count - 1);
    }

    private static guessCharset<C extends Charset>(charsets: readonly C[]): C | null
    {
        // Pretty simple: if UTF-8 is in there, use that, else use any.
        const utf8 = Charset.UTF_8;
        let arbitrary: C | null = null;
        for (const charset of charsets)
        {
            if (charset.equals(utf8))
                return charset;
            else
                arbitrary = charset;
        }
        return arbitrary;
    }

    // Unused in Java, too.
    public static pickCharset(s: string): Either<Localized, Charset>
    {
        try
        {
            return Either.right(Charset.forName(s));
        }
        catch (_e)
        {
            return Either.left(TranslationUtility.getString("charset.not.available", s));
        }
    }

    private static enterSingleChar<T>(make: (s: string) => T): (s: string) => Either<Localized, T>
    {
        return s =>
        {
            if (s.length === 1)
                return Either.right(make(s));
            else
                return Either.left(TranslationUtility.getString("error.single.char.only"));
        };
    }

    // Split a row of text into columns, given a separator and a quote character
    private static splitIntoColumns(row: string, sep: string | null, quote: string | null): RowInfo
    {
        // Java string concatenation: a null quote gives "nullnull".
        const escapedQuote = String(quote) + String(quote);

        let inQuoted = false;
        let sb = "";
        const r = new RowInfo();
        for (let i = 0; i < row.length;)
        {
            // First check for escaped quote (which may otherwise look like a quote):
            if (inQuoted && escapedQuote !== "" && row.startsWith(escapedQuote, i))
            {
                // Skip it:
                sb += String(quote);
                i += escapedQuote.length;

                if (quote !== null && quote !== "" && escapedQuote.endsWith(quote))
                {
                    r.originalContentAndStyle.push(new Pair(escapedQuote.substring(0, escapedQuote.length - quote.length), "escaped-quote-escape"));
                    r.originalContentAndStyle.push(new Pair(quote, "escaped-quote-quote"));
                }
                else
                {
                    r.originalContentAndStyle.push(new Pair(escapedQuote, "escaped-quote"));
                }
            }
            else if (quote !== null && quote !== "" && row.startsWith(quote, i) && (inQuoted || javaTrim(sb) === ""))
            {
                if (!inQuoted)
                {
                    // Ignore the spaces beforehand:
                    sb = "";
                }
                inQuoted = !inQuoted;
                i += quote.length;
                r.originalContentAndStyle.push(new Pair(quote, inQuoted ? "quote-begin" : "quote-end"));
            }
            else if (!inQuoted && sep !== null && sep !== "" && row.startsWith(sep, i))
            {
                r.columnContents.push(sb);
                r.originalContentAndStyle.push(new Pair(GuessFormat.replaceTab(sep), "separator"));
                sb = "";
                i += sep.length;
            }
            else
            {
                // Nothing special:
                sb += row.charAt(i);
                r.originalContentAndStyle.push(new Pair(GuessFormat.replaceTab(row.substring(i, i + 1)), "normal"));
                i += 1;

            }
        }
        r.columnContents.push(sb);
        return r;
    }

    private static replaceTab(s: string): string
    {
        return javaReplace(s, "\t", "⟾");
    }

    // Note that the trim choice should not already have been applied.  But values should be rectangular
    private static guessBodyFormat(mgr: UnitManager, trimChoice: GuessFormat.TrimChoice, untrimmed: readonly (readonly string[])[], getColumnName: ((trimChoice: GuessFormat.TrimChoice, index: number) => ColumnId) | null): ColumnInfo[]
    {
        // true should be the first item in each sub-list:
        const BOOLEAN_SETS: readonly (readonly string[])[] = [["t", "f"], ["true", "false"], ["y", "n"], ["yes", "no"]];
        const initialVals = trimChoice.trim(untrimmed);
        const columnCount = initialVals.length === 0 ? 0 : initialVals[0]!.length;
        const columnTypes: ColumnType[] = [];
        const blankRows: number[] = [];
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex++)
        {
            // Have a guess at column columntype:
            let allNumeric = true;
            let anyNumeric = false;
            // The "blank", which may be empty string, or might be another value (e.g. "NA")
            let numericBlank: string | null = null;
            // Only false if we find content which is not parseable as a number:
            let allNumericOrBlank = true;
            let allBlank = true;
            let possibleDateFormats: DateFormat[] = [
                ...new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY).getFlexibleFormatters().flatMap(l => l)
                    .map(formatter => new DateFormat(DateTimeInfo.DateTimeType.YEARMONTHDAY, true, formatter, LocalDate.FROM)),
            ];
            possibleDateFormats.push(
                    ...new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY).getFlexibleFormatters().flatMap(l => l)
                    .map(formatter => new DateFormat(DateTimeInfo.DateTimeType.TIMEOFDAY, false, formatter, LocalTime.FROM))
            );
            let possibleBooleanSets: (readonly string[])[] = [...BOOLEAN_SETS];
            let commonPrefix: string | null = null;
            let commonSuffix: string | null = null;
            const decimalPlaces: number[] = [];
            for (let rowIndex = 0; rowIndex < initialVals.length; rowIndex++)
            {
                const row = initialVals[rowIndex]!;
                if (row.length === 0 || row.every(s => s === ""))
                {
                    // Whole row is blank
                    // Only add it once, not once per column:
                    if (columnIndex === 0)
                        blankRows.push(rowIndex);
                }
                else
                {
                    let val = columnIndex < row.length ? javaTrim(row[columnIndex]!) : "";
                    if (val !== "")
                    {
                        allBlank = false;

                        const originalVal = val;
                        possibleBooleanSets = possibleBooleanSets.filter(l => l.includes(javaTrim(originalVal).toLowerCase()));

                        if (commonPrefix === null)
                        {
                            // Look for a prefix of currency symbol:
                            for (let i = 0; i < val.length; i = javaOffsetByCodePoints(val, i, 1))
                            {
                                if (isCurrencySymbol(val.codePointAt(i)!))
                                {
                                    commonPrefix = val.substring(0, javaOffsetByCodePoints(val, i, 1));
                                }
                                else
                                    break;
                            }
                        }
                        if (commonSuffix === null)
                        {
                            if (val.length < 100)
                            {
                                const codepoints = codePoints(val);
                                // Look for a suffix of currency symbol:
                                for (let i = codepoints.length - 1; i >= 0 ; i--)
                                {
                                    if (codepoints[i]! === 0x25 /* '%' */ || isCurrencySymbol(codepoints[i]!))
                                    {
                                        commonSuffix = stringFromCodePoints(codepoints, i, codepoints.length - i);
                                    }
                                    else
                                        break;
                                }
                            }
                        }



                        let first: number;
                        // Not an else; if we just picked commonPrefix, we should find it here:
                        if (commonPrefix !== null && val.startsWith(commonPrefix))
                        {
                            // Take off prefix and continue as is:
                            val = javaTrim(val.substring(commonPrefix.length));
                        }
                        else if (commonPrefix !== null && !isDigit(first = val.codePointAt(0)!) && first !== 0x2B /* '+' */ && first !== 0x2D /* '-' */)
                        {
                            // We thought we had a prefix, but we haven't found it here, so give up:
                            commonPrefix = null;
                            allNumeric = false;
                            allNumericOrBlank = false;
                            //break;
                        }

                        if (commonSuffix !== null && val.endsWith(commonSuffix))
                        {
                            // Take off suffix and continue:
                            val = val.substring(0, val.length - commonSuffix.length);
                        }
                        // PORT-NOTE: bug fix.  Java tested Character.isDigit(val.length() - 1), which
                        // treats the length as a code point (so was false unless the length was 49 to
                        // 58, or the like), not whether the last character is a digit; so a column such
                        // as "5%", "7" was not guessed to be a number.
                        else if (commonSuffix !== null && !(val.length > 0 && isDigit(codePoints(val).at(-1)!)))
                        {
                            // We thought we had a prefix, but we haven't found it here, so give up:
                            commonSuffix = null;
                            allNumeric = false;
                            allNumericOrBlank = false;
                        }

                        try
                        {
                            // TODO: support . as thousands separator and comma as decimal point
                            parseBigDecimal(javaReplace(val, ",", ""), false);
                            const dot = val.indexOf(".");
                            if (dot === -1)
                                decimalPlaces.push(0);
                            else
                                decimalPlaces.push(val.length - (dot + 1));
                            anyNumeric = true;
                        }
                        catch (e)
                        {
                            if (!(e instanceof NumberFormatException))
                                throw e;
                            allNumeric = false;
                            if (numericBlank === null || numericBlank === val)
                            {
                                // First non-number we've seen; this might be our blank:
                                numericBlank = val;
                            }
                            else
                            {
                                allNumericOrBlank = false;
                            }
                            commonPrefix = null;
                        }
                        // Minimum length for date or time is 5 by my count
                        if (val.length < 5)
                        {
                            possibleDateFormats = [];
                        }
                        else
                        {
                            const valTrimmed = javaTrim(val);
                            const valPreprocessed = Utility.preprocessDate(valTrimmed);
                            // Seems expensive but most will be knocked out immediately:
                            possibleDateFormats = possibleDateFormats.filter(dateFormat =>
                            {
                                try
                                {
                                    dateFormat.formatter.parse(dateFormat.preprocessDate ? valPreprocessed : valTrimmed, dateFormat.destQuery);
                                    return true;
                                }
                                catch (e)
                                {
                                    if (!(e instanceof DateTimeParseException))
                                        throw e;
                                    return false;
                                }
                            });
                        }
                    }
                    else
                    {
                        // Found a blank:
                        allNumeric = false;
                        if (allNumericOrBlank && numericBlank === null)
                            numericBlank = "";
                        possibleBooleanSets = [];
                        possibleDateFormats = [];
                    }
                }
            }
            const minDP = decimalPlaces.length === 0 ? 0 : Math.min(...decimalPlaces);

            if (allBlank)
            {
                columnTypes.push(ColumnType.BLANK);
            }
            else if (possibleDateFormats.length !== 0)
            {
                const chosen = possibleDateFormats[0]!;
                columnTypes.push(new CleanDateColumnType(chosen.dateTimeType, chosen.preprocessDate, chosen.formatter, chosen.destQuery));
            }
            else if (possibleBooleanSets.length !== 0)
            {
                columnTypes.push(new BoolColumnType(possibleBooleanSets[0]![0]!, possibleBooleanSets[0]![1]!));
            }
            else if (allNumeric)
            {
                columnTypes.push(new NumericColumnType(mgr.guessUnit(commonPrefix), minDP, commonPrefix, commonSuffix));
            }
            else if (allNumericOrBlank && anyNumeric && numericBlank !== null)
            {
                columnTypes.push(new OrBlankColumnType(new NumericColumnType(mgr.guessUnit(commonPrefix), minDP, commonPrefix, commonSuffix), numericBlank));
            }
            else
                columnTypes.push(new TextColumnType());
            // Go backwards to find column titles:

            /*
            for (int headerRow = headerRows - 1; headerRow >= 0; headerRow--)
            {
                // Must actually have our column in it:
                if (columnIndex < initialVals.get(headerRow).size() && !initialVals.get(headerRow).get(columnIndex).isEmpty())
                {
                    viableColumnNameRows.compute(headerRow, (a, pre) -> pre == null ? 1 : (1 + pre));
                }
            }
            */
        }
        const _nonBlankColumnCount = columnTypes.filter(c => !(c instanceof BlankColumnType)).length;

        const columns: ColumnInfo[] = [];
        const usedNames = new HashSet<ColumnId>();
        for (let columnIndex = 0; columnIndex < columnTypes.length; columnIndex++)
        {
            let columnName: ColumnId;
            if (getColumnName !== null)
            {
                // PORT-NOTE: bug fix.  Java used the name as given, so a table with two columns of
                // the same name (as an HTML or Excel table can have) failed to import ("Duplicate
                // column names found"); now a repeated name gets a number, as text files' do.
                columnName = GuessFormat.uniqueName(usedNames, getColumnName(trimChoice, columnIndex));
            }
            else
            {
                const original = trimChoice.trimFromTop === 0 ? "" : javaTrim(javaListGet(javaListGet(untrimmed, trimChoice.trimFromTop - 1), columnIndex + trimChoice.trimFromLeft));
                let stringBuilder = "";
                const codepoints = codePoints(original);
                let lastWasSpace = false;
                const SPACE_CODEPOINT = 32;
                for (let i = 0; i < codepoints.length; i++)
                {
                    const codepoint = codepoints[i]!;
                    if (!ColumnId.validCharacter(codepoint, i === 0))
                    {
                        // Can we make it valid with a prefix?
                        if (i === 0 && ColumnId.validCharacter(codepoint, false))
                        {
                            stringBuilder += "C" + stringFromCodePoints(codepoints, i, 1);
                        }
                        // Otherwise invalid, so drop it.
                    }
                    else if (!lastWasSpace || codepoint !== SPACE_CODEPOINT)
                    {
                        lastWasSpace = codepoint === SPACE_CODEPOINT;
                        stringBuilder += stringFromCodePoints(codepoints, i, 1);
                    }
                }
                columnName = GuessFormat.findName(usedNames, stringBuilder);
            }
            columns.push(new ColumnInfo(columnTypes[columnIndex]!, columnName));
            usedNames.add(columnName);
        }
        return columns;
    }

    /**
     * The name, or if it is already used, the name with the first number (from 1) that makes it unused.
     * PORT-NOTE: new, for the bug fix in guessBodyFormat (and ImportPlainTable.loadSource).
     */
    public static uniqueName(usedNames: HashSet<ColumnId>, name: ColumnId): ColumnId
    {
        let prospectiveName = name;
        let appendNum = 1;
        while (usedNames.has(prospectiveName))
        {
            prospectiveName = new ColumnId(IdentifierUtility.identNum(name.getRaw(), appendNum));
            appendNum += 1;
        }
        return prospectiveName;
    }

    private static findName(usedNames: HashSet<ColumnId>, stringBuilder: string): ColumnId
    {
        const fromFile = javaTrim(stringBuilder);
        const validated: ExpressionIdentifier = IdentifierUtility.fixExpressionIdentifier(fromFile, "C");
        let prospectiveName: ExpressionIdentifier =
validated === "C" && fromFile !== "C" ? IdentifierUtility.identNum(validated, 1) : validated;
        // Now check if it is taken:

        let appendNum = 1;
        while (usedNames.has(new ColumnId(prospectiveName)))
        {
            prospectiveName = IdentifierUtility.identNum(validated, appendNum);
            appendNum += 1;
        }
        return new ColumnId(prospectiveName);
    }

    /**
     * Java: guessTextFormatGUI_Then(Window parentWindow, ...).  The dialog is shown through
     * dialogs, which stands in for the parent window (see ImporterDialogs).
     */
    public static guessTextFormatGUI_Then(dialogs: ImporterDialogs, mgr: TableManager, _file: JavaFile, suggestedName: string, initial: ReadonlyMap<Charset, readonly string[]>, then: (importInfo: GuessFormat.ImportInfo<GuessFormat.FinalTextFormat>) => void): void
    {
        const imp = GuessFormat.guessTextFormat(mgr.getTypeManager(), mgr.getUnitManager(), initial, null, null);
        Platform.runLater(() =>
        {
            dialogs.showImportChoices(suggestedName, imp, importInfo =>
            {
                if (importInfo !== null)
                    Workers.onWorkerThread("Importing", Workers.Priority.SAVE, () => ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.import"), () => then(importInfo)));
            });
        });
    }
}

export namespace GuessFormat
{
    // SRC_FORMAT is what you need to get the initial source table
    // DEST_FORMAT is what you calculate post-trim for the column formats for the final item.
    export interface Import<SRC_FORMAT, DEST_FORMAT>
    {
        currentSrcFormat(): ObjectExpression<SRC_FORMAT | null>;

        // Get the function which would load the source (import LHS) for the given format.
        // For text files, this will be CSV split into columns, but untrimmed and all columns text
        // For XLS it is original sheet, untrimmed
        loadSource(srcFormat: SRC_FORMAT): Import.SrcDetails;

        // Get the function which would load the final record set (import RHS) for the given format and trim.
        // After trimming, the types of the columns are guessed at.
        loadDest(srcFormat: SRC_FORMAT, trimChoice: TrimChoice): Pair<DEST_FORMAT, RecordSet>;
    }

    export namespace Import
    {
        export class SrcDetails
        {
            public readonly trimChoice: TrimChoice;
            public readonly recordSet: RecordSet;
            public readonly columnNameOverrides: readonly Localized[] | null; // Same length and order as recordSet.getColumns()

            public constructor(trimChoice: TrimChoice, recordSet: RecordSet, columnNameOverrides: readonly Localized[] | null)
            {
                this.trimChoice = trimChoice;
                this.recordSet = recordSet;
                this.columnNameOverrides = columnNameOverrides;
            }
        }

        /**
         * Java: the default method Import._test_getResultNoGUI.
         * PORT-NOTE: Java reads the current source format on the FX thread, waiting up to a second,
         * and so fails with a TimeoutException if there isn't one; here it is read directly.
         */
        export function _test_getResultNoGUI<SRC_FORMAT, DEST_FORMAT>(imp: Import<SRC_FORMAT, DEST_FORMAT>): DEST_FORMAT
        {
            const srcFormat = imp.currentSrcFormat().get();
            if (srcFormat === null)
                throw new Error("TimeoutException: no source format");
            const srcDetails = imp.loadSource(srcFormat);
            return imp.loadDest(srcFormat, srcDetails.trimChoice).getFirst();
        }
    }

    export class GuessException extends UserException
    {
        public constructor(message: string)
        {
            super(message);
        }
    }

    // public for testing
    export class TrimChoice
    {
        public readonly trimFromTop: number;
        public readonly trimFromLeft: number;
        public readonly trimFromRight: number;
        public readonly trimFromBottom: number;

        // public for testing
        public constructor(trimFromTop: number, trimFromBottom: number, trimFromLeft: number, trimFromRight: number)
        {
            this.trimFromTop = trimFromTop;
            this.trimFromLeft = trimFromLeft;
            this.trimFromRight = trimFromRight;
            this.trimFromBottom = trimFromBottom;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof TrimChoice)) return false;

            const that = o;

            if (this.trimFromTop !== that.trimFromTop) return false;
            if (this.trimFromLeft !== that.trimFromLeft) return false;
            if (this.trimFromRight !== that.trimFromRight) return false;
            return this.trimFromBottom === that.trimFromBottom;
        }

        public hashCode(): number
        {
            let result = this.trimFromTop;
            result = (Math.imul(31, result) + this.trimFromLeft) | 0;
            result = (Math.imul(31, result) + this.trimFromRight) | 0;
            result = (Math.imul(31, result) + this.trimFromBottom) | 0;
            return result;
        }

        public toString(): Localized
        {
            return "<trim, vert +" + this.trimFromTop + " -" + this.trimFromBottom + " horiz +" + this.trimFromLeft + " -" + this.trimFromRight + ">";
        }

        public trim(original: readonly (readonly string[])[]): string[][]
        {
            const trimmed: string[][] = [];
            for (let i = Math.max(0, this.trimFromTop); i < original.length - Math.max(0, this.trimFromBottom); i++)
            {
                const originalLine = original[i]!;
                const left = Utility.clampIncl(0, this.trimFromLeft, originalLine.length);
                const right = Utility.clampIncl(left, originalLine.length - this.trimFromRight, originalLine.length);
                trimmed.push(originalLine.slice(left, right));
            }
            return trimmed;
        }
    }

    export class InitialTextFormat
    {
        public readonly charset: Charset;
        // null means no separator; just one big column
        public readonly separator: string | null;
        // empty means no quote
        public readonly quote: string | null;

        public constructor(charset: Charset, separator: string | null, quote: string | null)
        {
            this.charset = charset;
            this.separator = (separator !== null && separator === "") ? null : separator;
            this.quote = (quote !== null && quote === "") ? null : quote;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof InitialTextFormat)) return false;
            const that = o;
            return this.charset.equals(that.charset) &&
                javaEquals(this.separator, that.separator) &&
                javaEquals(this.quote, that.quote);
        }

        public hashCode(): number
        {
            // Java's Charset.hashCode is its name's hash code:
            return javaObjectsHash(javaStringHashCode(this.charset.name()), this.separator, this.quote);
        }

        public toString(): string
        {
            return "InitialTextFormat{" +
                "charset=" + this.charset.toString() +
                ", separator='" + String(this.separator) + "'" +
                ", quote='" + String(this.quote) + "'" +
                "}";
        }
    }

    export class FinalTextFormat
    {
        public readonly initialTextFormat: InitialTextFormat;
        public readonly trimChoice: TrimChoice;
        public readonly columnTypes: readonly ColumnInfo[];

        public constructor(initialTextFormat: InitialTextFormat, trimChoice: TrimChoice, columnTypes: readonly ColumnInfo[])
        {
            this.initialTextFormat = initialTextFormat;
            this.trimChoice = trimChoice;
            this.columnTypes = columnTypes;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof FinalTextFormat)) return false;
            const that = o;
            return javaEquals(this.initialTextFormat, that.initialTextFormat) &&
                javaEquals(this.trimChoice, that.trimChoice) &&
                javaEquals(this.columnTypes, that.columnTypes);
        }

        public hashCode(): number
        {

            return javaObjectsHash(this.initialTextFormat, this.trimChoice, this.columnTypes);
        }

        public toString(): string
        {
            return "FinalTextFormat{" +
                "initialTextFormat=" + this.initialTextFormat.toString() +
                ", trimChoice=" + this.trimChoice.toString() +
                ", columnTypes=" + Utility.listToString(this.columnTypes) +
                "}";
        }
    }

    export class ImportInfo<FORMAT>
    {
        private readonly suggestedTableId: TableId;
        private readonly format: FORMAT;
        //public final boolean linkFile;

        public constructor(suggestedName: ExpressionIdentifier/*, boolean linkFile*/, format: FORMAT)
        {
            this.suggestedTableId = new TableId(suggestedName);
            this.format = format;
            //this.linkFile = linkFile;
        }

        public getInitialLoadDetails(destination: CellPosition): Table.InitialLoadDetails
        {
            return new Table.InitialLoadDetails(this.suggestedTableId, null, destination, null);
        }

        public getFormat(): FORMAT
        {
            return this.format;
        }
    }
}
