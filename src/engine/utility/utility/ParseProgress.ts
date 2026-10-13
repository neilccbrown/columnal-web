// Port of xyz.columnal.utility.ParseProgress (utility module).
import { codePoints, isWhitespace } from "../../java/JavaCharacter.js";
import { javaRegionMatches } from "../../java/JavaString.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";

export class ParseProgress
{
    public readonly src: string;
    public readonly curCharIndex: number;

    protected constructor(src: string, curCharIndex: number)
    {
        this.src = src;
        this.curCharIndex = curCharIndex;
    }

    public static fromStart(text: string): ParseProgress
    {
        return new ParseProgress(text, 0);
    }

    public consumeNext(match: string): ParseProgress | null
    {
        const next = codePoints(match).some(isWhitespace) ? this.curCharIndex : this.skipSpaces().curCharIndex;
        if (this.src.startsWith(match, next))
            return new ParseProgress(this.src, next + match.length);
        else
            return null;
    }

    // Consumes all text until the terminator, and returns it, and consumes the terminator.
    public consumeUpToAndIncluding(terminator: string): Pair<string, ParseProgress> | null
    {
        const index = this.src.indexOf(terminator, this.curCharIndex);
        if (index === -1)
            return null;
        return new Pair(this.src.substring(this.curCharIndex, index), new ParseProgress(this.src, index + terminator.length));
    }

    // Consumes all text until the soonest terminator, and returns it, and does NOT consume the terminator.
    // If none are found, consumes whole string
    public consumeUpToAndExcluding(terminators: readonly string[]): Pair<string, ParseProgress>
    {
        let earliest = this.src.length;
        for (const terminator of terminators)
        {
            const index = this.src.indexOf(terminator, this.curCharIndex);
            if (index !== -1 && index < earliest)
                earliest = index;
        }
        return new Pair(this.src.substring(this.curCharIndex, earliest), new ParseProgress(this.src, earliest));
    }

    // Ignore case
    public consumeNextIC(match: string): ParseProgress | null
    {
        const next = this.skipSpaces().curCharIndex;
        if (javaRegionMatches(this.src, true, next, match, 0, match.length))
            return new ParseProgress(this.src, next + match.length);
        else
            return null;
    }

    public skip(chars: number): ParseProgress
    {
        return new ParseProgress(this.src, this.curCharIndex + chars);
    }

    public skipSpaces(): ParseProgress
    {
        let i = this.curCharIndex;
        while (i < this.src.length && isWhitespace(this.src.charCodeAt(i)))
            i += 1;
        return new ParseProgress(this.src, i);
    }

    // Doesn't skip spaces!
    public consumeNumbers(): Pair<string, ParseProgress>
    {
        let start = this.curCharIndex;
        // Java: Character.isDigit(char)
        while (start < this.src.length && /\p{Nd}/u.test(this.src[start]!))
            start += 1;
        return new Pair(this.src.substring(this.curCharIndex, start), new ParseProgress(this.src, start));
    }
}
