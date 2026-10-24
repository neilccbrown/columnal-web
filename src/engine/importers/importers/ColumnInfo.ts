// Port of xyz.columnal.importers.ColumnInfo (importers module).
import type { ColumnType } from "../../data/data/columntype/ColumnType.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";

/**
 * Created by neil on 31/10/2016.
 */
export class ColumnInfo
{
    public readonly type: ColumnType;
    public readonly title: ColumnId;

    public constructor(type: ColumnType, title: ColumnId)
    {
        this.type = type;
        this.title = title;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ColumnInfo)) return false;
        const that = o;
        return this.title.equals(that.title) && this.type.equals(that.type);
    }

    public hashCode(): number
    {
        let result = this.type.hashCode();
        result = (Math.imul(31, result) + this.title.hashCode()) | 0;
        return result;
    }

    public toString(): string
    {
        return "ColumnInfo{" +
            "columntype=" + this.type.toString() +
            ", title='" + this.title.toString() + "'" +
            "}";
    }
}
