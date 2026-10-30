// A table on the grid, on the main thread (Java: DataDisplay, with HeadedDisplay's table name row; the
// table itself is in the engine worker).  Its rows are the table name, the column names, the column
// types, then the data.  It learns the table's shape from the worker's "tables" event (TableInfo), asks
// for its length, and asks for its rows in blocks as they come into view, keeping the blocks it has.
import type { GridAreaRowIndex } from "../../engine/anns/Annotations.js";
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import type { CellSelection } from "../../gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../gui-logic/stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { RectangularTableCellSelection } from "../../gui-logic/stf/gui/grid/RectangularTableCellSelection.js";
import { EntireTableSelection } from "../../gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { type EngineClient, ignoreClosed } from "../engine/EngineClient.js";
import type { CellContent, TableInfo } from "../engine/protocol.js";
import { writeClipboard } from "../clipboard.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { showAlert } from "./alerts.js";
import type { CellDisplay } from "./cellDisplay.js";
import { VersionCounter } from "../store/EngineStore.js";

export class GridTableDisplay extends GridArea implements EntireTableSelection.Selected
{
    // The table name, column name and column type rows (Java: getHeaderRowCount, with all three)
    public static readonly HEADER_ROWS = 3;
    // Rows are fetched, and added to and removed from the page, in blocks of this many:
    public static readonly ROW_BLOCK = 16;
    // How many blocks of rows are kept (the least recently used go first):
    private static readonly MAX_BLOCKS = 256;

    private infoValue: TableInfo;
    private readonly client: EngineClient;
    public currentKnownRows = 0;
    private lengthRequested = false;
    // Bumped when the table's cells arrive or change:
    public readonly dataVersion = new VersionCounter();
    // Bumped when the table's size or columns change:
    public readonly sizeVersion = new VersionCounter();
    // Blocks of rows (by block index), received, and requested but not received; a Map keeps its
    // insertion order, which is the order of use here:
    private readonly blocks = new Map<number, readonly (readonly CellContent[])[]>();
    private readonly requested = new Set<number>();
    // How many times each block has been requested (for tests):
    public readonly _test_fetches = new Map<number, number>();
    // The data rows on the page (Java: the cells that exist), and how a data cell on the page is shown
    // (by row, column), which GridTable sets:
    private pageRows = { first: 0, lastExcl: 0 };
    private cellDisplays: (row: number, column: number) => CellDisplay | null = () => null;

    private readonly dataSelectionLimits: RectangularTableCellSelection.TableSelectionLimits = {
        getTopLeftIncl: () => this.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS, 0),
        getBottomRightIncl: () => this.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + Math.max(0, this.currentKnownRows - 1), Math.max(0, this.info.columnNames.length - 1)),
        doCopy: (topLeftIncl, bottomRightIncl) => this.doCopy(new RectangleBounds(topLeftIncl, bottomRightIncl)),
        doDelete: (topLeftIncl, bottomRightIncl) => this.deleteCells(new RectangleBounds(topLeftIncl, bottomRightIncl)),
        gotoRow: () => {},
    };

    public constructor(info: TableInfo, client: EngineClient)
    {
        super();
        this.infoValue = info;
        this.client = client;
        this.setPosition(new CellPosition(CellPosition.row(info.row), CellPosition.col(info.column)));
    }

    public get info(): TableInfo
    {
        return this.infoValue;
    }

    /** A newer TableInfo for this table (the same id): a re-run table starts again. */
    public update(info: TableInfo): void
    {
        const old = this.infoValue;
        this.infoValue = info;
        if (info.version !== old.version)
        {
            this.blocks.clear();
            this.requested.clear();
            this.lengthRequested = false;
            this.currentKnownRows = 0;
            this.dataVersion.bump();
        }
        this.sizeVersion.bump();
        if (info.row !== old.row || info.column !== old.column)
            this.setPosition(new CellPosition(CellPosition.row(info.row), CellPosition.col(info.column)));
        else
            this.updateParent();
    }

    /** Also tells the engine, if it is a move there (from the grid: dragging, or keeping tables apart). */
    public override setPosition(cellPosition: CellPosition): void
    {
        super.setPosition(cellPosition);
        // (The constructor's call is before the client is set, and is where the engine has it)
        if (this.client !== undefined && (cellPosition.rowIndex !== this.info.row || cellPosition.columnIndex !== this.info.column))
            void this.client.request("setPosition", this.info.id, cellPosition.columnIndex, cellPosition.rowIndex).catch(ignoreClosed);
    }

    protected override updateKnownRows(_checkUpToRowInclGrid: GridAreaRowIndex, updateSizeAndPositions: () => void): void
    {
        if (this.lengthRequested || this.info.error !== null)
            return;
        this.lengthRequested = true;
        const info = this.info;
        void this.client.request("length", info.id, info.version).then(length =>
        {
            if (length === null || this.info !== info)
                return;
            this.currentKnownRows = length;
            this.sizeVersion.bump();
            updateSizeAndPositions();
        }).catch(ignoreClosed);
    }

    protected override recalculateBottomRightIncl(): CellPosition
    {
        const columns = this.info.columnNames.length;
        return this.getPosition().offsetByRowCols(Math.max(0, this.currentKnownRows + (columns === 0 ? 0 : GridTableDisplay.HEADER_ROWS) - 1), Math.max(0, columns - 1));
    }

    public override getSortKey(): string
    {
        return this.info.id;
    }

    /** A data cell, or null if it hasn't arrived. */
    public getCell(row: number, column: number): CellContent | null
    {
        const block = this.blocks.get(Math.floor(row / GridTableDisplay.ROW_BLOCK));
        return block?.[row % GridTableDisplay.ROW_BLOCK]?.[column] ?? null;
    }

    /**
     * Asks for the blocks of rows from firstRow to lastRowExcl that aren't here or on their way, a
     * request for each run of them (the worker skips all but the newest few requests for a table).
     */
    public ensureRows(firstRow: number, lastRowExcl: number): void
    {
        const BLOCK = GridTableDisplay.ROW_BLOCK;
        const lastBlockExcl = Math.ceil(Math.min(lastRowExcl, this.currentKnownRows) / BLOCK);
        let runStart: number | null = null;
        for (let b = Math.floor(firstRow / BLOCK); b <= lastBlockExcl; b++)
        {
            const missing = b < lastBlockExcl && !this.blocks.has(b) && !this.requested.has(b);
            const block = this.blocks.get(b);
            if (block !== undefined)
            {
                // (Most recently used)
                this.blocks.delete(b);
                this.blocks.set(b, block);
            }
            if (missing && runStart === null)
                runStart = b;
            else if (!missing && runStart !== null)
            {
                this.requestBlocks(runStart, b);
                runStart = null;
            }
        }
    }

    private requestBlocks(firstBlock: number, lastBlockExcl: number): void
    {
        const BLOCK = GridTableDisplay.ROW_BLOCK;
        for (let b = firstBlock; b < lastBlockExcl; b++)
        {
            this.requested.add(b);
            this._test_fetches.set(b, (this._test_fetches.get(b) ?? 0) + 1);
        }
        const info = this.info;
        void this.client.request("rows", info.id, info.version, firstBlock * BLOCK, Math.min(lastBlockExcl * BLOCK, this.currentKnownRows)).then(cells =>
        {
            if (this.info.version !== info.version)
                return;
            for (let b = firstBlock; b < lastBlockExcl; b++)
            {
                this.requested.delete(b);
                // (null: the worker skipped it, for newer requests; it is asked for again if still in view)
                if (cells !== null)
                    this.blocks.set(b, cells.slice((b - firstBlock) * BLOCK, (b - firstBlock + 1) * BLOCK));
            }
            while (this.blocks.size > GridTableDisplay.MAX_BLOCKS)
                this.blocks.delete(this.blocks.keys().next().value!);
            this.dataVersion.bump();
        }).catch(ignoreClosed);
    }

    public override getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null
    {
        if (!this.contains(cellPosition))
            return null;
        const us = this.getPosition();
        if (cellPosition.rowIndex === us.rowIndex)
        {
            return new EntireTableSelection(this, cellPosition.columnIndex);
        }
        else if (cellPosition.rowIndex >= us.rowIndex + GridTableDisplay.HEADER_ROWS && cellPosition.rowIndex < us.rowIndex + this.currentKnownRows + GridTableDisplay.HEADER_ROWS
            && cellPosition.columnIndex < us.columnIndex + this.info.columnNames.length)
        {
            return new RectangularTableCellSelection(cellPosition.rowIndex, cellPosition.columnIndex, this.dataSelectionLimits);
        }
        return new SingleCellSelection(cellPosition);
    }

    /**
     * Copies the cells within the bounds (a region of the grid, which may extend beyond the table's data)
     * to the clipboard, or all the table's data for null (Java: TableDisplay.doCopy).
     */
    public doCopy(bounds: RectangleBounds | null): void
    {
        const pos = this.getPosition();
        const columns = this.info.columnNames.length;
        const firstColumn = bounds === null ? 0 : Math.max(0, bounds.topLeftIncl.columnIndex - pos.columnIndex);
        if (firstColumn >= columns)
            return; // No valid data to copy
        const lastColumnIncl = bounds === null ? columns - 1 : Math.min(columns - 1, bounds.bottomRightIncl.columnIndex - pos.columnIndex);
        if (lastColumnIncl < firstColumn)
            return; // No valid data range to copy
        const dataTop = pos.rowIndex + GridTableDisplay.HEADER_ROWS;
        const rows = bounds === null ? null : {
            firstRow: Math.max(0, bounds.topLeftIncl.rowIndex - dataTop),
            lastRowIncl: Math.min(this.getBottomRightIncl().rowIndex, bounds.bottomRightIncl.rowIndex) - dataTop,
        };
        const info = this.info;
        void this.client.request("copy", info.id, info.version, firstColumn, lastColumnIncl, rows)
            .then(content => content === null ? undefined : writeClipboard(content))
            .catch(ignoreClosed);
    }

    /** From GridTable: the data rows on the page, and how the data cells on it are shown. */
    public setPage(first: number, lastExcl: number, cellDisplays: (row: number, column: number) => CellDisplay | null): void
    {
        this.pageRows = { first, lastExcl };
        this.cellDisplays = cellDisplays;
    }

    /** How a data cell on the page is shown, or null if it isn't there. */
    public cellDisplayOnPage(row: number, column: number): CellDisplay | null
    {
        return this.cellDisplays(row, column);
    }

    /** Java: the selection of a data cell (row and column on the grid) after editing it. */
    public selectionForCell(cellPosition: CellPosition): CellSelection
    {
        return new RectangularTableCellSelection(cellPosition.rowIndex, cellPosition.columnIndex, this.dataSelectionLimits);
    }

    /** Whether the data cell's row can be edited (Java: RecogniserDocument's checkEditable). */
    public async canEdit(row: number, column: number): Promise<boolean>
    {
        return this.client.request("canEdit", this.info.id, this.info.version, column, row);
    }

    /**
     * Stores text typed into a data cell (version: the table's version when the edit began).  The
     * cell then shows what the engine stored; an edit of a table replaced since is refused.
     */
    public edit(version: number, row: number, column: number, text: string): void
    {
        void this.client.request("edit", this.info.id, version, column, row, text).then(result =>
        {
            if (result.kind === "stale")
            {
                // (Not in Java, where tables were changed on the one thread)
                showAlert({ title: TranslationUtility.getString("error.storing.data"), message: "The table changed while the value was being edited, so the value was not stored." });
                return;
            }
            this.setCells(version, row, column, [[result.cell]]);
            if (result.alert !== null)
                showAlert(result.alert);
        }).catch(ignoreClosed);
    }

    /**
     * Sets the data cells within the bounds (a region of the grid) to their columns' defaults (Java:
     * DataDisplay.doDelete).  Java only did so for the cells that existed, those on screen; so this
     * does it for the rows on the page.
     */
    private deleteCells(bounds: RectangleBounds): void
    {
        const pos = this.getPosition();
        const dataTop = pos.rowIndex + GridTableDisplay.HEADER_ROWS;
        const firstColumn = bounds.topLeftIncl.columnIndex - pos.columnIndex;
        const lastColumnIncl = bounds.bottomRightIncl.columnIndex - pos.columnIndex;
        const firstRow = Math.max(this.pageRows.first, bounds.topLeftIncl.rowIndex - dataTop);
        const lastRowIncl = Math.min(this.pageRows.lastExcl - 1, bounds.bottomRightIncl.rowIndex - dataTop);
        if (firstRow > lastRowIncl || firstColumn > lastColumnIncl)
            return;
        const version = this.info.version;
        void this.client.request("deleteCells", this.info.id, version, firstColumn, lastColumnIncl, firstRow, lastRowIncl).then(result =>
        {
            if (result === null)
                return;
            this.setCells(version, firstRow, firstColumn, result.cells);
            if (result.alert !== null)
                showAlert(result.alert);
        }).catch(ignoreClosed);
    }

    // Replaces cells that are here (from row and column on) with new content from the engine:
    private setCells(version: number, firstRow: number, firstColumn: number, cells: readonly (readonly CellContent[])[]): void
    {
        if (version !== this.info.version)
            return;
        const BLOCK = GridTableDisplay.ROW_BLOCK;
        cells.forEach((rowCells, i) =>
        {
            const row = firstRow + i;
            const block = this.blocks.get(Math.floor(row / BLOCK));
            const old = block?.[row % BLOCK];
            if (block === undefined || old === undefined)
                return;
            const updated = [...old];
            updated.splice(firstColumn, rowCells.length, ...rowCells);
            this.blocks.set(Math.floor(row / BLOCK), block.map((r, j) => j === row % BLOCK ? updated : r));
        });
        this.dataVersion.bump();
    }

    // Java: HeadedDisplay's other operations on the entire table.  PORT-DEFERRED: deleting the table,
    // going to a row and flashing the header (Phase 9, with TableDisplay).

    public doDelete(): void
    {
    }

    public gotoRow(_parent: unknown, _column: number): void
    {
    }

    public flashHeader(): void
    {
    }

    /** The data row shown at the given row of the grid, or null if it is not a data row. */
    public dataRowAt(absRow: number): number | null
    {
        const row = absRow - this.getPosition().rowIndex - GridTableDisplay.HEADER_ROWS;
        return row >= 0 && row < this.currentKnownRows ? row : null;
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
    public toString(): string { return "SingleCellSelection[" + this.pos.toString() + "]"; }
}
