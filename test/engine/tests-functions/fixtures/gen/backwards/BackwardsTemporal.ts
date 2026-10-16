// Port of test.gen.backwards.BackwardsTemporal (tests-functions testFixtures).
import { DivideExpression, NumericLiteral } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { Decimal } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { ChronoField, LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime, ZoneId, ZoneOffset, type TemporalField, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../../../../src/engine/java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../../../../src/engine/java/time/TemporalAccessor.js";
import { DataType, FlatDataTypeVisitor } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../../../../src/engine/types/data/datatype/NumberInfo.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

const DateTimeType = DateTimeInfo.DateTimeType;
type DateTimeType = DateTimeInfo.DateTimeType;

// The java.time values are Columnal values:
const v = (t: JsJodaTemporalAccessor): TemporalAccessor => t as unknown as TemporalAccessor;

export class BackwardsTemporal extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        const dateTimeInfo = targetType.apply(new class extends FlatDataTypeVisitor<DateTimeInfo | null>
        {
            public override date(dateTimeInfo: DateTimeInfo): DateTimeInfo | null
            {
                return dateTimeInfo;
            }
        }(null));

        if (dateTimeInfo === null)
            return [];

        const deep: ExpressionMaker[] = [];
        const num = (n: number): Decimal => new Decimal(n);

        switch (dateTimeInfo.getType())
        {
            case DateTimeType.YEARMONTHDAY:
            {
                const convertAndType = this.r.choose([
                        new Pair("date from datetime", DateTimeType.DATETIME),
                        new Pair("date from datetimezoned", DateTimeType.DATETIMEZONED)]);
                const t = DataType.date(new DateTimeInfo(convertAndType.getSecond()));
                deep.push(() => this.call(convertAndType.getFirst(), this.parent.make(t, this.makeTemporalToMatch(convertAndType.getSecond(), targetValue as TemporalAccessor), maxLevels - 1)));
                const target = targetValue as unknown as LocalDate;
                deep.push(() => this.call("date from ymd",
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("year"))), num(target.year()), maxLevels - 1),
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("month"))), num(target.monthValue()), maxLevels - 1),
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("day"))), num(target.dayOfMonth()), maxLevels - 1)
                ));
            }
            break;
            case DateTimeType.YEARMONTH:
            {
                const convertAndType = this.r.choose([
                        new Pair("dateym from date", DateTimeType.YEARMONTHDAY)]);
                const t = DataType.date(new DateTimeInfo(convertAndType.getSecond()));
                deep.push(() => this.call(convertAndType.getFirst(), this.parent.make(t, this.makeTemporalToMatch(convertAndType.getSecond(), targetValue as TemporalAccessor), maxLevels - 1)));
                const target = targetValue as unknown as YearMonth;
                deep.push(() => this.call("dateym from ym",
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("year"))), num(target.year()), maxLevels - 1),
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("month"))), num(target.monthValue()), maxLevels - 1)
                ));
            }
            break;
            case DateTimeType.TIMEOFDAY:
            {
                const convertAndType = this.r.choose([
                        //new Pair<>("time.from.timezoned", DateTimeType.TIMEOFDAYZONED),
                        new Pair("time from datetime", DateTimeType.DATETIME),
                        new Pair("time from datetimezoned", DateTimeType.DATETIMEZONED)]);
                const t = DataType.date(new DateTimeInfo(convertAndType.getSecond()));
                deep.push(() => this.call(convertAndType.getFirst(), this.parent.make(t, this.makeTemporalToMatch(convertAndType.getSecond(), targetValue as TemporalAccessor), maxLevels - 1)));
                const target = targetValue as unknown as LocalTime;
                deep.push(() => this.call("time from hms",
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("hour"))), num(target.hour()), maxLevels - 1),
                        this.parent.make(DataType.number(new NumberInfo(this.getUnit("minute"))), num(target.minute()), maxLevels - 1),
                        // We only generate integers in this class, so generate nanos then divide:
                        new DivideExpression(this.parent.make(DataType.number(new NumberInfo(this.getUnit("s"))), num(target.second() * 1_000_000_000 + target.nano()), maxLevels - 1), new NumericLiteral(num(1_000_000_000), null))
                ));
            }
            break;
            case DateTimeType.DATETIME:
            {
                const target = targetValue as unknown as LocalDateTime;
                //date+time+zone:
                deep.push(() => this.call("datetime from dt",
                        this.parent.make(DataType.date(new DateTimeInfo(DateTimeType.YEARMONTHDAY)), v(target.toLocalDate()), maxLevels - 1),
                        this.parent.make(DataType.date(new DateTimeInfo(DateTimeType.TIMEOFDAY)), v(target.toLocalTime()), maxLevels - 1)
                ));
            }
            break;
            case DateTimeType.DATETIMEZONED:
            {
                const target = targetValue as unknown as ZonedDateTime;
                //date+time+zone:
                deep.push(() => this.call("datetimezoned from dtz",
                        this.parent.make(DataType.date(new DateTimeInfo(DateTimeType.YEARMONTHDAY)), v(target.toLocalDate()), maxLevels - 1),
                        this.parent.make(DataType.date(new DateTimeInfo(DateTimeType.TIMEOFDAY)), v(target.toLocalTime()), maxLevels - 1),
                        this.parent.make(DataType.TEXT, target.zone().toString(), maxLevels - 1)
                ));
            }
            break;
        }


        return deep;
    }

    // Makes a value which, when the right fields are extracted, will give the value target
    // That is, you pass a type which is "bigger" than the intended (e.g. datetimezone)
    // and a target value (e.g. a timezoned), and it will make a datetimezone
    // value which you can downcast to your target value.
    private makeTemporalToMatch(type: DateTimeType, target: TemporalAccessor): TemporalAccessor
    {
        const tf = (field: TemporalField): number => {
            if (target.isSupported(field))
                return target.get(field);
            if (field.equals(ChronoField.YEAR))
                return this.r.nextInt(1, 9999);
            if (field.equals(ChronoField.MONTH_OF_YEAR))
                return this.r.nextInt(1, 12);
            if (field.equals(ChronoField.DAY_OF_MONTH))
                return this.r.nextInt(1, 28);
            if (field.equals(ChronoField.HOUR_OF_DAY))
                return this.r.nextInt(0, 23);
            if (field.equals(ChronoField.MINUTE_OF_HOUR))
                return this.r.nextInt(0, 59);
            if (field.equals(ChronoField.SECOND_OF_MINUTE))
                return this.r.nextInt(0, 59);
            if (field.equals(ChronoField.NANO_OF_SECOND))
                return this.r.nextInt(0, 999999999);
            if (field.equals(ChronoField.OFFSET_SECONDS))
                return this.r.nextInt(-12*60, 12*60) * 60;

            throw new Error("Unknown temporal field: " + field.toString() + " on type " + target.toString());
        };

        switch (type)
        {
            case DateTimeType.YEARMONTHDAY:
                return v(LocalDate.of(tf(ChronoField.YEAR), tf(ChronoField.MONTH_OF_YEAR), tf(ChronoField.DAY_OF_MONTH)));
            case DateTimeType.YEARMONTH:
                return v(YearMonth.of(tf(ChronoField.YEAR), tf(ChronoField.MONTH_OF_YEAR)));
            case DateTimeType.TIMEOFDAY:
                return v(LocalTime.of(tf(ChronoField.HOUR_OF_DAY), tf(ChronoField.MINUTE_OF_HOUR), tf(ChronoField.SECOND_OF_MINUTE), tf(ChronoField.NANO_OF_SECOND)));
            case DateTimeType.DATETIME:
                return v(LocalDateTime.of(tf(ChronoField.YEAR), tf(ChronoField.MONTH_OF_YEAR), tf(ChronoField.DAY_OF_MONTH), tf(ChronoField.HOUR_OF_DAY), tf(ChronoField.MINUTE_OF_HOUR), tf(ChronoField.SECOND_OF_MINUTE), tf(ChronoField.NANO_OF_SECOND)));
            case DateTimeType.DATETIMEZONED:
                if (target instanceof ZonedDateTime)
                    return target; //Preserves zone name properly; this is the only type that can have a named zone
                else
                    return v(ZonedDateTime.of(tf(ChronoField.YEAR), tf(ChronoField.MONTH_OF_YEAR), tf(ChronoField.DAY_OF_MONTH), tf(ChronoField.HOUR_OF_DAY), tf(ChronoField.MINUTE_OF_HOUR), tf(ChronoField.SECOND_OF_MINUTE), tf(ChronoField.NANO_OF_SECOND), ZoneId.ofOffset("", ZoneOffset.ofTotalSeconds(tf(ChronoField.OFFSET_SECONDS)))).withFixedOffsetZone());
        }
        throw new Error("Cannot match " + String(type));
    }
}
