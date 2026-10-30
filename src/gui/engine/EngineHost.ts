// The engine's side of the GUI–engine messages (protocol.ts): owns the TableManager, answers the
// GUI's requests and sends it events.  Runs in the engine worker (engineWorker.ts), or in the page
// for GUI tests (InPageTransport), where tests can also read the engine's objects through it.
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import type { Column } from "../../engine/data/data/Column.js";
import { DataSource } from "../../engine/data/data/DataSources.js";
import { Table } from "../../engine/data/data/Table.js";
import { TableManager } from "../../engine/data/data/TableManager.js";
import { TransformationManager } from "../../engine/transformations/transformations/TransformationManager.js";
import { ClipboardUtils } from "../../engine/importers/importers/ClipboardUtils.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../engine/utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Log } from "../../engine/utility/log/Log.js";
import { ParseProgress } from "../../engine/utility/utility/ParseProgress.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { TableDisplayUtility } from "../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { Workers } from "../../engine/utility/utility/Workers.js";
import type { Value } from "../../engine/utility/utility/Value.js";
import { Transformation } from "../../engine/data/data/Transformation.js";
import { ENGINE_METHODS, type CellContent, type EditResult, type EngineAlert, type EngineApi, type EngineError, type EngineEvent, type FromEngine, type TableInfo, type ToEngine } from "./protocol.js";

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

    public copy(id: string, version: number, firstColumn: number, lastColumnIncl: number, rows: { readonly firstRow: number, readonly lastRowIncl: number } | null): Promise<Readonly<Record<string, string>> | null>
    {
        const table = this.current(id, version);
        if (table === null)
            return Promise.resolve(null);
        const columns = table.getData().getColumns().slice(firstColumn, lastColumnIncl + 1).map(c => new Pair(c.getName(), c.getType()));
        return new Promise(resolve =>
        {
            ClipboardUtils.copyValuesToClipboard(this.tableManager.getUnitManager(), this.tableManager.getTypeManager(), columns,
                () => rows === null ? new ClipboardUtils.RowRange(0, table.getData().getLength() - 1) : new ClipboardUtils.RowRange(rows.firstRow, rows.lastRowIncl),
                content => resolve(Object.fromEntries(content)),
                copied => { if (!copied) resolve(null); });
        });
    }

    public setPosition(id: string, column: number, row: number): void
    {
        const t = this.tables.get(id);
        if (t === undefined)
            return;
        this.positions.set(t.table, new CellPosition(CellPosition.row(row), CellPosition.col(column)));
        this.tablesChanged();
    }

    public canEdit(id: string, version: number, column: number, row: number): boolean
    {
        const c = this.current(id, version)?.getData().getColumns()[column];
        if (c === undefined)
            return false;
        try
        {
            const status = c.getEditableStatus();
            return status.editable && (status.checkEditable === null || status.checkEditable(row));
        }
        catch (e)
        {
            // (Java: an InternalException is logged and the edit goes ahead)
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return true;
        }
    }

    public edit(id: string, version: number, column: number, row: number, text: string): EditResult
    {
        const table = this.current(id, version);
        const c = table?.getData().getColumns()[column];
        if (table === null || c === undefined)
            return { kind: "stale" };
        // Java: RecogniserDocument.recognise(true): the value, or the text if it isn't one
        let value: Either<string, Value>;
        try
        {
            const recognised = TableDisplayUtility.recogniser(c.getType().getType(), true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
            value = recognised.either<Either<string, Value>>(() => Either.left(text), success => Either.right(success.value));
        }
        catch (e)
        {
            return { kind: "saved", cell: cellContent(c, column, row), alert: alertFor("error.storing.data", e) };
        }
        let alert = this.store(() => c.getType().setCollapsed(row, value));
        alert ??= this.reRun(table);
        return { kind: "saved", cell: cellContent(c, column, row), alert };
    }

    public deleteCells(id: string, version: number, firstColumn: number, lastColumnIncl: number, firstRow: number, lastRowIncl: number): { readonly cells: readonly (readonly CellContent[])[], readonly alert: EngineAlert | null } | null
    {
        const table = this.current(id, version);
        if (table === null)
            return null;
        const columns = table.getData().getColumns().slice(firstColumn, lastColumnIncl + 1);
        let alert: EngineAlert | null = null;
        for (const c of columns)
        {
            // (Java: the cells' documents; a read-only one ignores it)
            if (!c.getEditableStatus().editable)
                continue;
            const defaultValue = c.getDefaultValue();
            if (defaultValue === null)
                continue;
            for (let row = firstRow; row <= lastRowIncl; row++)
                alert ??= this.store(() => c.getType().setCollapsed(row, Either.right(defaultValue)));
        }
        alert ??= this.reRun(table);
        const cells: CellContent[][] = [];
        for (let row = firstRow; row <= lastRowIncl; row++)
            cells.push(columns.map((c, i) => cellContent(c, firstColumn + i, row)));
        return { cells, alert };
    }

    // Java: the Saver's FXUtility.alertOnError_ (a SilentCancelEditException just leaves the old value)
    private store(set: () => void): EngineAlert | null
    {
        try
        {
            set();
            return null;
        }
        catch (e)
        {
            if (e instanceof Transformation.SilentCancelEditException)
                return null;
            return alertFor("error.storing.data", e);
        }
    }

    // Java: TableDisplay's onModify, which re-runs the tables that depend on the table.
    // PORT-DEFERRED: it also marked the file as modified, for saving (Phase 9)
    private reRun(table: Table): EngineAlert | null
    {
        try
        {
            this.tableManager.reRun(table);
            return null;
        }
        catch (e)
        {
            return alertFor("error.updating.dependent.transformations", e);
        }
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
            // PORT-DEFERRED: offering a Manual Edit when a transformation's cell is edited (Phase 9, with
            // TableDisplay); the edit is cancelled meanwhile, as in Java
            promptForTransformationEdit: () => {},
            getTable: () => table,
        });
        this.tablesChanged();
    }

    private position(table: Table): CellPosition
    {
        // (Until the GUI places it; GridArea's position starts at the origin)
        return this.positions.get(table) ?? CellPosition.ORIGIN;
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
        let columnEditable: boolean[] = [];
        let columnNumber: boolean[] = [];
        let columnStyles: (readonly string[])[] = [];
        let error: string | null = null;
        try
        {
            const columns = table.getData().getColumns();
            columnNames = columns.map(c => c.getName().getRaw());
            columnTypes = columns.map(c => typeText(c));
            columnEditable = columns.map(c => c.getEditableStatus().editable);
            columnNumber = columns.map(c => isNumberType(c.getType().getType()));
            columnStyles = columns.map(c => TableDisplayUtility.stfStylesFor(c.getType().getType()));
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
            columnEditable,
            columnNumber,
            columnStyles,
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
                cells.push(columns.map((c, i) => cellContent(c, i, row)));
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
// Java: TableDisplayUtility.valueAndComponent gives number columns a NumberColumnFormatter
function isNumberType(type: DataType): boolean
{
    return type.apply<boolean>({
        number: () => true,
        text: () => false,
        date: () => false,
        bool: () => false,
        tagged: () => false,
        record: () => false,
        array: () => false,
    });
}

/** Java: EditorKitCache.ValueLoader.run, and the error position the cell's RecogniserDocument finds. */
function cellContent(column: Column, _columnIndex: number, row: number): CellContent
{
    try
    {
        return { kind: "value", text: DataTypeUtility.valueToString(column.getType().getCollapsed(row)) };
    }
    catch (e)
    {
        if (e instanceof InvalidImmediateValueException)
            return { kind: "invalid", text: e.getInvalid(), errorPosition: errorPosition(column, e.getInvalid()) };
        if (e instanceof InternalException)
            Log.log(e);
        if (e instanceof UserException || e instanceof InternalException)
        {
            const msg = e.getLocalizedMessage();
            return { kind: "error", text: msg === null ? TranslationUtility.getString("loading.error.nodetail") : TranslationUtility.getString("loading.error.detail", msg) };
        }
        throw e;
    }
}

// Where the column's recogniser finds an error in the text (Java: RecogniserDocument.recognise):
function errorPosition(column: Column, text: string): number | null
{
    try
    {
        const result = TableDisplayUtility.recogniser(column.getType().getType(), true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
        return result.either(err => err.errorPosition, () => null);
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        return null;
    }
}

// Java: FXUtility.alertOnError_, which shows UserExceptions and InternalExceptions
function alertFor(titleKey: "error.storing.data" | "error.updating.dependent.transformations", e: unknown): EngineAlert
{
    if (!(e instanceof UserException || e instanceof InternalException))
        throw e;
    if (e instanceof InternalException)
        Log.log(e);
    return { title: TranslationUtility.getString(titleKey), message: e.getLocalizedMessage() ?? "Unknown error" };
}

function toEngineError(e: unknown): EngineError
{
    if (e instanceof Error)
        return { name: e.name, message: e.message, stack: e.stack ?? null };
    return { name: "Error", message: String(e), stack: null };
}
