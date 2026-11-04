// In the engine: what an expression editor can refer to (ColumnLookupInfo), for the GUI's copy of the
// editor's MultipleTableLookup (src/gui/project/columnLookupCopy.ts).
import type { Column } from "../../engine/data/data/Column.js";
import type { Table } from "../../engine/data/data/Table.js";
import type { TableManager } from "../../engine/data/data/TableManager.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import type { ColumnLookupInfo, LookupColumnInfo, LookupTableInfo } from "./protocol.js";

export function columnLookupInfo(tableManager: TableManager, us: string | null, src: string | null): ColumnLookupInfo
{
    return {
        us,
        src,
        tables: tableManager.getAllTables().map(t => tableInfo(tableManager, t)),
        available: tableManager.getAllTablesAvailableTo(us === null ? null : new TableId(us), false).map(t => t.getId().getRaw()),
    };
}

// The message of an error the lookup would catch (others are thrown)
function caught(e: unknown): string
{
    if (e instanceof UserException || e instanceof InternalException)
        return e.getLocalizedMessage() ?? "";
    throw e;
}

function tableInfo(tableManager: TableManager, table: Table): LookupTableInfo
{
    const single = tableManager.getSingleTableOrNull(table.getId()) === table;
    try
    {
        return { id: table.getId().getRaw(), single, columns: table.getData().getColumns().map(columnInfo), error: null };
    }
    catch (e)
    {
        return { id: table.getId().getRaw(), single, columns: null, error: caught(e) };
    }
}

function columnInfo(column: Column): LookupColumnInfo
{
    let type: string | null = null;
    let typeError: string | null = null;
    try
    {
        type = TypeExpression.fromDataType(column.getType().getType()).save(Expression.SaveDestination.TO_FILE, TableAndColumnRenames.EMPTY);
    }
    catch (e)
    {
        typeError = caught(e);
    }
    return { name: column.getName().getRaw(), type, typeError, altered: column.getAlteredState() };
}
