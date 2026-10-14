// Port of xyz.columnal.data.TableOperations (data module).
// The nested functional interfaces are function types in the TableOperations namespace.
import type { TableDataRowIndex } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableId } from "../../identifiers/id/TableId.js";

/**
 * Created by neil on 29/05/2017.
 */
export class TableOperations
{
    public readonly renameTable: TableOperations.RenameTable | null;
    public readonly deleteColumn: (columnId: ColumnId) => TableOperations.DeleteColumn | null;
    public readonly appendRows: TableOperations.AppendRows | null;
    // Row index to insert at, count
    public readonly insertRows: TableOperations.InsertRows | null;
    // Row index to delete at (incl), count
    public readonly deleteRows: TableOperations.DeleteRows | null;

    public constructor(renameTable: TableOperations.RenameTable | null, deleteColumn: (columnId: ColumnId) => TableOperations.DeleteColumn | null, appendRows: TableOperations.AppendRows | null, insertRows: TableOperations.InsertRows | null, deleteRows: TableOperations.DeleteRows | null)
    {
        this.renameTable = renameTable;
        this.deleteColumn = deleteColumn;
        this.appendRows = appendRows;
        this.insertRows = insertRows;
        this.deleteRows = deleteRows;
    }
}

export namespace TableOperations
{
    // Delete column (only available if this is source of the column)
    export type DeleteColumn = (columnId: ColumnId) => void;

    // Add rows at end
    export type AppendRows = (count: number) => void;

    // Add rows in middle
    export type InsertRows = (beforeRowIndex: TableDataRowIndex, count: number) => void;

    export type DeleteRows = (rowIndex: TableDataRowIndex, count: number) => void;

    export type RenameTable = (newName: TableId) => void;
}
