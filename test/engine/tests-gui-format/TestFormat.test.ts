// Port of test.TestFormat (tests-gui-format).  The test doesn't use the GUI, so it is a Vitest
// engine test (see ENGINE_TESTS_IN_GUI_MODULES in scripts/port-status.ts).
import { describe, test } from "vitest";
import type { ColumnType } from "../../../src/engine/data/data/columntype/ColumnType.js";
import { BoolColumnType, CleanDateColumnType, NumericColumnType, TextColumnType } from "../../../src/engine/data/data/columntype/ColumnTypes.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { ColumnInfo } from "../../../src/engine/importers/importers/ColumnInfo.js";
import { GuessFormat } from "../../../src/engine/importers/importers/GuessFormat.js";
import { Charset } from "../../../src/engine/java/JavaCharset.js";
import { javaReplace } from "../../../src/engine/java/JavaString.js";
import { LocalDate, LocalTime } from "../../../src/engine/java/time/JavaTime.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { assertEquals } from "../../support/junit.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";
import { GenFormat } from "./fixtures/gen/GenFormat.js";

const F = DateTimeInfo.F;
const m = DateTimeInfo.m;

const NUM: ColumnType = new NumericColumnType(Unit.SCALAR, 0, null, null);
const TEXT: ColumnType = new TextColumnType();
const BOOL: ColumnType = new BoolColumnType("true", "false");
const DATE: ColumnType = new CleanDateColumnType(DateTimeInfo.DateTimeType.YEARMONTHDAY, true, m(" ", F.DAY, F.MONTH_NUM, F.YEAR2), LocalDate.FROM);
const TIME: ColumnType = new CleanDateColumnType(DateTimeInfo.DateTimeType.TIMEOFDAY, false, m(":", F.HOUR, F.MIN, F.SEC_OPT_FRAC_OPT), LocalTime.FROM);
const UTF8 = Charset.forName("UTF-8");

function col(type: ColumnType, name: string): ColumnInfo
{
    return new ColumnInfo(type, new ColumnId(name));
}

function assertFormatCR(fmt: GuessFormat.FinalTextFormat, ...lines: string[]): void
{
    assertFormat(fmt, ...lines);
    for (const sep of ";\t |".split(""))
    {
        fmt = GenFormat.f(fmt.trimChoice.trimFromTop, fmt.columnTypes, "" + sep, fmt.initialTextFormat.quote, fmt.initialTextFormat.charset);
        assertFormat(fmt, ...lines.map(l => javaReplace(l, ",", sep)));
    }
}

function assertFormat(fmt: GuessFormat.FinalTextFormat, ...lines: string[]): void
{
    const actual = GuessFormat.Import._test_getResultNoGUI(GuessFormat.guessTextFormat(DummyManager.make().getTypeManager(), DummyManager.make().getUnitManager(), new Map([[Charset.forName("UTF-8"), lines]]), null, null));
    assertEquals(fmt.initialTextFormat, actual.initialTextFormat);
    // We only care about top.  If they have to trim more from sides due to header, that is fine:
    assertEquals(fmt.toString(), fmt.trimChoice.trimFromTop, actual.trimChoice.trimFromTop);
    assertEquals(fmt.columnTypes, actual.columnTypes);
}

function c(...ts: ColumnInfo[]): ColumnInfo[]
{
    return ts;
}

function NUM_(unit: string, commonPrefix: string | null): NumericColumnType
{
    return new NumericColumnType(DummyManager.make().getUnitManager().loadUse(unit), 0, commonPrefix, null);
}

describe("TestFormat", () =>
{
    test("testFormat", () =>
    {
        assertFormatCR(GenFormat.f(1, c(col(NUM, "A"), col(NUM, "B")), ",", "", UTF8),
            "A,B", "0,0", "1,1", "2,2");
        assertFormatCR(GenFormat.f(2, c(col(NUM, "A"), col(NUM, "B")), ",", "", UTF8),
            "# Some comment", "A,B", "0,0", "1,1", "2,2");
        assertFormatCR(GenFormat.f(0, c(col(NUM, "C 1"), col(NUM, "C 2")), ",", "", UTF8),
            "0,0", "1,1", "2,2");
        assertFormatCR(GenFormat.f(0, c(col(TEXT, "C 1"), col(TEXT, "C 2")), ",", "", UTF8),
            "A,B", "0,0", "3,5", "1,D", "C,2", "2,2", "E,F", "G,H", "I,J", "2,2", "3,3", "4,4", "5,5", "6,6", "7,7");
        assertFormatCR(GenFormat.f(1, c(col(NUM, "A"), col(TEXT, "B")), ",", "", UTF8),
            "A,B", "0,0", "1,1", "1.5,D", "2,2", "3,E", "4,5");
        assertFormat(GenFormat.f(1, c(col(DATE, "Date"), col(TIME, "Time"), col(BOOL, "Bool"), col(TEXT, "Text")), ",", "", UTF8),
            "Date, Time, Bool, Text", "3/5/18, 16:45, TRUE, Whatever", "21/6/17, 00:01, FALSE, Something");
    });

    test("testCurrency", () =>
    {
        //assertFormat(GenFormat.f(0, c(col(NUM("USD", "$"), "C1"), col(TEXT, "C2")), ",", "", UTF8),
            //"$0, A", "$1, Whatever", "$2, C");
        assertFormat(GenFormat.f(0, c(col(NUM_("EUR", "€"), "C 1"), col(TEXT, "C 2")), ",", "", UTF8),
            "€ 0, A", "€ 1, Whatever", "€ 2, C");
        assertFormat(GenFormat.f(0, c(col(TEXT, "C 1"), col(TEXT, "C 2")), ",", "", UTF8),
            "A0, A", "A1, Whatever", "A2, C");
    });
});
