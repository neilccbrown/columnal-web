// Picking a table or a column by clicking it in the grid, while a dialog which needs one shows (Java:
// View.enableTablePickingMode and enableColumnPickingMode): the table or column under the pointer, if
// it can be picked, is highlighted (TableHighlights' SELECT), with an arrow to the dialog, and clicking
// picks it.  The grid scrolls as usual meanwhile.  (docs/gui-spec/transformations.md)

export interface Picked
{
    readonly table: string;
    // For picking a column:
    readonly column: string | null;
}

export interface PickingMode
{
    // A table, a column, or either (Java: enableTableOrColumnPickingMode): over a column, the column if
    // include allows it, else the table if include allows that (with a null column)
    readonly kind: "table" | "column" | "tableOrColumn";
    // Whether the table (or the table's column) can be picked:
    readonly include: (table: string, column: string | null) => boolean;
    readonly onPick: (picked: Picked) => void;
    // The dialog the arrow points to (Java: the window's bounds), in client coordinates:
    readonly target: () => DOMRect | null;
    // Where to highlight at once (Java: the last mouse position), in client coordinates:
    readonly startPoint: { readonly x: number, readonly y: number } | null;
}
