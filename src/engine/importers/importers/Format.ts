// Port of xyz.columnal.importers.Format (importers module).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import type { ColumnInfo } from "./ColumnInfo.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { GuessFormat } from "./GuessFormat.js";

/**
 * Created by neil on 31/10/2016.
 */
export class Format
{
    public readonly trimChoice: GuessFormat.TrimChoice;
    public readonly columnTypes: readonly ColumnInfo[];
    public readonly problems: string[] = [];

    // Java has two constructors: (trimChoice, columnTypes) and the copy constructor (Format copyFrom).
    public constructor(trimChoice: GuessFormat.TrimChoice, columnTypes: readonly ColumnInfo[]);
    public constructor(copyFrom: Format);
    public constructor(a: GuessFormat.TrimChoice | Format, columnTypes?: readonly ColumnInfo[])
    {
        if (a instanceof Format)
        {
            this.trimChoice = a.trimChoice;
            this.columnTypes = a.columnTypes;
        }
        else
        {
            this.trimChoice = a;
            this.columnTypes = columnTypes!;
        }
    }

    public recordProblem(problem: string): void
    {
        this.problems.push(problem);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof Format)) return false;
        const format = o;
        return javaEquals(this.trimChoice, format.trimChoice) &&
                javaEquals(this.columnTypes, format.columnTypes);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.trimChoice, this.columnTypes);
    }

    public toString(): string
    {
        return "Format{" +
            ", columnTypes=" + Utility.listToString(this.columnTypes) +
            "}";
    }
}
