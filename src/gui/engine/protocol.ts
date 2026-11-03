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
    // Whether each column's cells can be edited (Java: Column.getEditableStatus().editable):
    readonly columnEditable: readonly boolean[];
    // Whether rows can be added at the end (Java: TableOperations.appendRows), and columns at the right
    // (Java: TableDisplay.addColumnOperation, for now only for data tables):
    readonly canAppendRows: boolean;
    readonly canAddColumn: boolean;
    // Whether each column holds numbers (which the GUI lays out with NumberColumnFormatter):
    readonly columnNumber: readonly boolean[];
    // Each column's cell style classes (Java: TableDisplayUtility.stfStylesFor):
    readonly columnStyles: readonly (readonly string[])[];
    // The error if the table's columns can't be found (e.g. a transformation that failed):
    readonly error: string | null;
}

/**
 * A cell's content (Java: what EditorKitCache's ValueLoader gets): the value as text (Java:
 * DataTypeUtility.valueToString); or the text of an invalid value (one that was typed and stored as
 * text), with where its recogniser finds the error; or, when the value can't be worked out, the error
 * ("ERR: ...").
 */
export type CellContent =
    | { readonly kind: "value", readonly text: string }
    | { readonly kind: "invalid", readonly text: string, readonly errorPosition: number | null }
    | { readonly kind: "error", readonly text: string };

/** An error to show the user in an alert (Java: FXUtility.showError: the title, and the message). */
export interface EngineAlert
{
    readonly title: string;
    readonly message: string;
}

/**
 * What an edit did (Java: the cell's Saver, then the re-run of the tables that depend on it): "saved"
 * with the cell's new content (unchanged if storing failed, or was cancelled), and any error to show; or
 * "stale" if the table has been replaced since the edit began (nothing is stored).
 */
export type EditResult =
    | { readonly kind: "saved", readonly cell: CellContent, readonly alert: EngineAlert | null }
    | { readonly kind: "stale" };

/**
 * A new column (Java: EditImmediateColumnDialog.ColumnDetails): its name, its type (a TypeExpression,
 * saved as in a file), and its default value (as the value's display text, as a cell shows it).
 */
export interface NewColumnDetails
{
    readonly columnName: string;
    readonly type: string;
    readonly defaultValue: string;
}

/** The types and units the user declared, as saved in a file (each item's lines, in order). */
export interface TypeInfo
{
    readonly units: string;
    readonly types: string;
}

export interface LoadResult
{
    readonly errors: readonly string[];
    readonly columnWidths: readonly (readonly [number, number])[];
}

/** What the GUI can ask the engine.  Each method is answered by one reply. */
export interface EngineApi
{
    /**
     * Loads a saved file, replacing what was loaded (as Java's loadAll).  Returns the errors, as plain
     * text, and the column widths the file gives (Java: View.loadColumnWidths), as [column, width].
     */
    load(text: string): LoadResult;
    /**
     * The saved file for everything loaded, with the given display details (Java: View.doSaveTo's
     * "COLUMNWIDTH column width" lines).
     */
    save(displayDetailLines: readonly string[]): string;
    /** The declared types and units, for the GUI's editors (which need a TypeManager of their own). */
    typeInfo(): TypeInfo;
    /**
     * Makes a data table with one column (Java: View.createTable, for a data table); its name, if
     * blank, is made up.  Gives an alert if it failed.
     */
    createDataTable(tableName: string, column: NewColumnDetails, columnIndex: number, rowIndex: number): EngineAlert | null;
    /** Adds a column to a data table, before the given column, or at the end (Java: TableDisplay.addColumnBefore_IDS). */
    addColumn(id: string, version: number, beforeColumn: string | null, column: NewColumnDetails): EngineAlert | null;
    /** Adds rows at the end of the table (Java: ExpandTableArrowSupplier's add-row button). */
    appendRows(id: string, version: number, count: number): EngineAlert | null;
    /** The table's length, or null if the table has been replaced. */
    length(id: string, version: number): number | null;
    /**
     * The cells of rows firstRow (incl) to lastRowExcl, or null if the table has been replaced, or if the
     * engine skipped the request because newer ones for the same table were waiting (it only does the
     * newest few, so that scrolling quickly doesn't leave it computing rows no longer in view).
     */
    rows(id: string, version: number, firstRow: number, lastRowExcl: number): Promise<readonly (readonly CellContent[])[] | null>;
    /**
     * The clipboard content for the cells of columns firstColumn to lastColumnIncl, and rows firstRow to
     * lastRowIncl, or all the rows for null (Java: TableDisplay.doCopy): a map from MIME type to text.
     * Null if the table has been replaced, or there is nothing to copy.
     */
    copy(id: string, version: number, firstColumn: number, lastColumnIncl: number, rows: { readonly firstRow: number, readonly lastRowIncl: number } | null): Promise<Readonly<Record<string, string>> | null>;
    /**
     * Records where the table is on the grid (Java: its TableDisplay's position, which saving uses),
     * after the GUI moves it.  Any version of the table: a re-run keeps the position.
     */
    setPosition(id: string, column: number, row: number): void;
    /**
     * Whether the cell's row can be edited (Java: EditableStatus.checkEditable, which the cell's
     * RecogniserDocument asks when it gains the focus; a ManualEdit refuses rows whose identifier is
     * an error).  False if the table has been replaced.
     */
    canEdit(id: string, version: number, column: number, row: number): boolean;
    /**
     * Stores text typed into a cell (Java: RecogniserDocument.recognise, then the Saver): the column's
     * recogniser reads it, and the value is stored, or the text as an invalid value if it can't be
     * read.  Then the tables that depend on it are re-run (Java: TableDisplay's onModify).
     */
    edit(id: string, version: number, column: number, row: number, text: string): EditResult;
    /**
     * Sets the cells of columns firstColumn to lastColumnIncl, rows firstRow to lastRowIncl, to their
     * columns' default values (Java: DataDisplay.doDelete and TableDisplay.deleteValue), skipping
     * columns that can't be edited or have no default, then re-runs the dependent tables.  Gives the new
     * content of the changed cells in the rows shown (shownFirstRow to shownLastRowExcl, the rows the GUI
     * has on the page), from shownFirst on; or null if the table has been replaced.
     */
    deleteCells(id: string, version: number, firstColumn: number, lastColumnIncl: number, firstRow: number, lastRowIncl: number, shownFirstRow: number, shownLastRowExcl: number): { readonly shownFirst: number, readonly cells: readonly (readonly CellContent[])[], readonly alert: EngineAlert | null } | null;
    /** Answers once the engine has no work waiting (after everything requested before it). */
    idle(): Promise<void>;
}

export type EngineMethod = keyof EngineApi;
// (The engine only answers these, whatever a message names)
export const ENGINE_METHODS: ReadonlySet<string> = new Set<EngineMethod>(["load", "save", "typeInfo", "createDataTable", "addColumn", "appendRows", "length", "rows", "copy", "setPosition", "canEdit", "edit", "deleteCells", "idle"]);

export type EngineEvent =
    // The list of tables changed, or a table in it was replaced:
    | { readonly kind: "tables", readonly tables: readonly TableInfo[] }
    // An error after a change, from re-running the tables that depend on a table (Java: an alert):
    | { readonly kind: "alert", readonly alert: EngineAlert }
    // Something saved in the file changed (Java: what called View.modified, or saved), so it should be
    // saved:
    | { readonly kind: "modified" };

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
