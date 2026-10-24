// Port of xyz.columnal.gui.dtf.recognisers.BooleanRecogniser (stf module).
import { DataTypeUtility } from "../../../../../engine/types/data/datatype/DataTypeUtility.js";
import type { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { Recogniser } from "../Recogniser.js";

export class BooleanRecogniser extends Recogniser<boolean>
{
    public override process(orig: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<boolean>>
    {
        let pp: ParseProgress | null = orig.consumeNextIC("true");
        if (pp !== null)
            return this.success(DataTypeUtility.value(true), "true", pp);
        pp = orig.consumeNextIC("false");
        if (pp !== null)
            return this.success(DataTypeUtility.value(false), "false", pp);

        return this.error("Expected true or false", orig.curCharIndex);
    }
}
