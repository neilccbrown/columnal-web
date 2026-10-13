// Port of xyz.columnal.id.TableId (identifiers module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { javaStringCompare, javaStringHashCode, type Comparable } from "../../java/JavaObject.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../utility-error/styled/StyledShowable.js";

/**
 * Created by neil on 14/11/2016.
 */
export class TableId implements Comparable<TableId>, StyledShowable
{
    private readonly tableId: ExpressionIdentifier;

    public constructor(tableId: ExpressionIdentifier)
    {
        this.tableId = tableId;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TableId) || o.constructor !== this.constructor) return false;
        return this.tableId === o.tableId;
    }

    public hashCode(): number
    {
        return javaStringHashCode(this.tableId);
    }

    public toString(): string
    {
        return this.tableId;
    }

    public getOutput(): string
    {
        return this.tableId;
    }

    public getRaw(): ExpressionIdentifier
    {
        return this.tableId;
    }

    public compareTo(o: TableId): number
    {
        return javaStringCompare(this.tableId, o.tableId);
    }

    public toStyledString(): StyledString
    {
        return StyledString.s(this.tableId);
    }
}
