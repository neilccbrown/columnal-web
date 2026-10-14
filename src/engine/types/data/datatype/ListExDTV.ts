// Port of xyz.columnal.data.datatype.ListExDTV (types module).
import { ListEx } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { DataTypeValue } from "./DataTypeValue.js";

/**
 * A ListEx wrapped around a column
 */
export class ListExDTV extends ListEx
{
    private readonly length: number;
    private readonly columnType: DataTypeValue;

    /*
    public ListExDTV(Column column) throws UserException, InternalException
    {
        this.length = column.getLength();
        this.columnType = column.getType();
    }
    */

    public constructor(length: number, values: DataTypeValue)
    {
        super();
        this.length = length;
        this.columnType = values;
    }

    public override size(): number
    {
        return this.length;
    }

    public override get(index: number): Value
    {
        return this.columnType.getCollapsed(index);
    }
}
