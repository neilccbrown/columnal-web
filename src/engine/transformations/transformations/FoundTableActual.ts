// Port of xyz.columnal.transformations.FoundTableActual (transformations module).
import type { Table } from "../../data/data/Table.js";
import type { Expression } from "../../expressions/transformations/expression/Expressions.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";

// Default implementation of FoundTable
export class FoundTableActual implements Expression.ColumnLookup.FoundTable
{
    private readonly table: Table;

    public constructor(table: Table)
    {
        this.table = table;
    }

    public getTableId(): TableId
    {
        return this.table.getId();
    }

    public getColumnTypes(): HashMap<ColumnId, DataTypeValue>
    {
        const columns = new HashMap<ColumnId, DataTypeValue>();
        for (const column of this.table.getData().getColumns())
        {
            columns.set(column.getName(), column.getType());
        }
        return columns;
    }

    public getRowCount(): number
    {
        return this.table.getData().getLength();
    }
}
