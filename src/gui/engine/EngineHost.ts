// The engine's side of the GUI–engine messages (protocol.ts): owns the TableManager, answers the
// GUI's requests and sends it events.  Runs in the engine worker (engineWorker.ts), or in the page
// for GUI tests (InPageTransport), where tests can also read the engine's objects through it.
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import type { Column } from "../../engine/data/data/Column.js";
import { DataSource } from "../../engine/data/data/DataSources.js";
import { Table } from "../../engine/data/data/Table.js";
import { TableManager } from "../../engine/data/data/TableManager.js";
import { TransformationManager } from "../../engine/transformations/transformations/TransformationManager.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import { Workers } from "../../engine/utility/utility/Workers.js";
import { ENGINE_METHODS, type CellContent, type EngineApi, type EngineError, type EngineEvent, type FromEngine, type TableInfo, type ToEngine } from "./protocol.js";

// How many rows requests are done for each table at once (newest first); older ones are skipped:
const MAX_ROWS_REQUESTS_PER_TABLE = 2;

interface RowsRequest
{
    readonly id: string;
    readonly version: number;
    readonly firstRow: number;
    readonly lastRowExcl: number;
    readonly resolve: (cells: readonly (readonly CellContent[])[] | null) => void;
}

export class EngineHost implements EngineApi
{
    public readonly tableManager: TableManager;
    private readonly post: (m: FromEngine) => void;
    // The current tables by id, with the version the GUI knows them by:
    private readonly tables = new Map<string, { readonly table: Table, readonly version: number }>();
    private nextVersion = 1;
    // Each table's position.  (Java: its TableDisplay, which the table asks for its position when
    // saving; a re-run table takes the position of the table it replaces.)
    private readonly positions = new Map<Table, CellPosition>();
    private tablesEventScheduled = false;
    private rowsQueue: RowsRequest[] = [];
    private rowsScheduled = false;

    public constructor(post: (m: FromEngine) => void)
    {
        this.post = post;
        this.tableManager = new TableManager(TransformationManager.getInstance(), { getHandledContent: () => new Map() });
        this.tableManager.addListener({
            removeTable: t =>
            {
                if (this.tables.get(t.getId().getRaw())?.table === t)
                    this.tables.delete(t.getId().getRaw());
                this.tablesChanged();
            },
            addSource: t => this.addTable(t),
            addTransformation: t => this.addTable(t),
            addComment: () => {},
            removeComment: () => {},
        });
    }

    /** A message from the GUI. */
    public receive(m: ToEngine): void
    {
        const reply = (value: unknown): void => this.post({ kind: "reply", requestId: m.requestId, ok: true, value });
        const fail = (e: unknown): void => this.post({ kind: "reply", requestId: m.requestId, ok: false, error: toEngineError(e) });
        try
        {
            if (!ENGINE_METHODS.has(m.method))
                throw new Error("Unknown engine request: " + m.method);
            const method = this[m.method] as (...args: readonly unknown[]) => unknown;
            const result = method.apply(this, [...m.args]);
            if (result instanceof Promise)
                result.then(reply, fail);
            else
                reply(result);
        }
        catch (e)
        {
            fail(e);
        }
    }

    public load(text: string): readonly string[]
    {
        const loaded = this.tableManager.loadAll(text, () => {});
        return loaded.errors.map(e => e.toPlain());
    }

    public save(): string
    {
        const saver = new Table.FullSaver(null);
        this.tableManager.save(null, saver);
        return saver.getCompleteFile();
    }

    public length(id: string, version: number): number | null
    {
        return this.current(id, version)?.getData().getLength() ?? null;
    }

    public rows(id: string, version: number, firstRow: number, lastRowExcl: number): Promise<readonly (readonly CellContent[])[] | null>
    {
        return new Promise(resolve =>
        {
            this.rowsQueue.push({ id, version, firstRow, lastRowExcl, resolve });
            if (!this.rowsScheduled)
            {
                this.rowsScheduled = true;
                setTimeout(() => this.runRowsRequests(), 0);
            }
        });
    }

    public idle(): Promise<void>
    {
        // The engine's work (Workers) runs in timer tasks, as do Platform.runLater callbacks and rows
        // requests, so wait until a timer task finds nothing waiting:
        return new Promise(resolve =>
        {
            const check = (): void =>
            {
                if (Workers.getTaskList().length === 0 && this.rowsQueue.length === 0 && !this.tablesEventScheduled)
                    resolve();
                else
                    setTimeout(check, 1);
            };
            setTimeout(check, 0);
        });
    }

    private addTable(table: Table): void
    {
        this.tables.set(table.getId().getRaw(), { table, version: this.nextVersion++ });
        table.setDisplay({
            loadPosition: position => { this.positions.set(table, position); },
            getMostRecentPosition: () => this.position(table),
            getBottomRightIncl: () => this.position(table),
            promptForTransformationEdit: () => {},
            getTable: () => table,
        });
        this.tablesChanged();
    }

    private position(table: Table): CellPosition
    {
        const position = this.positions.get(table);
        if (position === undefined)
            throw new Error("No position for table " + table.getId().getRaw());
        return position;
    }

    private current(id: string, version: number): Table | null
    {
        const t = this.tables.get(id);
        return t !== undefined && t.version === version ? t.table : null;
    }

    // Tables change several at a time (loading, re-running), so the event is sent once they're done:
    private tablesChanged(): void
    {
        if (this.tablesEventScheduled)
            return;
        this.tablesEventScheduled = true;
        setTimeout(() =>
        {
            this.tablesEventScheduled = false;
            const tables = [...this.tables.values()].map(t => this.tableInfo(t.table, t.version));
            this.sendEvent({ kind: "tables", tables });
        }, 0);
    }

    private sendEvent(event: EngineEvent): void
    {
        this.post({ kind: "event", event });
    }

    private tableInfo(table: Table, version: number): TableInfo
    {
        let columnNames: string[] = [];
        let columnTypes: string[] = [];
        let error: string | null = null;
        try
        {
            const columns = table.getData().getColumns();
            columnNames = columns.map(c => c.getName().getRaw());
            columnTypes = columns.map(c => typeText(c));
        }
        catch (e)
        {
            error = toEngineError(e).message;
        }
        const position = this.positions.get(table);
        return {
            id: table.getId().getRaw(),
            version,
            kind: table instanceof DataSource ? "data" : "transformation",
            column: position?.columnIndex ?? 0,
            row: position?.rowIndex ?? 0,
            columnNames,
            columnTypes,
            error,
        };
    }

    private runRowsRequests(): void
    {
        this.rowsScheduled = false;
        const queue = this.rowsQueue;
        this.rowsQueue = [];
        const counts = new Map<string, number>();
        // Newest first:
        for (let i = queue.length - 1; i >= 0; i--)
        {
            const r = queue[i]!;
            const n = counts.get(r.id) ?? 0;
            counts.set(r.id, n + 1);
            const table = this.current(r.id, r.version);
            if (table === null || n >= MAX_ROWS_REQUESTS_PER_TABLE)
            {
                r.resolve(null);
                continue;
            }
            const columns = table.getData().getColumns();
            const cells: CellContent[][] = [];
            for (let row = r.firstRow; row < r.lastRowExcl; row++)
                cells.push(columns.map(c => cellContent(c, row)));
            r.resolve(cells);
        }
    }
}

function typeText(column: Column): string
{
    try
    {
        return column.getType().getType().toString();
    }
    catch (e)
    {
        return toEngineError(e).message;
    }
}

// A stand-in for showing a cell, until Phase 8 brings Java's display rules (e.g. NumberColumnFormatter).
function cellContent(column: Column, row: number): CellContent
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
        return { text: toEngineError(e).message, kind: "error" };
    }
}

function toEngineError(e: unknown): EngineError
{
    if (e instanceof Error)
        return { name: e.name, message: e.message, stack: e.stack ?? null };
    return { name: "Error", message: String(e), stack: null };
}
