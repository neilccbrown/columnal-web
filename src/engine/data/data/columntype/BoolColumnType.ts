// Port of xyz.columnal.data.columntype.BoolColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { javaObjectsHash } from "../../../java/JavaObject.js";
import { javaTrim } from "../../../java/JavaString.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { ColumnType } from "./ColumnTypes.js";

export class BoolColumnType extends ColumnType
{
    private readonly lowerCaseTrue: string;
    private readonly lowerCaseFalse: string;

    public constructor(lowerCaseTrue: string, lowerCaseFalse: string)
    {
        super();
        this.lowerCaseTrue = lowerCaseTrue;
        this.lowerCaseFalse = lowerCaseFalse;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof BoolColumnType)) return false;
        const that = o;
        return this.lowerCaseTrue === that.lowerCaseTrue;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.lowerCaseTrue);
    }

    public override toString(): string
    {
        return "Boolean[" + this.lowerCaseTrue + "]";
    }

    public parse(s: string): Either<string, boolean>
    {
        // PORT-NOTE: Java's equalsIgnoreCase compares each char's upper and lower case; toLowerCase
        // on both strings agrees with it for the true/false words that Columnal guesses.
        if (javaTrim(s).toLowerCase() === this.lowerCaseTrue.toLowerCase())
            return Either.right(true);
        else if (javaTrim(s).toLowerCase() === this.lowerCaseFalse.toLowerCase())
            return Either.right(false);
        else
            return Either.left(s);
    }
}
