// Port of xyz.columnal.gui.dtf.Recogniser (stf module).
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import type { ParseProgress } from "../../../../engine/utility/utility/ParseProgress.js";
import type { Value } from "../../../../engine/utility/utility/Value.js";

export abstract class Recogniser<T extends Value>
{
    protected consumeDigits(parseProgress: ParseProgress): Pair<string, ParseProgress> | null
    {
        let i: number;
        for (i = parseProgress.curCharIndex; i < parseProgress.src.length; i++)
        {
            const c = parseProgress.src.charAt(i);
            if (c < "0" || c > "9")
            {
                break;
            }
        }

        if (i === parseProgress.curCharIndex)
            return null;
        else
            return new Pair(parseProgress.src.substring(parseProgress.curCharIndex, i), parseProgress.skip(i - parseProgress.curCharIndex));
    }

    public abstract process(parseProgress: ParseProgress, immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>;

    protected error(msg: string, errorPosition: number): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>
    {
        return Either.left(new Recogniser.ErrorDetails(StyledString.s(msg), errorPosition));
    }

    /** Java: success(value, replacementText, parseProgress) and success(value, replacementText, styleSpanInfos, parseProgress). */
    protected success(value: T, replacementText: string, parseProgress: ParseProgress): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>;
    protected success(value: T, replacementText: string, styleSpanInfos: readonly Recogniser.StyleSpanInfo[], parseProgress: ParseProgress): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>;
    protected success(value: T, replacementText: string, a: readonly Recogniser.StyleSpanInfo[] | ParseProgress, b?: ParseProgress): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<T>>
    {
        if (b === undefined)
            return Either.right(Recogniser.SuccessDetails._make(value, replacementText, [], a as ParseProgress));
        return Either.right(Recogniser.SuccessDetails._make(value, replacementText, a as readonly Recogniser.StyleSpanInfo[], b));
    }
}

export namespace Recogniser
{
    export class ErrorDetails
    {
        public readonly error: StyledString;
        public readonly errorPosition: number;
        //public final ImmutableList<Fix> fixes;

        public constructor(error: StyledString, errorPosition: number)
        {
            this.error = error;
            this.errorPosition = errorPosition;
        }
    }

    export class SuccessDetails<T extends Value>
    {
        public readonly value: T;
        public readonly immediateReplacementText: string;
        public readonly styles: readonly StyleSpanInfo[];
        public readonly parseProgress: ParseProgress;

        private constructor(value: T, immediateReplacementText: string, styles: readonly StyleSpanInfo[], parseProgress: ParseProgress)
        {
            this.value = value;
            this.immediateReplacementText = immediateReplacementText;
            this.styles = styles;
            this.parseProgress = parseProgress;
        }

        /** @internal Java: the private constructor, used by Recogniser. */
        public static _make<T extends Value>(value: T, immediateReplacementText: string, styles: readonly StyleSpanInfo[], parseProgress: ParseProgress): SuccessDetails<T>
        {
            return new SuccessDetails(value, immediateReplacementText, styles, parseProgress);
        }

        public asObject(): SuccessDetails<Value>
        {
            return new SuccessDetails<Value>(this.value, this.immediateReplacementText, this.styles, this.parseProgress);
        }

        // Makes sure there are no non-spaces left to be processed
        public requireEnd(): Either<ErrorDetails, SuccessDetails<T>>
        {
            const pp = this.parseProgress.skipSpaces();
            if (pp.curCharIndex === pp.src.length)
                return Either.right(this);
            else
                return Either.left(new ErrorDetails(StyledString.s("Unexpected additional content: " + pp.src.substring(pp.curCharIndex)), pp.curCharIndex));
        }
    }

    export class StyleSpanInfo
    {
        public readonly startIndex: number;
        public readonly endIndex: number;
        public readonly styleClasses: ReadonlySet<string>;

        public constructor(startIndex: number, endIndex: number, styleClasses: ReadonlySet<string>)
        {
            this.startIndex = startIndex;
            this.endIndex = endIndex;
            this.styleClasses = styleClasses;
        }
    }
}
