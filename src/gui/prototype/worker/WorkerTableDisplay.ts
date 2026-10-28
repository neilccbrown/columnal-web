// Worker spike (Phase 7, throwaway): a table on the grid whose data is in the engine worker.  It
// asks for its length once (as Java's TableDisplay did on its worker thread), and for blocks of rows
// as they come into view, showing them empty until they arrive (Java showed "Loading...").
import type { GridAreaRowIndex } from "../../../engine/anns/Annotations.js";
import type { CellContent } from "../grid/cellContent.js";
import type { GridTableModel } from "../grid/GridTableModel.js";
import { TableAreaBase } from "../grid/TableAreaBase.js";
import type { TableInfo } from "./messages.js";
import type { WorkerClient } from "./WorkerClient.js";

const BLOCK = 64;
const LOADING: CellContent = { text: "", kind: "loading" };

export class WorkerTableDisplay extends TableAreaBase implements GridTableModel
{
    public readonly info: TableInfo;
    public readonly tableName: string;
    public readonly columnNames: readonly string[];
    public readonly columnTypes: readonly string[];
    public readonly editable: boolean;
    public readonly error: string | null;
    private readonly client: WorkerClient;
    private lengthRequested = false;
    // Blocks of rows (by first row) received, and requested but not yet received:
    private readonly blocks = new Map<number, readonly (readonly CellContent[])[]>();
    private readonly requested = new Set<number>();

    public constructor(info: TableInfo, client: WorkerClient)
    {
        super();
        this.info = info;
        this.client = client;
        this.tableName = info.id;
        this.columnNames = info.columnNames;
        this.columnTypes = info.columnTypes;
        this.editable = info.editable;
        this.error = info.error;
    }

    protected override updateKnownRows(_checkUpToRowInclGrid: GridAreaRowIndex, updateSizeAndPositions: () => void): void
    {
        if (this.lengthRequested || this.error !== null)
            return;
        this.lengthRequested = true;
        this.client.requestLength(this.info, length =>
        {
            this.currentKnownRows = length;
            this.sizeVersion.bump();
            updateSizeAndPositions();
        });
    }

    public getCell(row: number, column: number): CellContent
    {
        const first = row - row % BLOCK;
        const block = this.blocks.get(first);
        if (block !== undefined)
            return block[row - first]?.[column] ?? LOADING;
        if (!this.requested.has(first))
        {
            this.requested.add(first);
            this.client.requestRows(this.info, first, Math.min(first + BLOCK, this.currentKnownRows));
        }
        return LOADING;
    }

    /** From the client: rows arrived (cells), or the worker skipped the request (null). */
    public received(firstRow: number, cells: readonly (readonly CellContent[])[] | null): void
    {
        this.requested.delete(firstRow);
        if (cells !== null)
            this.blocks.set(firstRow, cells);
        // (After a skipped request, rendering again asks again for any rows still in view)
        this.dataVersion.bump();
    }

    public commitEdit(row: number, column: number, text: string): Promise<string | null>
    {
        return this.client.edit(this.info, row, column, text);
    }

    public override getSortKey(): string
    {
        return this.tableName;
    }
}
