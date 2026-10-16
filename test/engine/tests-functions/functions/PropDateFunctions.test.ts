// Port of test.functions.PropDateFunctions (tests-functions).
import { beforeEach, describe, test } from "vitest";
import type { FunctionDefinition } from "../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import { javaTrim } from "../../../../src/engine/java/JavaString.js";
import { LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId } from "../../../../src/engine/java/time/JavaTime.js";
import { DataType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { UnitManager } from "../../../../src/engine/types/data/unit/UnitManager.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import { assertEquals, assertNotNull, assertThrows } from "../../../support/junit.js";
import { Generator, propertyTest, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";
import { GenDate } from "../../tests-basic/fixtures/gen/GenDate.js";
import { GenZoneId } from "../../tests-basic/fixtures/gen/GenZoneId.js";
import { DummyManager } from "../fixtures/DummyManager.js";
import { TFunctionUtil } from "../fixtures/functions/TFunctionUtil.js";

const DateTimeType = DateTimeInfo.DateTimeType;
type DateTimeType = DateTimeInfo.DateTimeType;

// junit-quickcheck's LocalTimeGenerator (for a LocalTime parameter without @From): a
// nano-of-day between LocalTime.MIN and LocalTime.MAX
class LocalTimeGenerator extends Generator<LocalTime>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): LocalTime
    {
        return LocalTime.ofNanoOfDay(Number(random.nextLong(BigInt(LocalTime.MIN.toNanoOfDay()), BigInt(LocalTime.MAX.toNanoOfDay()))));
    }
}

/**
 * Created by neil on 14/12/2016.
 */
describe("PropDateFunctions", () =>
{
    let dates: Pair<LocalDate, string>[] = [];
    let times: Pair<LocalTime, string>[] = [];

    beforeEach(() =>
    {
        new UnitManager();
        dates = [];
        times = [];
    });

    propertyTest("testStringToDate", [new GenDate()], (src: LocalDate) =>
    {
        // Test with string input:
        const o = strTo(src.toString(), DateTimeType.YEARMONTHDAY);
        assertEquals(LocalDate, (o as object).constructor);
        assertEquals(src, o);
    });

    propertyTest("testStringToTime", [new LocalTimeGenerator()], (src: LocalTime) =>
    {
        // Test with string input:
        const o = strTo(src.toString(), DateTimeType.TIMEOFDAY);
        assertEquals(LocalTime, (o as object).constructor);
        assertEquals(src, o);
    });

    propertyTest("testStringToDateTime", [new GenDate(), new LocalTimeGenerator()], (date: LocalDate, time: LocalTime) =>
    {
        const src = LocalDateTime.of(date, time);
        // Test with string input:
        const o = strTo(v(src.toString()), DateTimeType.DATETIME);
        assertEquals(LocalDateTime, (o as object).constructor);
        assertEquals(src, o);
    });

    // Shorthand for Utility.value
    function v(s: string): string
    {
        return DataTypeUtility.value(s);
    }

    propertyTest("testStringToDateTimeZone", [new GenDate(), new LocalTimeGenerator(), new GenZoneId()], (date: LocalDate, time: LocalTime, zone: ZoneId) =>
    {
        const src = ZonedDateTime.of(date, time, zone);
        // Test with string input:
        const o = strTo(v(src.toLocalDateTime().toString() + " " + zone.toString()),  DateTimeType.DATETIMEZONED);
        assertEquals(ZonedDateTime, (o as object).constructor);
        assertEquals(src, o);
    });

    test("testFromString", () =>
    {
        checkDate(LocalDate.of(2016, 12, 1), "2016-12-01");
        checkDate(LocalDate.of(2001, 1, 1), "2001-01-01");
        checkDate(LocalDate.of(2001, 1, 1), "1 Jan 2001");
        checkDate(LocalDate.of(2001, 1, 1), "1-Jan-2001");
        checkDate(LocalDate.of(2001, 1, 1), "Jan 1 2001");
        checkDate(LocalDate.of(2001, 1, 1), "01/01/01");
        assertThrows(UserException, () => strTo("01/02/01", DateTimeType.YEARMONTHDAY));
        checkDate(LocalDate.of(2013, 12, 13), "13/12/13");
        checkDate(LocalDate.of(2012, 12, 13), "13/12/12");
        checkDate(LocalDate.of(2012, 12, 12), "12/12/12");
        assertThrows(UserException, () => strTo("11/12/12", DateTimeType.YEARMONTHDAY));
        checkDate(LocalDate.of(9345, 8, 6), "9345-08-06");
        checkDate(LocalDate.of(2016, 12, 1), "2016 12 01");
        checkDate(LocalDate.of(2016, 12, 1), "2016  12  01");
        checkDate(LocalDate.of(1984, 6, 21), "June 21, 1984");
        checkDate(LocalDate.of(1984, 6, 21), "June 21. 1984\n");
        assertThrows(UserException, () => strTo("June 21. 1984 23:", DateTimeType.YEARMONTHDAY));

        assertThrows(UserException, () => strTo("1:2", DateTimeType.TIMEOFDAY));
        checkTime(LocalTime.of(1, 2), "1:02");
        checkTime(LocalTime.of(21, 2), "21:02");
        checkTime(LocalTime.of(21, 2, 34), "21:02:34");
        assertThrows(UserException, () => strTo("21:02:3", DateTimeType.TIMEOFDAY));
        checkTime(LocalTime.of(21, 2, 34, 0), "21:02:34.0");
        checkTime(LocalTime.of(21, 2, 34, 20_000_000), "21:02:34.020");
        checkTime(LocalTime.of(21, 2, 34, 3_000_000), "21:02:34.003");
        checkTime(LocalTime.of(21, 2, 34, 100_000), "21:02:34.0001");
        checkTime(LocalTime.of(21, 2, 34, 7), "21:02:34.000000007");
        assertThrows(UserException, () => strTo("21:02:34.0000000007", DateTimeType.TIMEOFDAY));

        checkTime(LocalTime.of(1, 2), "1:02AM");
        checkTime(LocalTime.of(11, 59), "11:59AM");
        checkTime(LocalTime.of(0, 2), "12:02AM");
        checkTime(LocalTime.of(12, 2), "12:02PM");
        checkTime(LocalTime.of(0, 2), "12:02 AM");
        checkTime(LocalTime.of(12, 2), "12:02 PM");
        checkTime(LocalTime.of(3, 2, 34), "3:02:34 AM");
        checkTime(LocalTime.of(15, 2, 34), "3:02:34 PM");
        assertThrows(UserException, () => strTo("20:06 PM", DateTimeType.TIMEOFDAY));

        // Must come after checkDate and checkTime calls
        checkDateTimes();
    });

    function checkDateTimes(): void
    {
        for (const time of times)
        {
            for (const date of dates)
            {
                checkDateTime(LocalDateTime.of(date.getFirst(), time.getFirst()), date.getSecond() + " " + time.getSecond());
                for (const zone of ["UTC", " UTC", "+00:00", "+05:30", "-03:00", "UTC-07:00", "America/New_York", " Europe/London"])
                {
                    checkDateTimeZone(ZonedDateTime.of(date.getFirst(), time.getFirst(), ZoneId.of(javaTrim(zone))), date.getSecond() + " " + time.getSecond() + zone);
                }
            }
        }
    }

    function checkTime(of: LocalTime, src: string): void
    {
        times.push(new Pair(of, src));
        assertEquals(of, strTo(src, DateTimeType.TIMEOFDAY));
    }

    function checkDate(of: LocalDate, src: string): void
    {
        dates.push(new Pair(of, src));
        assertEquals(of, strTo(src, DateTimeType.YEARMONTHDAY));
    }

    function checkDateTime(of: LocalDateTime, src: string): void
    {
        assertEquals(of, strTo(src, DateTimeType.DATETIME));
    }

    function checkDateTimeZone(of: ZonedDateTime, src: string): void
    {
        assertEquals(of, strTo(src, DateTimeType.DATETIMEZONED));
    }

    function strTo(src: string, dateTimeType: DateTimeType): Value
    {
        const fromText = FunctionList.lookup(DummyManager.make().getUnitManager(), "from text to");
        if (fromText === null)
            throw new Error("Cannot find from text to function");
        // First param should be Type Date, but it shouldn't be used....
        const args: Value[] = [v(""), v(src)];
        return runFunction1(args, [DummyManager.make().getTypeManager().typeGADTFor(DataType.date(new DateTimeInfo(dateTimeType))), DataType.TEXT], fromText);
    }

    // Tests single numeric input, numeric output function
    // (Java unwraps the cause of a RuntimeException; the ported code throws the cause directly.)
    function runFunction1(src: readonly Value[], srcType: readonly DataType[], func: FunctionDefinition): Value
    {
        const instance = TFunctionUtil.typeCheckFunction(func, srcType);
        assertNotNull(instance);
        return instance!.getFirst().call(src);
    }
});
