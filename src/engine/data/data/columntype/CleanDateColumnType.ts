// Port of xyz.columnal.data.columntype.CleanDateColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { ChronoField, LocalDate, type DateTimeFormatter, type TemporalQuery } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { javaStringHashCode } from "../../../java/JavaObject.js";
import { javaTrim } from "../../../java/JavaString.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { ColumnType } from "./ColumnTypes.js";

/**
 * Created by neil on 30/10/2016.
 */
export class CleanDateColumnType extends ColumnType
{
    // As passed to DateTimeFormatter.ofPattern
    private readonly formatter: DateTimeFormatter;
    private readonly query: TemporalQuery<unknown>;
    private readonly preprocessDate: boolean;
    private readonly dateTimeType: DateTimeInfo.DateTimeType;

    public constructor(dateTimeType: DateTimeInfo.DateTimeType, preprocessDate: boolean, formatter: DateTimeFormatter, query: TemporalQuery<unknown>)
    {
        super();
        this.dateTimeType = dateTimeType;
        this.preprocessDate = preprocessDate;
        this.formatter = formatter;
        this.query = query;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof CleanDateColumnType)) return false;

        const that = o;

        return this.formatter.toString() === that.formatter.toString() && this.dateTimeType === that.dateTimeType && this.preprocessDate === that.preprocessDate;

    }

    /**
     * PORT-NOTE: Java uses the formatter's identity hash code (DateTimeFormatter does not
     * override hashCode), which breaks the equals/hashCode contract; this hashes its string
     * form, as equals compares, and the enum's ordinal (see CONVENTIONS.md "enum hashCode").
     */
    public override hashCode(): number
    {
        return (Math.imul(31, javaStringHashCode(this.formatter.toString())) + this.dateTimeType + (this.preprocessDate ? 1 : 0)) | 0;
    }

    // Is the year two digits?
    public isShortYear(): boolean
    {
        return this.formatter.parse(this.formatter.format(LocalDate.of(1850, 1, 1))).get(ChronoField.YEAR) !== 1850;
    }

    // PORT-NOTE: js-joda prints a formatter slightly differently: for a year pattern such as "yyyy",
    // the maximum width is 15 (Value(YearOfEra,4,15,EXCEEDS_PAD)), where Java prints 19.
    public override toString(): string
    {
        return "CleanDate \"" + this.formatter.toString() + "\" " + DateTimeInfo.DateTimeType[this.dateTimeType] + " " + String(this.preprocessDate);
    }

    public getDateTimeFormatter(): DateTimeFormatter
    {
        return this.formatter;
    }

    public parse(s: string): Either<string, TemporalAccessor>
    {
        s = javaTrim(s);
        try
        {
            return Either.right(this.getDateTimeInfo().fromParsed(this.getDateTimeFormatter().parse(this.preprocessDate ? Utility.preprocessDate(s) : s, this.query) as TemporalAccessor));
        }
        catch (e)
        {
            // Java catches RuntimeException, so not the checked InternalException or UserException:
            if (e instanceof InternalException || e instanceof UserException)
                throw e;
            return Either.left(s);
        }
    }

    public getDateTimeInfo(): DateTimeInfo
    {
        return new DateTimeInfo(this.dateTimeType);
    }

    public getQuery(): TemporalQuery<unknown>
    {
        return this.query;
    }
}
