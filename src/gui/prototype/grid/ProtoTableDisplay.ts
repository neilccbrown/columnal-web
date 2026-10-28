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
import { DataTypeUtility } from "../../../engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../engine/utility/utility/Value.js";
import { Workers } from "../../../engine/utility/utility/Workers.js";
import { Platform } from "../../../engine/java/Platform.js";
import type { CellSelection } from "../../../gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../../gui-logic/stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { RectangularTableCellSelection } from "../../../gui-logic/stf/gui/grid/RectangularTableCellSelection.js";
import { EntireTableSelection } from "../../../gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { VersionCounter } from "../../store/EngineStore.js";

export interface CellContent
{
    readonly text: string;
    readonly kind: "number" | "text" | "other" | "error";
}

export class ProtoTableDisplay extends GridArea implements Table.TableDisplayBase
{
    public static readonly HEADER_ROWS = 3;

    public readonly table: Table;
    public readonly recordSet: RecordSet | null;
    public readonly columns: readonly Column[];
    public readonly error: string | null;
    public readonly editable: boolean;
    public currentKnownRows = 0;
    private currentKnownRowsIsFinal = false;
    private queuedUpdateRows = false;
    // Bumped when the table's data changes (Java: the RecordSetListener):
    public readonly dataVersion = new VersionCounter();
    // Bumped when the table's size changes:
    public readonly sizeVersion = new VersionCounter();
    // Values fetched so far (Java: EditorKitCache), keyed by row * column count + column:
    private readonly cache = new Map<number, CellContent>();

    private readonly dataSelectionLimits: RectangularTableCellSelection.TableSelectionLimits;

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
        this.dataSelectionLimits = {
            getTopLeftIncl: () => this.getPosition().offsetByRowCols(ProtoTableDisplay.HEADER_ROWS, 0),
            getBottomRightIncl: () => this.getPosition().offsetByRowCols(ProtoTableDisplay.HEADER_ROWS + Math.max(0, this.currentKnownRows - 1), Math.max(0, this.columns.length - 1)),
            doCopy: () => {},
            doDelete: () => {},
            gotoRow: () => {},
        };
    }

    protected override updateKnownRows(checkUpToRowInclGrid: GridAreaRowIndex, updateSizeAndPositions: () => void): void
    {
        const checkUpToRowIncl = checkUpToRowInclGrid - ProtoTableDisplay.HEADER_ROWS;
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

    protected override recalculateBottomRightIncl(): CellPosition
    {
        return this.getPosition().offsetByRowCols(Math.max(0, this.currentKnownRows + (this.columns.length === 0 ? 0 : ProtoTableDisplay.HEADER_ROWS) - 1), Math.max(0, this.columns.length - 1));
    }

    public override getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null
    {
        if (!this.contains(cellPosition))
            return null;
        const us = this.getPosition();
        if (cellPosition.rowIndex === us.rowIndex)
        {
            return new EntireTableSelection({
                getPosition: () => this.getPosition(),
                getBottomRightIncl: () => this.getBottomRightIncl(),
                doCopy: () => {},
                doDelete: () => {},
                gotoRow: () => {},
                flashHeader: () => {},
            }, cellPosition.columnIndex);
        }
        else if (cellPosition.rowIndex >= us.rowIndex + ProtoTableDisplay.HEADER_ROWS && cellPosition.rowIndex < us.rowIndex + this.currentKnownRows + ProtoTableDisplay.HEADER_ROWS && cellPosition.columnIndex < us.columnIndex + this.columns.length)
        {
            return new RectangularTableCellSelection(cellPosition.rowIndex, cellPosition.columnIndex, this.dataSelectionLimits);
        }
        return new SingleCellSelection(cellPosition);
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

    /** The data row shown at the given row of the grid, or null if it is not a data row. */
    public dataRowAt(absRow: number): number | null
    {
        const row = absRow - this.getPosition().rowIndex - ProtoTableDisplay.HEADER_ROWS;
        return row >= 0 && row < this.currentKnownRows ? row : null;
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

function fetchCell(column: Column, row: number): CellContent
{
    try
    {
        const value = column.getType().getCollapsed(row);
        if (typeof value === "string")
            return { text: value, kind: "text" };
        const text = DataTypeUtility.valueToString(value);
        return { text, kind: /^-?[0-9]/.test(text) && !text.includes(" ") && !text.includes("-", 1) ? "number" : "other" };
    }
    catch (e)
    {
        return { text: e instanceof Error ? e.message : String(e), kind: "error" };
    }
}

// Java: DataDisplay.SingleCellSelection, for a column name or type
class SingleCellSelection implements CellSelection
{
    private readonly pos: CellPosition;

    public constructor(pos: CellPosition)
    {
        this.pos = pos;
    }

    public atHome(): CellSelection { return this; }
    public atEnd(): CellSelection { return this; }
    public move(extendSelection: boolean, byRows: number, byColumns: number): Either<CellPosition, CellSelection>
    {
        if (!extendSelection)
            return Either.left(this.pos.offsetByRowCols(byRows, byColumns));
        return Either.right(this);
    }
    public extendTo(): CellSelection | null { return null; }
    public positionToEnsureInView(): CellPosition { return this.pos; }
    public getSelectionDisplayRectangle(): RectangleBounds { return new RectangleBounds(this.pos, this.pos); }
    public isExactly(cellPosition: CellPosition): boolean { return this.pos.equals(cellPosition); }
    public includes(): boolean { return false; }
    public gotoRow(): void {}
    public doCopy(): void {}
    public doPaste(): void {}
    public doDelete(): void {}
    public getActivateTarget(): CellPosition { return this.pos; }
    public notifySelected(): void {}
}

