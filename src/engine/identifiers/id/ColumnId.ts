// Port of xyz.columnal.id.ColumnId (identifiers module).
import type { ExpressionIdentifier, Localized } from "../../anns/Annotations.js";
import { isDigit, isLetter } from "../../java/JavaCharacter.js";
import { javaStringCompare, javaStringHashCode, type Comparable } from "../../java/JavaObject.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../utility-error/styled/StyledShowable.js";

/**
 * Created by neil on 14/11/2016.
 */
export class ColumnId implements Comparable<ColumnId>, StyledShowable
{
    private readonly columnId: ExpressionIdentifier;

    public constructor(columnId: ExpressionIdentifier)
    {
        this.columnId = columnId;
    }

    public static validCharacter(codePoint: number, start: boolean): boolean
    {
        return isLetter(codePoint) || ((codePoint === 0x20 || isDigit(codePoint)) && !start);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ColumnId) || o.constructor !== this.constructor) return false;
        return this.columnId === o.columnId;
    }

    public hashCode(): number
    {
        return javaStringHashCode(this.columnId);
    }

    public toString(): string
    {
        return this.columnId;
    }

    public getOutput(): string
    {
        return this.columnId;
    }

    public getRaw(): Localized & ExpressionIdentifier
    {
        return this.columnId;
    }

    public compareTo(o: ColumnId): number
    {
        return javaStringCompare(this.columnId, o.columnId);
    }

    public toStyledString(): StyledString
    {
        return StyledString.s(this.columnId);
    }
}
