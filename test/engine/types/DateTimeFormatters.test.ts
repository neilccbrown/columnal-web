// Checks Columnal's date/time formatters (DataType.DateTimeInfo, on js-joda via JavaTime.ts)
// against the ORIGINAL DateTimeInfo run on the JVM by scripts/golden/datetime.sh.
import { describe, expect, test } from "vitest";
import golden from "./golden/datetime.txt?raw";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { javaEnumName, javaEnumValues } from "../../../src/engine/java/JavaEnum.js";
import { javaMessage, LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime, type DateTimeFormatter, type TemporalAccessor } from "../../../src/engine/java/time/JavaTime.js";

const DateTimeType = DateTimeInfo.DateTimeType;
type DateTimeType = DateTimeInfo.DateTimeType;

// DataTypeUtility.value(DateTimeInfo, TemporalAccessor), as the Java harness uses
function value(type: DateTimeType, t: TemporalAccessor): TemporalAccessor
{
    switch (type)
    {
        case DateTimeType.YEARMONTHDAY: return t instanceof LocalDate ? t : LocalDate.from(t);
        case DateTimeType.YEARMONTH: return t instanceof YearMonth ? t : YearMonth.from(t);
        case DateTimeType.TIMEOFDAY: return t instanceof LocalTime ? t : LocalTime.from(t);
        case DateTimeType.DATETIME: return t instanceof LocalDateTime ? t : t instanceof LocalDate ? LocalDateTime.of(t, LocalTime.MIN) : LocalDateTime.from(t);
        default: return t instanceof ZonedDateTime ? t : ZonedDateTime.from(t);
    }
}

function parseResult(type: DateTimeType, f: DateTimeFormatter, s: string): string
{
    try
    {
        return value(type, f.parse(s)).toString();
    }
    catch (e)
    {
        return "ERR " + (e as Error).name + ": " + javaMessage(e as Error);
    }
}

function isoParse(type: DateTimeType, s: string): TemporalAccessor
{
    switch (type)
    {
        case DateTimeType.YEARMONTHDAY: return LocalDate.parse(s);
        // Java prints YearMonth years from 10000 up without the "+" that parsing needs:
        case DateTimeType.YEARMONTH: return YearMonth.parse(/^\d{5,}-/.test(s) ? "+" + s : s);
        case DateTimeType.TIMEOFDAY: return LocalTime.parse(s);
        case DateTimeType.DATETIME: return LocalDateTime.parse(s);
        default: return ZonedDateTime.parse(s);
    }
}

const unescape = (s: string) => JSON.parse(s) as string;

// "Unable to obtain X from TemporalAccessor: ..." ends with a dump of the internal parse state,
// which differs between java.time and js-joda, so only the part before it is compared.
function sameResult(actual: string, expected: string): boolean
{
    const marker = " from TemporalAccessor: ";
    if (expected.includes(marker))
        return actual.substring(0, actual.indexOf(marker)) === expected.substring(0, expected.indexOf(marker));
    return actual === expected;
}
const lines = golden.trimEnd().split("\n").map(l =>
{
    const m = /^(\w+) (\w+) ("(?:[^"\\]|\\.)*") =(.*)$/.exec(l);
    if (!m)
        throw new Error("Bad golden line: " + l);
    const type = javaEnumValues<DateTimeType>(DateTimeType).find(v => javaEnumName(DateTimeType, v) === m[2])!;
    return { kind: m[1]!, type, input: unescape(m[3]!), rest: m[4]!.trim(), line: l };
});

describe("DateTimeInfo formatters match the Java original", () =>
{
    test("strict formatting", () =>
    {
        const failures: string[] = [];
        for (const c of lines.filter(l => l.kind === "format"))
        {
            const actual = new DateTimeInfo(c.type).getStrictFormatter().format(isoParse(c.type, c.input));
            if (actual !== unescape(c.rest))
                failures.push(`${c.line}\n    TS: ${actual}`);
        }
        expect(failures.join("\n")).toBe("");
    });

    test("strict parsing", () =>
    {
        const failures: string[] = [];
        for (const c of lines.filter(l => l.kind === "strict"))
        {
            const actual = parseResult(c.type, new DateTimeInfo(c.type).getStrictFormatter(), c.input);
            if (!sameResult(actual, unescape(c.rest)))
                failures.push(`${c.line}\n    TS: ${actual}`);
        }
        expect(failures.join("\n")).toBe("");
    });

    test("flexible parsing (which formatters accept each text, and the results)", () =>
    {
        const failures: string[] = [];
        for (const c of lines.filter(l => l.kind === "flex"))
        {
            const formatters = new DateTimeInfo(c.type).getFlexibleFormatters();
            let actual = "";
            formatters.forEach((group, g) => group.forEach((f, i) =>
            {
                const res = parseResult(c.type, f, c.input);
                if (!res.startsWith("ERR"))
                    actual += ` ${g}.${i}:${res}`;
            }));
            if (actual.trim() !== c.rest)
                failures.push(`${c.line}\n    TS:${actual}`);
        }
        expect(failures.slice(0, 25).join("\n"), `${failures.length} mismatches`).toBe("");
    });
});
