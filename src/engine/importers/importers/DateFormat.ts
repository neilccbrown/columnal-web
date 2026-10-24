// Port of xyz.columnal.importers.DateFormat (importers module).
import type { DateTimeFormatter, TemporalQuery } from "../../java/time/JavaTime.js";
import type { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";

/**
 * Created by neil on 31/10/2016.
 */
export class DateFormat
{
    public readonly preprocessDate: boolean;
    public readonly dateTimeType: DateTimeInfo.DateTimeType;
    public readonly formatter: DateTimeFormatter;
    public readonly destQuery: TemporalQuery<unknown>;

    public constructor(dateTimeType: DateTimeInfo.DateTimeType, preprocessDate: boolean, dateTimeFormatter: DateTimeFormatter, destQuery: TemporalQuery<unknown>)
    {
        this.dateTimeType = dateTimeType;
        this.preprocessDate = preprocessDate;
        this.formatter = dateTimeFormatter;
        this.destQuery = destQuery;
    }
}
