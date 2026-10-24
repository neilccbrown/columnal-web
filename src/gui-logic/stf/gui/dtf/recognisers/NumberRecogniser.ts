// Port of xyz.columnal.gui.dtf.recognisers.NumberRecogniser (stf module).
import type { Decimal } from "../../../../../engine/java/JavaBigDecimal.js";
import { DataTypeUtility } from "../../../../../engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../../engine/utility-error/error/UserException.js";
import { Log } from "../../../../../engine/utility/log/Log.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { Utility } from "../../../../../engine/utility/utility/Utility.js";
import { Recogniser } from "../Recogniser.js";

export class NumberRecogniser extends Recogniser<Decimal>
{
    public override process(orig: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<Decimal>>
    {
        let pp = orig.skipSpaces();
        let sign = "";
        if (pp.src.startsWith("+", pp.curCharIndex))
        {
            pp = pp.skip(1);
        }
        else if (pp.src.startsWith("-", pp.curCharIndex))
        {
            pp = pp.skip(1);
            sign = "-";
        }

        const beforeDot: Pair<string, ParseProgress> | null = this.consumeDigits(pp);

        try
        {
            if (beforeDot === null)
            {
                return this.error("Expected digits to start a number", pp.curCharIndex);
            }
            else if (beforeDot.getSecond().src.startsWith(".", beforeDot.getSecond().curCharIndex))
            {
                const afterDot = this.consumeDigits(beforeDot.getSecond().skip(1));

                if (afterDot === null)
                {
                    return this.error("Expected digits after decimal point", beforeDot.getSecond().curCharIndex + 1);
                }

                return this.successNumber(sign + beforeDot.getFirst() + "." + afterDot.getFirst(), afterDot.getSecond());
            }
            else
            {
                return this.successNumber(sign + beforeDot.getFirst(), beforeDot.getSecond());
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            return Either.left(new Recogniser.ErrorDetails(e.getStyledMessage(), orig.curCharIndex));
        }
    }

    // Java: an overload of success(String, ParseProgress)
    private successNumber(src: string, pp: ParseProgress): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<Decimal>>
    {
        const number = Utility.parseNumber(src);
        let repl = src;
        try
        {
            repl = DataTypeUtility.numberToString(number, null, null);
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            // Shouldn't happen:
            Log.log(e);
        }
        return this.success(number, repl, pp);
    }

}
