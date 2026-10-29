// The messages between the GUI and the engine (PLAN.md §6: the engine runs in a Web Worker, which
// owns the TableManager).  The GUI makes requests (EngineApi's methods), each answered by one reply,
// and the engine sends events when things change.  Everything sent must survive structuredClone:
// plain data only, never engine objects.

/** A table, as the GUI sees it. */
export interface TableInfo
{
    readonly id: string;
    // Increases each time the table is replaced (when it, or a table it depends on, is re-run).
    // Requests about a table name the version they are about, and get no answer for an old one.
    readonly version: number;
    readonly kind: "data" | "transformation";
    // Top-left position on the grid:
    readonly column: number;
    readonly row: number;
    readonly columnNames: readonly string[];
    readonly columnTypes: readonly string[];
    // The error if the table's columns can't be found (e.g. a transformation that failed):
    readonly error: string | null;
}

/** A cell's content, as shown. */
export interface CellContent
{
    readonly text: string;
    readonly kind: "number" | "text" | "other" | "error";
}

/** What the GUI can ask the engine.  Each method is answered by one reply. */
export interface EngineApi
{
    /** Loads a saved file, replacing nothing (as Java's loadAll).  Returns the errors, as plain text. */
    load(text: string): readonly string[];
    /** The saved file for everything loaded. */
    save(): string;
    /** The table's length, or null if the table has been replaced. */
    length(id: string, version: number): number | null;
    /**
     * The cells of rows firstRow (incl) to lastRowExcl, or null if the table has been replaced, or if the
     * engine skipped the request because newer ones for the same table were waiting (it only does the
     * newest few, so that scrolling quickly doesn't leave it computing rows no longer in view).
     */
    rows(id: string, version: number, firstRow: number, lastRowExcl: number): Promise<readonly (readonly CellContent[])[] | null>;
    /** Answers once the engine has no work waiting (after everything requested before it). */
    idle(): Promise<void>;
}

export type EngineMethod = keyof EngineApi;
// (The engine only answers these, whatever a message names)
export const ENGINE_METHODS: ReadonlySet<string> = new Set<EngineMethod>(["load", "save", "length", "rows", "idle"]);

export type EngineEvent =
    // The list of tables changed, or a table in it was replaced:
    | { readonly kind: "tables", readonly tables: readonly TableInfo[] };

export type ToEngine =
    { readonly kind: "request", readonly requestId: number, readonly method: EngineMethod, readonly args: readonly unknown[] };

export type FromEngine =
    | { readonly kind: "reply", readonly requestId: number, readonly ok: true, readonly value: unknown }
    | { readonly kind: "reply", readonly requestId: number, readonly ok: false, readonly error: EngineError }
    | { readonly kind: "event", readonly event: EngineEvent };

/** An exception thrown by the engine while answering a request. */
export interface EngineError
{
    readonly name: string;
    readonly message: string;
    readonly stack: string | null;
}
