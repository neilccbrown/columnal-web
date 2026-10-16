// Port of test.SingleTableLookup (tests-functions testFixtures).
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { Expression } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import type { TableId } from "../../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../../src/engine/java/HashMap.js";
import type { DataTypeValue } from "../../../../src/engine/types/data/datatype/DataTypeValue.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { Log } from "../../../../src/engine/utility/log/Log.js";

export class SingleTableLookup implements Expression.ColumnLookup
{
    // Java: private (ExpressionValue has its own field of the same name)
    protected readonly tableId: TableId;
    private readonly srcTable: RecordSet;

    public constructor(tableId: TableId, srcTable: RecordSet)
    {
        this.tableId = tableId;
        this.srcTable = srcTable;
    }

    public getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
    {
        return this.srcTable.getColumns().map(c => new Pair<TableId | null, ColumnId>(null, c.getName()));
    }

    public getAvailableTableReferences(): TableId[]
    {
        return [this.tableId];
    }

    public getPossibleColumnReferences(_tableId: TableId, _columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
    {
        return []; // Not used in testing
    }

    public getColumn(_expression: Expression, refTableId: TableId | null, refColumnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
    {
        try
        {
            if (refTableId === null || refTableId.equals(this.tableId))
            {
                const column = this.srcTable.getColumnOrNull(refColumnId);
                if (column !== null)
                    return new Expression.ColumnLookup.FoundColumn(this.tableId, true, column.getType(), null);
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            Log.log(e);
        }
        return null;
    }

    public getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
    {
        if (!this.tableId.equals(tableName))
            return null;

        const tableId = this.tableId;
        const srcTable = this.srcTable;
        return {
            getTableId(): TableId
            {
                return tableId;
            },

            getColumnTypes(): HashMap<ColumnId, DataTypeValue>
            {
                const columns = new HashMap<ColumnId, DataTypeValue>();
                for (const column of srcTable.getColumns())
                {
                    columns.set(column.getName(), column.getType());
                }
                return columns;
            },

            getRowCount(): number
            {
                return srcTable.getLength();
            },
        };
    }
}
