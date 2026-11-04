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
    // Which columns are shown (Java: Table.getShowColumns; the column lists above are of those shown):
    readonly display: TableDisplayMode;
    // Whether some, but not all, of the columns are altered (Java: headerMiddleClicked only cycles to
    // ALTERED then):
    readonly someAltered: boolean;
    // Whether the table can be renamed (Java: TableOperations.renameTable), and rows inserted and
    // deleted (insertRows, deleteRows):
    readonly canRename: boolean;
    readonly canInsertRows: boolean;
    readonly canDeleteRows: boolean;
    // Whether each column can be deleted (Java: TableOperations.deleteColumn):
    readonly columnDeletable: readonly boolean[];
    // Whether clicking each column's name or type edits it (Java: ColumnHeaderOps.getPrimaryEditOperation;
    // for now only data tables' columns):
    readonly columnHeaderEditable: readonly boolean[];
    // Each column header's extra style classes (Java: column-title-overwritten):
    readonly columnHeaderClasses: readonly (readonly string[])[];
    // The column after each, among all the table's columns (Java: the "Add column after" item), or null:
    readonly columnAfter: readonly (string | null)[];
    // A transformation's "hat", which describes it (Java: TableHat), or null for a data table:
    readonly hat: TableHatInfo | null;
}

/** Which of a table's columns are shown (Java: Table.Display). */
export type TableDisplayMode = "COLLAPSED" | "ALL" | "ALTERED" | "CUSTOM";

/**
 * The text of a transformation's hat (Java: TableHat's StyledString): its parts, with their style
 * classes, and what a clickable part does.  Collapsed, it shows just the transformation's kind.
 */
export interface TableHatInfo
{
    readonly content: readonly HatSegment[];
    readonly collapsed: string;
}

export interface HatSegment
{
    readonly text: string;
    readonly classes: readonly string[];
    readonly link: HatLink | null;
}

/**
 * A clickable part of a hat: the source table (its id, and whether it no longer exists), or another part
 * that edits the transformation.  (Clicking either opens a Phase 11 dialog.)
 */
export type HatLink =
    | { readonly kind: "source", readonly tableId: string, readonly broken: boolean }
    | { readonly kind: "edit", readonly tooltipKey: string | null };

/** A way to make a transformation from a column (Java: TableDisplay's column recipes). */
export type ColumnRecipe = "sum" | "average" | "frequency" | "sort";

/** An exporter, as the export dialog lists it (Java: Exporter.getName and getSupportedFileTypes). */
export interface ExporterInfo
{
    readonly name: string;
    readonly fileTypes: readonly string[];
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

/**
 * A comment on the grid (Java: GridComment): an id the engine gives it, its top left and bottom right
 * cells, and its text.
 */
export interface CommentInfo
{
    readonly id: string;
    readonly column: number;
    readonly row: number;
    readonly bottomColumn: number;
    readonly bottomRow: number;
    readonly content: string;
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
     * Replaces the declared types and units with those given (Java: the Types and Units dialogs changed
     * the TypeManager and UnitManager as they went; here they change a copy, which is then sent).
     */
    setTypeInfo(info: TypeInfo): EngineAlert | null;
    /** Adds an empty comment, two columns by two rows, at the cell (Java: View.createTable, for a comment). */
    addComment(column: number, row: number): void;
    /** Sets a comment's text (Java: its DisplayDocument's setAndSave). */
    setCommentContent(id: string, content: string): void;
    /** Sets a comment's bottom right cell (Java: GridCommentDisplay, resizing). */
    setCommentBottomRight(id: string, column: number, row: number): void;
    /** Removes a comment (Java: CommentSelection.doDelete). */
    removeComment(id: string): void;
    /**
     * Makes a data table with one column (Java: View.createTable, for a data table); its name, if
     * blank, is made up.  Gives an alert if it failed.
     */
    createDataTable(tableName: string, column: NewColumnDetails, columnIndex: number, rowIndex: number): EngineAlert | null;
    /** Adds a column to a data table, before the given column, or at the end (Java: TableDisplay.addColumnBefore_IDS). */
    addColumn(id: string, version: number, beforeColumn: string | null, column: NewColumnDetails): EngineAlert | null;
    /** Adds rows at the end of the table (Java: ExpandTableArrowSupplier's add-row button). */
    appendRows(id: string, version: number, count: number): EngineAlert | null;
    /** Inserts rows of default values before the given row (Java: the row label menu's insert items). */
    insertRows(id: string, version: number, row: number, count: number): EngineAlert | null;
    /** Deletes rows (Java: the row label menu's delete item). */
    deleteRows(id: string, version: number, row: number, count: number): EngineAlert | null;
    /** Renames a table (Java: TableOperations.renameTable, from the table name field), any version. */
    renameTable(id: string, newName: string): EngineAlert | null;
    /** Deletes a table, any version (Java: the table menu's Delete, and deleting an entire table selection). */
    deleteTable(id: string): void;
    /** Deletes a column (Java: TableOperations.deleteColumn, from the column menu or Delete). */
    deleteColumn(id: string, version: number, column: string): EngineAlert | null;
    /**
     * A data table's column's type, saved as in a file, and its default value as display text (for the
     * column dialog), or null.
     */
    columnDetails(id: string, version: number, column: string): { readonly type: string, readonly defaultValue: string | null } | null;
    /**
     * Changes a data table's column: its name, type and default value (Java:
     * TransformationEdits.editColumn_IDS); the tables that use it are updated to its new name.
     */
    editColumn(id: string, version: number, column: string, details: NewColumnDetails): EngineAlert | null;
    /** Sets which columns are shown (Java: TableDisplay.setDisplay), any version. */
    setDisplay(id: string, display: TableDisplayMode): void;
    /** Makes a transformation from a column (Java: the column menu's recipes). */
    recipe(id: string, version: number, column: string, recipe: ColumnRecipe): EngineAlert | null;
    /**
     * The clipboard content for all the table's values, all its columns (Java: the table menu's
     * "Copy values"); an alert if they couldn't be got; null if the table has been replaced.
     */
    copyAllValues(id: string, version: number): Promise<{ readonly content: Readonly<Record<string, string>> } | { readonly alert: EngineAlert } | null>;
    /** The exporters (Java: ExporterManager's registered exporters). */
    exporters(): readonly ExporterInfo[];
    /** Exports a table with an exporter (by its index): the file's content, or an alert (any version). */
    exportTable(id: string, exporter: number): { readonly data: Uint8Array } | { readonly alert: EngineAlert };
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
export const ENGINE_METHODS: ReadonlySet<string> = new Set<EngineMethod>(["load", "save", "typeInfo", "setTypeInfo", "addComment", "setCommentContent", "setCommentBottomRight", "removeComment", "createDataTable", "addColumn", "appendRows", "insertRows", "deleteRows", "renameTable", "deleteTable", "deleteColumn", "columnDetails", "editColumn", "setDisplay", "recipe", "copyAllValues", "exporters", "exportTable", "length", "rows", "copy", "setPosition", "canEdit", "edit", "deleteCells", "idle"]);

export type EngineEvent =
    // The list of tables changed, or a table in it was replaced:
    | { readonly kind: "tables", readonly tables: readonly TableInfo[], readonly comments: readonly CommentInfo[] }
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
