// Port of xyz.columnal.data.TBasicUtil (tests-basic testFixtures).
import { CharStream } from "antlr4ng";
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import type { Decimal } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { javaEquals } from "../../../../../src/engine/java/JavaObject.js";
import type { JavaRandom } from "../../../../../src/engine/java/JavaRandom.js";
import { javaSplit, javaTrim } from "../../../../../src/engine/java/JavaString.js";
import { GrammarUtility } from "../../../../../src/engine/parsers/grammar/GrammarUtility.js";
import { FormatLexer } from "../../../../../src/engine/parsers/generated/FormatLexer.js";
import { MainLexer } from "../../../../../src/engine/parsers/generated/MainLexer.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../src/engine/utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../../../../src/engine/utility-error/error/UserException.js";
import { LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneOffset, type ZoneId } from "../../../../../src/engine/java/time/JavaTime.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../../../src/engine/types/data/datatype/DataTypeValue.js";
import { IdentifierUtility } from "../../../../../src/engine/utility/utility/IdentifierUtility.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { assertEquals, assertNotNull, fail, javaToString } from "../../../../support/junit.js";
import type { GenerationStatus, Generator, SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenNumber } from "../gen/GenNumber.js";
import { GenString } from "../gen/GenString.js";
import { GenZoneId } from "../gen/GenZoneId.js";

export class TBasicUtil
{
    public static assertValueEitherEqual(prefix: string, a: Either<string, Value> | null, b: Either<string, Value> | null): void
    {
        if (a === null && b === null)
            return;

        if (a === null || b === null)
        {
            fail(prefix + " Expected " + javaToString(a) + " but found " + javaToString(b));
        }
        const aNN = a;
        const bNN = b;

        aNN.either_(aErr => bNN.either_(
            bErr =>
            {
                assertEquals(aErr, bErr);
            },
            bVal =>
            {
                fail(prefix + " Expected Left:" + aErr + " but found Right:" + javaToString(bVal));
            }),
        aVal => bNN.either_(
            bErr =>
            {
                fail(prefix + " Expected Right:" + javaToString(aVal) + " but found Left:" + bErr);
            },
            bVal =>
            {
                TBasicUtil.assertValueEqual(prefix, aVal, bVal);
            }
        ));
    }

    // PORT-NOTE: Java runs the comparison on the Workers thread and waits for it; here everything
    // runs on one thread, so it is compared directly.
    public static assertValueEqual(prefix: string, a: Value | null, b: Value | null): void
    {
        if ((a === null) !== (b === null))
            fail(prefix + " differing nullness: " + (a === null) + " vs " + (b === null));

        if (a !== null && b !== null)
        {
            const compare = Utility.compareValues(a, b);
            if (compare !== 0)
            {
                fail(prefix + " comparing " + DataTypeUtility._test_valueToString(a) + " against " + DataTypeUtility._test_valueToString(b) + " result: " + compare);
            }
        }
    }

    public static assertValueListEqual(prefix: string, a: readonly Value[], b: readonly Value[] | null): void
    {
        assertNotNull(prefix + " not null", b);
        if (b !== null)
        {
            assertEquals(prefix + " list size", a.length, b.length);
            for (let i = 0; i < a.length; i++)
            {
                TBasicUtil.assertValueEqual(prefix, a[i]!, b[i]!);
            }
        }
    }

    public static assertValueListEitherEqual(prefix: string, a: readonly Either<string, Value>[], b: readonly Either<string, Value>[] | null): void
    {
        assertNotNull(prefix + " not null", b);
        if (b !== null)
        {
            assertEquals(prefix + " list size", a.length, b.length);
            for (let i = 0; i < a.length; i++)
            {
                TBasicUtil.assertValueEitherEqual(prefix + " row " + i, a[i]!, b[i]!);
            }
        }
    }

    public static exceptionToEither<T>(supplier: () => T): Either<unknown, T>
    {
        try
        {
            return Either.right(supplier());
        }
        catch (e)
        {
            return Either.left(e);
        }
    }

    public static generateNumberV(r: SourceOfRandomness, gs: GenerationStatus): Decimal
    {
        return new GenNumber().generate(r, gs);
    }

    private static readonly MIN_DATE = LocalDate.of(1, 1, 1);
    private static readonly MAX_DATE = LocalDate.of(9999, 12, 31);
    private static readonly MIN_CLOSE_DATE = LocalDate.of(1900, 1, 1);
    private static readonly MAX_CLOSE_DATE = LocalDate.of(2050, 12, 31);

    public static generateDate(r: SourceOfRandomness, _gs: GenerationStatus): LocalDate
    {
        // Usually, generate dates in sensible range (1900->2050)
        if (r.nextInt(4) !== 0)
            return LocalDate.ofEpochDay(Number(r.nextLong(BigInt(TBasicUtil.MIN_CLOSE_DATE.toEpochDay()), BigInt(TBasicUtil.MAX_CLOSE_DATE.toEpochDay()))));
        else
            return LocalDate.ofEpochDay(Number(r.nextLong(BigInt(TBasicUtil.MIN_DATE.toEpochDay()), BigInt(TBasicUtil.MAX_DATE.toEpochDay()))));
    }

    public static generateTime(r: SourceOfRandomness, _gs: GenerationStatus): LocalTime
    {
        // Java: junit-quickcheck's LocalTimeGenerator, which picks a nano-of-day between LocalTime.MIN and MAX
        let localTime = LocalTime.ofNanoOfDay(Number(r.nextLong(BigInt(LocalTime.MIN.toNanoOfDay()), BigInt(LocalTime.MAX.toNanoOfDay()))));
        // Produce half the dates without partial seconds (and perhaps seconds set to zero): common case
        if (r.nextBoolean())
        {
            localTime = localTime.minusNanos(localTime.nano());
            if (r.nextBoolean())
                localTime = localTime.minusSeconds(localTime.second());
        }
        return localTime;
    }

    public static generateDateTime(r: SourceOfRandomness, gs: GenerationStatus): LocalDateTime
    {
        return LocalDateTime.of(TBasicUtil.generateDate(r, gs), TBasicUtil.generateTime(r, gs));
    }

    public static generateDateTimeZoned(r: SourceOfRandomness, gs: GenerationStatus): ZonedDateTime
    {
        return ZonedDateTime.of(TBasicUtil.generateDateTime(r, gs), r.nextBoolean() ? TBasicUtil.generateZone(r, gs) : TBasicUtil.generateZoneOffset(r, gs));
    }

    public static generateZone(r: SourceOfRandomness, gs: GenerationStatus): ZoneId
    {
        return new GenZoneId().generate(r, gs);
    }

    public static generateZoneOffset(r: SourceOfRandomness, _gs: GenerationStatus): ZoneOffset
    {
        // We don't support sub-minute offsets:
        return ZoneOffset.ofTotalSeconds(r.nextInt(-12 * 60, 12 * 60) * 60);
    }

    public static generateZoneString(r: SourceOfRandomness, gs: GenerationStatus): string
    {
        return TBasicUtil.generateZone(r, gs).toString();
    }

    public static generateExpressionIdentifier(sourceOfRandomness: SourceOfRandomness): ExpressionIdentifier
    {
        return IdentifierUtility.fixExpressionIdentifier(TBasicUtil.generateIdent(sourceOfRandomness), "Exp " + sourceOfRandomness.nextInt(1000000));
    }

    private static getKeywords(): string[]
    {
        const keywords: string[] = [];

        keywords.push("Z"); // Likely to cause issues for date/time parsing.
        keywords.push("@BEGIN");
        keywords.push("@END");

        const mainVocabulary = new MainLexer(CharStream.fromString("")).vocabulary;
        for (let i = 0; i < mainVocabulary.maxTokenType; i++)
        {
            const l = mainVocabulary.getLiteralName(i);
            if (l !== null)
            {
                keywords.push(l.substring(1, l.length - 1));
            }
        }

        const formatVocabulary = new FormatLexer(CharStream.fromString("")).vocabulary;
        for (let i = 0; i < formatVocabulary.maxTokenType; i++)
        {
            const l = formatVocabulary.getLiteralName(i);
            if (l !== null)
            {
                keywords.push(l);
            }
        }
        return keywords;
    }

    public static generateIdent(sourceOfRandomness: SourceOfRandomness): string
    {
        if (sourceOfRandomness.nextBoolean())
        {
            const keywords = TBasicUtil.getKeywords();
            const mangled = javaTrim(keywords[sourceOfRandomness.nextInt(0, keywords.length - 1)]!.replace(/[^A-Za-z0-9]/g, ""));
            if (mangled === "")
                return "a";
            else
                return mangled;
        }
        else
        {
            // These should be escaped, but would be blown away on load: "\n", "\r", "\t"
            const trimmed = GrammarUtility.collapseSpaces("" + sourceOfRandomness.nextChar("a", "z") + TBasicUtil.makeList(sourceOfRandomness, 1, 10, () => sourceOfRandomness.choose<string>([
                "a", "r", "n", " ", "Z", "0", "9",
            ])).join(""));
            if (trimmed === "")
                return "a";
            else
                return trimmed;
        }
    }

    /**
     * Java has two makeList overloads:
     *   makeList(SourceOfRandomness r, int minSizeIncl, int maxSizeIncl, ExSupplier<T> makeOne)
     *   makeList(int len, Generator<? extends T> gen, SourceOfRandomness r, GenerationStatus gs)
     */
    public static makeList<T>(r: SourceOfRandomness, minSizeIncl: number, maxSizeIncl: number, makeOne: () => T): T[];
    public static makeList<T>(len: number, gen: Generator<T>, r: SourceOfRandomness, gs: GenerationStatus): T[];
    public static makeList<T>(a: SourceOfRandomness | number, b: number | Generator<T>, c: number | SourceOfRandomness, d: (() => T) | GenerationStatus): T[]
    {
        const list: T[] = [];
        if (typeof a === "number")
        {
            const gen = b as Generator<T>;
            for (let i = 0; i < a; i++)
                list.push(gen.generate(c as SourceOfRandomness, d as GenerationStatus));
            return list;
        }
        const size = a.nextInt(b as number, c as number);
        for (let i = 0; i < size; i++)
            list.push((d as () => T)());
        return list;
    }

    public static makeStringV(r: SourceOfRandomness, gs: GenerationStatus): string
    {
        return DataTypeUtility.value(TBasicUtil.makeString(r, gs).replaceAll("\"", ""));
    }

    public static makeString(r: SourceOfRandomness, gs: GenerationStatus | null): string
    {
        // Makes either totally random String from generator, or "awkward" string
        // with things likely to trip up parser
        if (r.nextBoolean() && gs !== null)
        {
            let s = new GenString().generate(r, gs);
            if (s.length > 250)
                s = s.substring(0, 250);
            return s;
        }
        else
            return TBasicUtil.generateIdent(r);
    }

    public static getAllCollapsedData(type: DataTypeValue, size: number): Either<string, Value>[]
    {
        const r: Either<string, Value>[] = [];
        for (let i = 0; i < size; i++)
        {
            try
            {
                r.push(Either.right(type.getCollapsed(i)));
            }
            catch (e)
            {
                if (!(e instanceof InvalidImmediateValueException))
                    throw e;
                r.push(Either.left(e.getInvalid()));
            }
        }
        return r;
    }

    public static getAllCollapsedDataValid(type: DataTypeValue, size: number): Value[]
    {
        const r: Value[] = [];
        for (let i = 0; i < size; i++)
        {
            r.push(type.getCollapsed(i));
        }
        return r;
    }

    public static assertUserException(simulationRunnable: () => void): void
    {
        try
        {
            simulationRunnable();
        }
        catch (e)
        {
            if (e instanceof UserException)
                return; // As expected
            if (e instanceof InternalException)
                throw new Error("Unexpected InternalException", { cause: e });
            throw e;
        }
        // If we reach here, didn't throw:
        fail("Expected UserException but no exception thrown");
    }

    public static generateColumnId(sourceOfRandomness: SourceOfRandomness): ColumnId
    {
        return new ColumnId(IdentifierUtility.fixExpressionIdentifier(TBasicUtil.generateIdent(sourceOfRandomness), "Column"));
    }

    public static generateColumnIds(r: SourceOfRandomness, numColumns: number): ColumnId[]
    {
        const columnIds: ColumnId[] = [];
        while (columnIds.length < numColumns)
        {
            const c = TBasicUtil.generateColumnId(r);
            if (!columnIds.some(x => x.equals(c)))
                columnIds.push(c);
        }
        return columnIds;
    }

    public static assertEqualList(a: readonly unknown[], b: readonly unknown[]): void
    {
        if (a.length !== b.length)
            console.error("Different lengths");
        try
        {
            assertEquals(a, b);
        }
        catch (e)
        {
            console.error("Content:");
            for (let i = 0; i < a.length; i++)
            {
                console.error((javaEquals(a[i], b[i]) ? "    " : "!!  ") + javaToString(a[i]) + "  " + javaToString(b[i]));
            }
            throw e;
        }
    }

    public static generateTableId(sourceOfRandomness: SourceOfRandomness): TableId
    {
        return new TableId(IdentifierUtility.fixExpressionIdentifier(TBasicUtil.generateIdent(sourceOfRandomness), "Table"));
    }

    // Generates a pair of different ids
    public static generateTableIdPair(r: SourceOfRandomness): Pair<TableId, TableId>
    {
        const us = TBasicUtil.generateTableId(r);
        let src: TableId;
        do
        {
            src = TBasicUtil.generateTableId(r);
        }
        while (src.equals(us));
        return new Pair(us, src);
    }

    public static generateVarName(r: SourceOfRandomness): ExpressionIdentifier
    {
        let s: ExpressionIdentifier | null;
        do
        {
            s = IdentifierUtility.asExpressionIdentifier(TBasicUtil.generateIdent(r));
        }
        while (s === null);
        return s;
    }

    public static makeNonEmptyString(r: SourceOfRandomness, gs: GenerationStatus): string
    {
        let s: string;
        do
        {
            s = TBasicUtil.makeString(r, gs);
        }
        while (javaTrim(s) === "");
        return s;
    }

    // If null, assertion failure.  Otherwise returns as non-null.
    public static checkNonNull<T>(t: T | null | undefined): T
    {
        assertNotNull(t);
        return t as T;
    }

    // PORT-NOTE: Java rewords JUnit's "expected:"/"but was:" (to work around an IntelliJ bug); not needed here.
    public static printSeedOnFail(r: () => void): void
    {
        r();
    }

    public static checkedToRuntime<T>(supplier: () => T): T
    {
        return supplier();
    }

    public static checkedToRuntime_(runnable: () => void): void
    {
        runnable();
    }

    /**
     * Removes a random item from the given list and returns it.
     * Note that the list is modified!
     */
    public static removeRandom<T>(r: JavaRandom, list: T[]): T
    {
        const index = r.nextInt(list.length);
        return list.splice(index, 1)[0]!;
    }

    public static assertEqualsText(prefix: string, expected: string, actual: string): void
    {
        if (expected !== actual)
        {
            const expectedLines = javaSplit(expected, /\n/);
            const actualLines = javaSplit(actual, /\n/);
            for (let i = 0; i < Math.max(expectedLines.length, actualLines.length); i++)
            {
                const expectedLine = i < expectedLines.length ? expectedLines[i]! : null;
                const actualLine = i < actualLines.length ? actualLines[i]! : null;
                assertEquals(prefix + "\nExpected line " + i + ": " + (expectedLine === null ? "null" : TBasicUtil.stringAsHexChars(expectedLine) + "\n" + expectedLine) + "\nActual: " + (actualLine === null ? "null" : TBasicUtil.stringAsHexChars(actualLine) + "\n" + actualLine), expectedLine, actualLine);
            }
        }
    }

    public static stringAsHexChars(str: string): string
    {
        return Array.from({ length: str.length }, (_, i) => str.charCodeAt(i)).map(c => c.toString(16) + (c === 10 ? "\n" : "")).join(" ");
    }

    public static getSingleCollapsedData(type: DataTypeValue, index: number): Either<string, Value>
    {
        try
        {
            return Either.right(type.getCollapsed(index));
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            return Either.left(e.getInvalid());
        }
    }
}
