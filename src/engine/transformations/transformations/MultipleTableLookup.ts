// Port of xyz.columnal.transformations.MultipleTableLookup (transformations module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { Column } from "../../data/data/Column.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import type { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { Expression, IdentExpression } from "../../expressions/transformations/expression/Expressions.js";
import { QuickFix } from "../../expressions/transformations/expression/QuickFix.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { HashSet } from "../../java/HashMap.js";
import { javaEquals } from "../../java/JavaObject.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledCSS } from "../../utility-error/styled/StyledCSS.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../utility-functional/utility/function/simulation/SimulationConsumer.js";
import { Log } from "../../utility/log/Log.js";
import { FoundTableActual } from "./FoundTableActual.js";

/**
 * Lookup for filter and calculate.  Available columns are:
 * - per-row columns (with null table id) from
 * the source table (equivalent to  our table if the column
 * is unaltered)
 * - @table columns from the source table (equivalent to our table if the column
 * is unaltered)
 * -  @table columns from all tables that
 * are behind this in the dependency tree,
 * with non-null table id.
 */
export class MultipleTableLookup implements Expression.ColumnLookup
{
    // Only null during testing
    private readonly us: TableId | null;
    private readonly tableManager: TableManager;
    private readonly srcTable: Table | null;
    private readonly editing: MultipleTableLookup.CalculationEditor | null;

    public constructor(us: TableId | null, tableManager: TableManager, srcTableId: TableId | null, editing: MultipleTableLookup.CalculationEditor | null)
    {
        this.us = us;
        this.tableManager = tableManager;
        this.srcTable = srcTableId === null ? null : tableManager.getSingleTableOrNull(srcTableId);
        this.editing = editing;
    }

    public getFixForIdent(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], target: Expression): QuickFix<Expression> | null
    {
        const editing = this.editing;
        if (editing === null)
            return null;

        let columnsFromSrc: readonly ColumnId[];
        let columnsInUs: readonly ColumnId[];

        try
        {
            if (this.us !== null)
            {
                const ourTable = this.tableManager.getSingleTableOrNull(this.us);
                if (ourTable !== null)
                    columnsInUs = ourTable.getData().getColumnIds();
                else
                    columnsInUs = [];
            }
            else
                columnsInUs = [];

            columnsFromSrc = this.srcTable === null ? [] : this.srcTable.getData().getColumnIds();

            if ((namespace === null || namespace === "column") && idents.length === 1 && columnsInUs.some(c => c.equals(new ColumnId(idents[0]!))) && !columnsFromSrc.some(c => c.equals(new ColumnId(idents[0]!))))
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
            if (e instanceof InternalException)
                Log.log(e);
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

            const usTable = this.tableManager.getSingleTableOrNull(this.us);
            if (usTable === null)
                return [];
            try
            {
                const column = usTable.getData().getColumnOrNull(columnId);
                if (column === null || column.getAlteredState() === Column.AlteredState.OVERWRITTEN)
                    return [];
                return [new class extends Expression.ColumnLookup.ClickedReference
                {
                    public getExpression(): Expression
                    {
                        return IdentExpression.column(this.getColumnId());
                    }
                }(tableId, columnId)];
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                if (e instanceof InternalException)
                    Log.log(e);
                return [];
            }
        }
        if (this.srcTable !== null && tableId.equals(this.srcTable.getId()))
        {
            try
            {
                const column = this.srcTable.getData().getColumnOrNull(columnId);
                if (column === null)
                    return [];
                return [new class extends Expression.ColumnLookup.ClickedReference
                {
                    public getExpression(): Expression
                    {
                        return IdentExpression.column(this.getColumnId());
                    }
                }(tableId, columnId)];
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                if (e instanceof InternalException)
                    Log.log(e);
                return [];
            }
        }
        // For everything else fall back to usual:
        return this.getAvailableColumnReferences().filter(c => tableId.equals(c.getFirst()) && columnId.equals(c.getSecond())).map(c => new class extends Expression.ColumnLookup.ClickedReference
        {
            public getExpression(): Expression
            {
                return IdentExpression.column(c.getFirst(), c.getSecond());
            }
        }(tableId, columnId));
    }

    public getAvailableTableReferences(): TableId[]
    {
        return this.tableManager.getAllTablesAvailableTo(this.us, false).map(t => t.getId());
    }

    public getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
    {
        const all = this.tableManager.getAllTablesAvailableTo(this.us, false).flatMap((t: Table): Pair<TableId | null, ColumnId>[] =>
        {
            try
            {
                const isUsOrSrc = javaEquals(this.us, t.getId()) || (this.srcTable !== null && javaEquals(t.getId(), this.srcTable.getId()));
                return t.getData().getColumns().map(c => new Pair<TableId | null, ColumnId>(isUsOrSrc ? null : t.getId(), c.getName()));
            }
            catch (e)
            {
                if (e instanceof UserException)
                    return [];
                if (e instanceof InternalException)
                {
                    Log.log(e);
                    return [];
                }
                throw e;
            }
        });
        // Stream.distinct():
        return [...new HashSet(all)];
    }

    public getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
    {
        if (tableName === null && this.srcTable !== null)
            tableName = this.srcTable.getId();
        const available = this.tableManager.getAllTablesAvailableTo(this.us, false);
        const tableNameFinal = tableName;
        const t = available.find(table => table.getId().equals(tableNameFinal)) ?? null;
        if (t === null)
            return null;

        return new FoundTableActual(t);
    }

    public getColumn(expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
    {
        try
        {
            let rs: Pair<TableId, RecordSet> | null = null;
            if (tableId === null)
            {
                if (this.srcTable !== null)
                    rs = new Pair(this.srcTable.getId(), this.srcTable.getData());
            }
            else
            {
                const table = this.tableManager.getSingleTableOrNull(tableId);
                if (table !== null)
                    rs = new Pair(table.getId(), table.getData());
            }

            if (rs !== null)
            {
                const column = rs.getSecond().getColumnOrNull(columnId);
                if (column === null)
                    return null;
                const columnType = column.getType();
                return new Expression.ColumnLookup.FoundColumn(rs.getFirst(), this.srcTable !== null && this.srcTable.getId().equals(rs.getFirst()), columnType, this.checkRedefined(expression, tableId, columnId));
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

    // If column is redefined in this table, issue a warning
    private checkRedefined(expression: Expression, tableId: TableId | null, columnId: ColumnId): Pair<StyledString, QuickFix<Expression> | null> | null
    {
        if (tableId === null && this.us !== null)
        {
            try
            {
                const ourTable = this.tableManager.getSingleTableOrNull(this.us);
                if (ourTable === null)
                    return null;
                const rs = ourTable.getData();
                const c = rs.getColumnOrNull(columnId);
                if (c !== null && this.editing !== null && !javaEquals(columnId, this.editing.getCurrentlyEditingColumn()) && c.getAlteredState() === Column.AlteredState.OVERWRITTEN
                )
                {
                    return new Pair<StyledString, QuickFix<Expression> | null>(StyledString.concat(StyledString.s("Note: column "), StyledString.styled(c.getName().getRaw(), new StyledCSS("column-reference")), StyledString.s(" is re-calculated in this table, but this reference will use the value from the source table.")), this.getFixForIdent("column", [columnId.getRaw()], expression));
                }
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                if (e instanceof InternalException)
                    Log.log(e);
            }
        }
        return null;
    }
}

export namespace MultipleTableLookup
{
    export interface CalculationEditor
    {
        getCurrentlyEditingColumn(): ColumnId;

        // Gives back an action which will make a new Calculate depending on the current Calculate,
        // with the currently editing expression moved there.
        moveExpressionToNewCalculation(): SimulationConsumer<Pair<ColumnId | null, Expression>>;
    }
}
