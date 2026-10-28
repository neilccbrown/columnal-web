// Grid prototype (Phase 7, throwaway): a table on the grid, standing in for Java's TableDisplay
// (DataDisplay and HeadedDisplay).  It is a GridArea, so the ported VirtualGrid keeps tables apart and
// moves the selection between them, as in Java.  The rows are the table name, the column names, the
// column types, then the data.
import type { GridAreaRowIndex } from "../../../engine/anns/Annotations.js";
import { CellPosition } from "../../../engine/data/data/CellPosition.js";
import type { Column } from "../../../engine/data/data/Column.js";
import { DataSource } from "../../../engine/data/data/DataSources.js";
import type { RecordSet } from "../../../engine/data/data/RecordSet.js";
import type { Table } from "../../../engine/data/data/Table.js";
import type { ColumnId } from "../../../engine/identifiers/id/ColumnId.js";
import type { DataType } from "../../../engine/types/data/datatype/DataType.js";
import type { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../engine/utility/utility/Value.js";
import { Workers } from "../../../engine/utility/utility/Workers.js";
import { Platform } from "../../../engine/java/Platform.js";
import { TableAreaBase } from "./TableAreaBase.js";
import { type CellContent, fetchCell } from "./cellContent.js";
import type { GridTableModel } from "./GridTableModel.js";
import { ParseProgress } from "../../../engine/utility/utility/ParseProgress.js";
import { TableDisplayUtility } from "../../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";


export class ProtoTableDisplay extends TableAreaBase implements Table.TableDisplayBase, GridTableModel
{
    public readonly tableName: string;
    public readonly columnNames: readonly string[];
    public readonly columnTypes: readonly string[];
    public readonly table: Table;
    public readonly recordSet: RecordSet | null;
    public readonly columns: readonly Column[];
    public readonly error: string | null;
    public readonly editable: boolean;
    private currentKnownRowsIsFinal = false;
    private queuedUpdateRows = false;
    // Values fetched so far (Java: EditorKitCache), keyed by row * column count + column:
    private readonly cache = new Map<number, CellContent>();

    public constructor(table: Table)
    {
        super();
        this.table = table;
        this.editable = table instanceof DataSource;
        let recordSet: RecordSet | null = null;
        let error: string | null = null;
        try
        {
            recordSet = table.getData();
        }
        catch (e)
        {
            error = e instanceof Error ? e.message : String(e);
        }
        this.recordSet = recordSet;
        this.error = error;
        let columns: readonly Column[] = [];
        try
        {
            columns = recordSet?.getColumns() ?? [];
        }
        catch (e)
        {
            this.error ??= e instanceof Error ? e.message : String(e);
        }
        this.columns = columns;
        this.tableName = table.getId().getRaw();
        this.columnNames = columns.map(c => c.getName().getRaw());
        this.columnTypes = columns.map(c =>
        {
            try
            {
                return c.getType().getType().toString();
            }
            catch (e)
            {
                return e instanceof Error ? e.message : String(e);
            }
        });
        table.setDisplay(this);
        recordSet?.setListener({
            modifiedDataItems: () => { this.cache.clear(); this.dataVersion.bump(); },
            removedAddedRows: (startRowIncl, removed, added) =>
            {
                if (startRowIncl < this.currentKnownRows)
                    this.currentKnownRows += added - removed;
                this.currentKnownRowsIsFinal = false;
                this.cache.clear();
                this.updateParent();
                this.dataVersion.bump();
            },
            addedColumn: () => {},
            removedColumn: () => {},
        });
    }

    protected override updateKnownRows(checkUpToRowInclGrid: GridAreaRowIndex, updateSizeAndPositions: () => void): void
    {
        const checkUpToRowIncl = checkUpToRowInclGrid - TableAreaBase.HEADER_ROWS;
        const recordSet = this.recordSet;
        if (!this.currentKnownRowsIsFinal && this.currentKnownRows < checkUpToRowIncl && recordSet !== null && !this.queuedUpdateRows)
        {
            this.queuedUpdateRows = true;
            // As Java's TableDisplay: fetch the length on the worker queue, then update.
            Workers.onWorkerThread("Fetching row size", Workers.Priority.FETCH, () =>
            {
                const start = performance.now();
                let length: number;
                try
                {
                    length = recordSet.getLength();
                }
                catch (e)
                {
                    console.error(e);
                    return;
                }
                timings.push({ what: "length of " + this.table.getId().getRaw(), ms: performance.now() - start });
                Platform.runLater(() =>
                {
                    this.queuedUpdateRows = false;
                    this.currentKnownRows = length;
                    this.currentKnownRowsIsFinal = true;
                    this.sizeVersion.bump();
                    updateSizeAndPositions();
                });
            });
        }
    }

    // Table.TableDisplayBase:
    public loadPosition(position: CellPosition): void
    {
        this.setPosition(position);
    }

    public getMostRecentPosition(): CellPosition
    {
        return this.getPosition();
    }

    public promptForTransformationEdit(_index: number, _column: Pair<ColumnId, DataType>, _value: Either<string, Value>): void
    {
    }

    public getTable(): Table
    {
        return this.table;
    }

    public override getSortKey(): string
    {
        return this.table.getId().getRaw();
    }

    public getCell(row: number, col: number): CellContent
    {
        const key = row * this.columns.length + col;
        let content = this.cache.get(key);
        if (content === undefined)
        {
            const start = performance.now();
            content = fetchCell(this.columns[col]!, row);
            fetchTime.ms += performance.now() - start;
            fetchTime.cells++;
            this.cache.set(key, content);
        }
        return content;
    }

    public commitEdit(row: number, col: number, text: string): Promise<string | null>
    {
        const start = performance.now();
        const recogniser = TableDisplayUtility.recogniser(this.columns[col]!.getType().getType(), true).recogniser;
        const result = recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
        if (result.isLeft())
            return Promise.resolve(result.getLeft("error").error.toPlain());
        this.storeValue(row, col, result.getRight("value").value);
        timings.push({ what: "store edited value", ms: performance.now() - start });
        // Java: TableDisplay's onModify re-runs the dependent tables on the worker queue:
        Workers.onWorkerThread("Updating dependents", Workers.Priority.FETCH, () =>
        {
            const reRunStart = performance.now();
            this.table.getManager().reRun(this.table);
            timings.push({ what: "reRun after edit", ms: performance.now() - reRunStart });
        });
        return Promise.resolve(null);
    }

    /** Stores an edited value, then re-runs the dependent tables (Java: TableDisplay's onModify). */
    public storeValue(row: number, col: number, value: Value): void
    {
        const column = this.columns[col]!;
        column.getType().setCollapsed(row, Either.right(value));
        this.recordSet?.modified(column.getName(), row);
    }
}

export const timings: { what: string, ms: number }[] = [];
// The total time spent fetching values from the engine, for the measurements:
export const fetchTime = { ms: 0, cells: 0 };
