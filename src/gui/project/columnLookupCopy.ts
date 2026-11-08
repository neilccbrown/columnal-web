// A copy, on the main thread, of what an expression editor can refer to (PLAN.md Phase 10): the
// editor checks each edit as it is made, but the tables are in the engine's worker, so the engine
// sends their columns and types (ColumnLookupInfo, from src/gui/engine/columnLookupInfo.ts) and this
// answers the editor as Java's MultipleTableLookup (which it follows, method by method) answers over
// the TableManager.  Values aren't copied: the editor only checks types.  CheckLookupCopy, below, does
// the same for a Check's expression (Java: Check.getColumnLookup).
import type { ExpressionIdentifier } from "../../engine/anns/Annotations.js";
import { Column } from "../../engine/data/data/Column.js";
import { Expression, IdentExpression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { QuickFix } from "../../engine/expressions/transformations/expression/QuickFix.js";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { HashMap, HashSet } from "../../engine/java/HashMap.js";
import { javaEquals } from "../../engine/java/JavaObject.js";
import { Check } from "../../engine/transformations/transformations/Check.js";
import type { MultipleTableLookup } from "../../engine/transformations/transformations/MultipleTableLookup.js";
import { GetValue, type DataTypeValue } from "../../engine/types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { StyledCSS } from "../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../engine/utility-functional/utility/function/simulation/SimulationConsumer.js";
import type { ColumnLookupInfo, LookupColumnInfo, LookupTableInfo } from "../engine/protocol.js";

// A table's copy: its columns' types are made as they are asked for (Java: Column.getType)
class TableCopy
{
    public readonly id: TableId;
    private readonly types = new Map<string, DataTypeValue>();

    public constructor(public readonly info: LookupTableInfo, private readonly typeManager: TypeManager)
    {
        this.id = new TableId(info.id);
    }

    // Java: getData().getColumns(), which throws if the table's data can't be had
    public getColumns(): readonly LookupColumnInfo[]
    {
        if (this.info.columns === null)
            throw new UserException(this.info.error ?? "");
        return this.info.columns;
    }

    public getColumnOrNull(columnId: ColumnId): LookupColumnInfo | null
    {
        return this.getColumns().find(c => c.name === columnId.getRaw()) ?? null;
    }

    // Java: Column.getType
    public getType(column: LookupColumnInfo): DataTypeValue
    {
        const existing = this.types.get(column.name);
        if (existing !== undefined)
            return existing;
        if (column.type === null)
            throw new UserException(column.typeError ?? "");
        const dataType = TypeExpression.parseTypeExpression(column.type).toDataType(this.typeManager);
        if (dataType === null)
            throw new InternalException("Could not make type " + column.type + " of column " + column.name);
        const value = dataType.fromCollapsed(GetValue.of(() =>
        {
            throw new InternalException("Column values are in the engine");
        }));
        this.types.set(column.name, value);
        return value;
    }
}

export class ColumnLookupCopy implements Expression.ColumnLookup
{
    private readonly us: TableId | null;
    private readonly tables: readonly TableCopy[];
    private readonly available: readonly TableCopy[];
    private readonly srcTable: TableCopy | null;
    private readonly editing: MultipleTableLookup.CalculationEditor | null;

    public constructor(info: ColumnLookupInfo, typeManager: TypeManager, editing: MultipleTableLookup.CalculationEditor | null)
    {
        this.us = info.us === null ? null : new TableId(info.us);
        this.tables = info.tables.map(t => new TableCopy(t, typeManager));
        this.available = info.available.map(id => this.tables.find(t => t.info.id === id && t.info.single)).filter(t => t !== undefined);
        this.srcTable = info.src === null ? null : this.getSingleTableOrNull(new TableId(info.src));
        this.editing = editing;
    }

    // Java: TableManager.getSingleTableOrNull
    private getSingleTableOrNull(tableId: TableId): TableCopy | null
    {
        return this.tables.find(t => t.info.single && t.id.equals(tableId)) ?? null;
    }

    public getFixForIdent(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], target: Expression): QuickFix<Expression> | null
    {
        const editing = this.editing;
        if (editing === null)
            return null;

        try
        {
            let columnsInUs: readonly string[] = [];
            if (this.us !== null)
            {
                const ourTable = this.getSingleTableOrNull(this.us);
                if (ourTable !== null)
                    columnsInUs = ourTable.getColumns().map(c => c.name);
            }
            const columnsFromSrc = this.srcTable === null ? [] : this.srcTable.getColumns().map(c => c.name);

            if ((namespace === null || namespace === "column") && idents.length === 1 && columnsInUs.includes(idents[0]!) && !columnsFromSrc.includes(idents[0]!))
            {
                return new QuickFix<Expression>(StyledString.s("Make a new calculation that can use this table's " + idents[0]!), [], target, {
                    doAction(_typeManager: TypeManager, _editorSceneProperty: unknown): SimulationConsumer<Pair<ColumnId | null, Expression>> | null
                    {
                        return editing.moveExpressionToNewCalculation();
                    },
                });
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
        }
        return null;
    }

    public getPossibleColumnReferences(tableId: TableId, columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
    {
        // Handle us and source table specially:
        if (this.us !== null && tableId.equals(this.us))
        {
            // Can't refer to an edited column
            if (this.editing !== null && columnId.equals(this.editing.getCurrentlyEditingColumn()))
                return [];

            const usTable = this.getSingleTableOrNull(this.us);
            if (usTable === null)
                return [];
            try
            {
                const column = usTable.getColumnOrNull(columnId);
                if (column === null || column.altered === Column.AlteredState.OVERWRITTEN)
                    return [];
                return [columnReference(tableId, columnId, false)];
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                return [];
            }
        }
        if (this.srcTable !== null && tableId.equals(this.srcTable.id))
        {
            try
            {
                if (this.srcTable.getColumnOrNull(columnId) === null)
                    return [];
                return [columnReference(tableId, columnId, false)];
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                return [];
            }
        }
        // For everything else fall back to usual:
        return this.getAvailableColumnReferences().filter(c => tableId.equals(c.getFirst()) && columnId.equals(c.getSecond())).map(_c => columnReference(tableId, columnId, true));
    }

    public getAvailableTableReferences(): TableId[]
    {
        return this.available.map(t => t.id);
    }

    public getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
    {
        const all = this.available.flatMap((t): Pair<TableId | null, ColumnId>[] =>
        {
            try
            {
                const isUsOrSrc = javaEquals(this.us, t.id) || (this.srcTable !== null && javaEquals(t.id, this.srcTable.id));
                return t.getColumns().map(c => new Pair<TableId | null, ColumnId>(isUsOrSrc ? null : t.id, new ColumnId(c.name)));
            }
            catch (e)
            {
                if (e instanceof UserException || e instanceof InternalException)
                    return [];
                throw e;
            }
        });
        // Stream.distinct():
        return [...new HashSet(all)];
    }

    public getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
    {
        if (tableName === null && this.srcTable !== null)
            tableName = this.srcTable.id;
        const tableNameFinal = tableName;
        const t = this.available.find(table => table.id.equals(tableNameFinal)) ?? null;
        if (t === null)
            return null;
        return foundTable(t);
    }

    public getColumn(expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
    {
        try
        {
            const table = tableId === null ? this.srcTable : this.getSingleTableOrNull(tableId);
            if (table !== null)
            {
                const column = table.getColumnOrNull(columnId);
                if (column === null)
                    return null;
                const columnType = table.getType(column);
                return new Expression.ColumnLookup.FoundColumn(table.id, this.srcTable !== null && this.srcTable.id.equals(table.id), columnType, this.checkRedefined(expression, tableId, columnId));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
        }
        return null;
    }

    // If column is redefined in this table, issue a warning
    private checkRedefined(expression: Expression, tableId: TableId | null, columnId: ColumnId): Pair<StyledString, QuickFix<Expression> | null> | null
    {
        if (tableId === null && this.us !== null)
        {
            try
            {
                const ourTable = this.getSingleTableOrNull(this.us);
                if (ourTable === null)
                    return null;
                const c = ourTable.getColumnOrNull(columnId);
                if (c !== null && this.editing !== null && !javaEquals(columnId, this.editing.getCurrentlyEditingColumn()) && c.altered === Column.AlteredState.OVERWRITTEN)
                {
                    return new Pair<StyledString, QuickFix<Expression> | null>(StyledString.concat(StyledString.s("Note: column "), StyledString.styled(c.name, new StyledCSS("column-reference")), StyledString.s(" is re-calculated in this table, but this reference will use the value from the source table.")), this.getFixForIdent("column", [columnId.getRaw()], expression));
                }
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
            }
        }
        return null;
    }
}

// Java: FoundTableActual
function foundTable(t: TableCopy): Expression.ColumnLookup.FoundTable
{
    return {
        getTableId: () => t.id,
        getColumnTypes: () =>
        {
            const columns = new HashMap<ColumnId, DataTypeValue>();
            for (const column of t.getColumns())
                columns.set(new ColumnId(column.name), t.getType(column));
            return columns;
        },
        getRowCount: () =>
        {
            throw new InternalException("Row counts are in the engine");
        },
    };
}

/**
 * Java: Check.getColumnLookup, for a Check (info.us, or null for one not yet made) of the source table
 * (info.src) with the check type.  It is unlike MultipleTableLookup: a reference by name alone is to
 * the source table's column, only the source table's columns are offered, and a STANDALONE check can
 * refer to no columns.
 */
export class CheckLookupCopy implements Expression.ColumnLookup
{
    private readonly us: TableId | null;
    private readonly srcTableId: TableId;
    private readonly tables: readonly TableCopy[];
    private readonly available: readonly TableId[];

    public constructor(info: ColumnLookupInfo, typeManager: TypeManager, private readonly checkType: Check.CheckType)
    {
        if (info.src === null)
            throw new InternalException("A Check's lookup needs its source table");
        this.us = info.us === null ? null : new TableId(info.us);
        this.srcTableId = new TableId(info.src);
        this.tables = info.tables.map(t => new TableCopy(t, typeManager));
        this.available = info.available.map(id => new TableId(id));
    }

    // Java: TableManager.getSingleTableOrNull
    private getSingleTableOrNull(tableId: TableId): TableCopy | null
    {
        return this.tables.find(t => t.info.single && t.id.equals(tableId)) ?? null;
    }

    public getColumn(_expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
    {
        try
        {
            let column: Pair<TableCopy, LookupColumnInfo> | null = null;
            const srcTable = this.getSingleTableOrNull(this.srcTableId);
            if (tableId === null)
            {
                if (srcTable !== null)
                {
                    const col = srcTable.getColumnOrNull(columnId);
                    column = col === null ? null : new Pair(srcTable, col);
                }
            }
            else
            {
                const table = this.getSingleTableOrNull(tableId);
                if (table !== null)
                {
                    const col = table.getColumnOrNull(columnId);
                    column = col === null ? null : new Pair(table, col);
                }
            }
            if (column === null)
                return null;
            else if (this.checkType === Check.CheckType.STANDALONE)
                return null;
            else
                return new Expression.ColumnLookup.FoundColumn(column.getFirst().id, this.srcTableId.equals(column.getFirst().id), column.getFirst().getType(column.getSecond()), null);
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
        }
        return null;
    }

    public getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
    {
        return this.tables.flatMap((t): Pair<TableId | null, ColumnId>[] =>
        {
            try
            {
                const columns: Pair<TableId | null, ColumnId>[] = [];
                if (t.id.equals(this.srcTableId))
                {
                    for (const column of t.getColumns())
                    {
                        if (this.checkType !== Check.CheckType.STANDALONE)
                            columns.push(new Pair<TableId | null, ColumnId>(null, new ColumnId(column.name)));
                    }
                }
                return columns;
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                return [];
            }
        });
    }

    // (A reference without a table is to the source's column)
    public getPossibleColumnReferences(tableId: TableId, columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
    {
        return this.getAvailableColumnReferences().filter(c => tableId.equals(c.getFirst() ?? this.srcTableId) && columnId.equals(c.getSecond())).map(c => new class extends Expression.ColumnLookup.ClickedReference
        {
            public getExpression(): Expression
            {
                return IdentExpression.column(c.getFirst(), c.getSecond());
            }
        }(tableId, columnId));
    }

    public getAvailableTableReferences(): TableId[]
    {
        return [...this.available];
    }

    public getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
    {
        let t: TableCopy | null;
        if (tableName === null)
            t = this.us === null ? null : this.getSingleTableOrNull(this.us);
        else
            t = this.getSingleTableOrNull(tableName);
        return t === null ? null : foundTable(t);
    }
}

// Java: MultipleTableLookup's ClickedReferences: to a column of us or the source table (by name
// alone), or of another table
function columnReference(tableId: TableId, columnId: ColumnId, withTable: boolean): Expression.ColumnLookup.ClickedReference
{
    return new class extends Expression.ColumnLookup.ClickedReference
    {
        public getExpression(): Expression
        {
            return withTable ? IdentExpression.column(this.getTableId(), this.getColumnId()) : IdentExpression.column(this.getColumnId());
        }
    }(tableId, columnId);
}
