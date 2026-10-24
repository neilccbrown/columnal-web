// Port of xyz.columnal.gui.dtf.recognisers.StringRecogniser (stf module).
import { GrammarUtility } from "../../../../../engine/parsers/grammar/GrammarUtility.js";
import { DataTypeUtility } from "../../../../../engine/types/data/datatype/DataTypeUtility.js";
import type { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";
import { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { Recogniser } from "../Recogniser.js";

export class StringRecogniser extends Recogniser<string>
{
    private readonly soloRecogniser: boolean;

    public constructor(soloRecogniser: boolean)
    {
        super();
        this.soloRecogniser = soloRecogniser;
    }

    public override process(orig: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<string>>
    {
        const pp = orig.consumeNext("\"");
        let content: Pair<string, ParseProgress> | null;
        let replacement: string;
        if (pp === null)
        {
            if (!this.soloRecogniser)
                return this.error("Looking for \" to begin text", orig.curCharIndex);
            // Try without:
            content = new Pair(orig.src.substring(orig.curCharIndex), ParseProgress.fromStart(orig.src).skip(orig.src.length));
            replacement = "\"" + orig.src + "\"";
        }
        else
        {
            content = pp.consumeUpToAndIncluding("\"");
            if (content === null)
                return this.error("Could not find closing \" for text", orig.src.length - 1);
            replacement = "\"" + content.getFirst() + "\"";
        }
        return this.success(DataTypeUtility.value(GrammarUtility.processEscapes(content.getFirst(), false)), replacement, content.getSecond());
    }
}
