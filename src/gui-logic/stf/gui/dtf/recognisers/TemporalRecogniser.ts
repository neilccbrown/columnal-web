// Port of xyz.columnal.gui.dtf.recognisers.TemporalRecogniser (stf module).
import type { TemporalAccessor } from "../../../../../engine/java/time/TemporalAccessor.js";
import { DataTypeUtility } from "../../../../../engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../../../engine/types/data/datatype/DateTimeInfo.js";
import { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../../../engine/utility-error/error/InternalException.js";
import { Log } from "../../../../../engine/utility/log/Log.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { Recogniser } from "../Recogniser.js";

export class TemporalRecogniser extends Recogniser<TemporalAccessor>
{
    private readonly dateTimeType: DateTimeInfo.DateTimeType;

    public constructor(dateTimeType: DateTimeInfo.DateTimeType)
    {
        super();
        this.dateTimeType = dateTimeType;
    }

    public override process(orig: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<TemporalAccessor>>
    {
        try
        {
            const start = orig.curCharIndex;
            const stringView = new DataTypeUtility.StringView(orig);
            const dateTimeInfo = new DateTimeInfo(this.dateTimeType);
            const temporal = DataTypeUtility.parseTemporalFlexible(dateTimeInfo, stringView);
            let replacementText = orig.src.substring(start, stringView.getPosition());
            try
            {
                replacementText = DataTypeUtility.temporalToString(temporal, null);
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
            }
            return this.success(temporal, replacementText, stringView.getParseProgress());
        }
        catch (e)
        {
            if (!(e instanceof DataTypeUtility.PositionedUserException))
                throw e;
            return Either.left(new Recogniser.ErrorDetails(e.getStyledMessage(), e.getPosition()));
        }
    }
}
