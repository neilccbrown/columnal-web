// Port of xyz.columnal.gui.dtf.recognisers.ListRecogniser (stf module).
import { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { ListExList, type ListEx } from "../../../../../engine/utility/utility/Utility.js";
import type { Value } from "../../../../../engine/utility/utility/Value.js";
import { Recogniser } from "../Recogniser.js";

class ListException extends Error
{
    public readonly errorDetails: Recogniser.ErrorDetails;

    public constructor(errorDetails: Recogniser.ErrorDetails)
    {
        super();
        this.errorDetails = errorDetails;
    }
}

export class ListRecogniser extends Recogniser<ListEx>
{
    private readonly inner: Recogniser<Value>;

    public constructor(inner: Recogniser<Value>)
    {
        super();
        this.inner = inner;
    }

    public override process(parseProgress: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<ListEx>>
    {
        try
        {
            const list: Value[] = [];
            const replText = { s: "" };
            let pp: ParseProgress | null = parseProgress;
            pp = pp.consumeNext("[");
            replText.s += "[";
            if (pp === null)
                return this.error("Expected '[' to begin list", parseProgress.curCharIndex);
            pp = pp.skipSpaces();
            let first = true;
            while (pp.curCharIndex < pp.src.length && pp.src.charAt(pp.curCharIndex) !== "]" && (first || pp.src.charAt(pp.curCharIndex) === ","))
            {
                if (!first)
                {
                    // Skip comma:
                    pp = pp.skip(1);
                    replText.s += ", ";
                }
                pp = ListRecogniser.addToList(list, replText, this.inner.process(pp, false));
                pp = pp.skipSpaces();
                first = false;
            }
            const beforeBracket = pp;
            pp = pp.consumeNext("]");
            if (pp === null)
                return this.error("Expected ']' to end list", beforeBracket.curCharIndex);
            replText.s += "]";

            return this.success(ListExList.immediate(list), replText.s, pp);
        }
        catch (e)
        {
            if (!(e instanceof ListException))
                throw e;
            return Either.left(e.errorDetails);
        }
    }

    private static addToList<T extends Value>(list: Value[], replText: { s: string }, process: Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>): ParseProgress
    {
        return process.either(err => { throw new ListException(err); },
            succ => { list.push(succ.value); replText.s += succ.immediateReplacementText; return succ.parseProgress; });
    }
}
