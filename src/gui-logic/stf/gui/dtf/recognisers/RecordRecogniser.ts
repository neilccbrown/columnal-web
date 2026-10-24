// Port of xyz.columnal.gui.dtf.recognisers.RecordRecogniser (stf module).
import type { ExpressionIdentifier } from "../../../../../engine/anns/Annotations.js";
import type { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";
import { IdentifierUtility } from "../../../../../engine/utility/utility/IdentifierUtility.js";
import type { ParseProgress } from "../../../../../engine/utility/utility/ParseProgress.js";
import { javaTrim } from "../../../../../engine/java/JavaString.js";
import { RecordMap, Utility, type Record } from "../../../../../engine/utility/utility/Utility.js";
import type { Value } from "../../../../../engine/utility/utility/Value.js";
import { Recogniser } from "../Recogniser.js";

class SortedStringContent
{
    private readonly addRoundBrackets: boolean;
    private readonly fieldContent = new Map<ExpressionIdentifier, string>();

    public constructor(addRoundBrackets: boolean)
    {
        this.addRoundBrackets = addRoundBrackets;
    }

    public append(fieldName: ExpressionIdentifier, content: string): void
    {
        this.fieldContent.set(fieldName, content);
    }

    public build(): string
    {
        // Sorted by field name (Java's String.compareTo, which compares UTF-16 code units, as < does):
        return (this.addRoundBrackets ? "(" : "")
            + [...this.fieldContent.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(e => e[0] + ": " + e[1]).join(", ")
            + (this.addRoundBrackets ? ")" : "");
    }
}

export class RecordRecogniser extends Recogniser<Record>
{
    private readonly members: ReadonlyMap<ExpressionIdentifier, Recogniser<Value>>;

    public constructor(members: ReadonlyMap<ExpressionIdentifier, Recogniser<Value>>)
    {
        super();
        this.members = members;
    }

    public override process(orig: ParseProgress, immediatelySurroundedByRoundBrackets: boolean): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<Record>>
    {
        let pp: ParseProgress | null = orig;
        if (!immediatelySurroundedByRoundBrackets)
            pp = pp.consumeNext("(");
        if (pp === null)
            return this.error("Expected '(' to begin a record", orig.curCharIndex);
        const remainingFields = new Map<ExpressionIdentifier, Recogniser<Value>>(this.members);

        return this.next(false, !immediatelySurroundedByRoundBrackets, remainingFields, pp, new Map(), new SortedStringContent(!immediatelySurroundedByRoundBrackets));
    }

    // Recurse down the list of members, processing one and if no error, process next, until no more members and then look for closing bracket:
    private next(expectComma: boolean, expectClosingBracket: boolean, remainingMembers: Map<ExpressionIdentifier, Recogniser<Value>>, orig: ParseProgress, soFar: Map<ExpressionIdentifier, Recogniser.SuccessDetails<Value>>, replTextSoFar: SortedStringContent): Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<Record>>
    {
        let pp: ParseProgress | null = orig;
        // If no more members, look for closing bracket:
        if (remainingMembers.size === 0)
        {
            if (expectClosingBracket)
            {
                pp = pp.consumeNext(")");
            }
            if (pp === null)
                return this.error("Expected ')' to end record", orig.curCharIndex);

            const all = soFar;
            return this.success(RecordMap.immediate(Utility.mapValues(all, s => s.value)), replTextSoFar.build(), [...all.values()].flatMap(s => s.styles), pp);
        }
        if (expectComma)
        {
            const beforeComma = pp;
            pp = pp.consumeNext(",");
            if (pp === null)
                return this.error("Expected ',' to separate record fields", beforeComma.curCharIndex);
        }

        // Look for field name:
        const fieldName: Pair<string, ParseProgress> | null = pp.consumeUpToAndIncluding(":");
        if (fieldName === null)
            return this.error("Expected field name followed by colon", pp.curCharIndex);
        const name = IdentifierUtility.asExpressionIdentifier(javaTrim(fieldName.getFirst()));
        if (name === null)
            return this.error("Expected field name followed by colon", pp.curCharIndex);
        const recogniser = remainingMembers.get(name);
        remainingMembers.delete(name);
        if (recogniser === undefined)
            return this.error("Unknown field name: \"" + name + "\"", pp.curCharIndex);
        pp = fieldName.getSecond();

        return recogniser.process(pp, false).map(s => s.asObject())
            .flatMap((succ: Recogniser.SuccessDetails<Value>) =>
            {
                soFar.set(name, succ);
                replTextSoFar.append(name, succ.immediateReplacementText);
                return this.next(true, expectClosingBracket, remainingMembers, succ.parseProgress, soFar, replTextSoFar);
            });
    }
}
