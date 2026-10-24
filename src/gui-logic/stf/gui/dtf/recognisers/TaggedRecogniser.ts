// Port of xyz.columnal.gui.dtf.recognisers.TaggedRecogniser (stf module).
import type { TagType } from "../../../../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../engine/types/data/datatype/DataTypeUtility.js";
import type { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { TaggedValue } from "../../../../../engine/utility/utility/TaggedValue.js";
import { Utility } from "../../../../../engine/utility/utility/Utility.js";
import type { Value } from "../../../../../engine/utility/utility/Value.js";
import { Recogniser } from "../Recogniser.js";

export class TaggedRecogniser extends Recogniser<TaggedValue>
{
    private readonly tags: readonly TagType<Recogniser<Value>>[];

    public constructor(tags: readonly TagType<Recogniser<Value>>[])
    {
        super();
        this.tags = tags;
    }

    public override process(parseProgress: ParseProgress, _immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<TaggedValue>>
    {
        let pp: ParseProgress | null = parseProgress.skipSpaces();

        // Longest names first (Java's sort is stable):
        const tagsLargestFirst = [...Utility.streamIndexed(this.tags)].sort((a, b) => b.getSecond().getName().length - a.getSecond().getName().length);
        let replText = "";

        for (const tagInfo of tagsLargestFirst)
        {
            const tag = tagInfo.getSecond();
            const afterTag: ParseProgress | null = pp!.consumeNext(tag.getName());
            if (afterTag !== null)
            {
                replText += tag.getName();
                const inner = tag.getInner();
                if (inner === null)
                    return this.success(TaggedValue.immediate(tagInfo.getFirst(), null, DataTypeUtility.fromTags(this.tags)), replText, afterTag);

                pp = afterTag.consumeNext("(");
                replText += "(";
                if (pp === null)
                    return this.error("Expected '(' around an inner value", afterTag.curCharIndex);
                return inner.process(pp, true).flatMap((succ: Recogniser.SuccessDetails<Value>) =>
                {
                    replText += succ.immediateReplacementText;
                    const afterBracket = succ.parseProgress.consumeNext(")");
                    if (afterBracket === null)
                        return this.error("Expected closing ')' after an inner value", succ.parseProgress.curCharIndex);
                    replText += ")";
                    return this.success(TaggedValue.immediate(tagInfo.getFirst(), succ.value, DataTypeUtility.fromTags(this.tags)), replText, afterBracket);
                });

            }
        }

        return this.error("Did not recognise tag name", parseProgress.curCharIndex);
    }
}
