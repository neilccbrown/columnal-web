// What the grid asks of the project's window (Java: the TableDisplay's View): the dialogs it shows.
import { inject, provide, type InjectionKey } from "vue";
import type { HatLink } from "../engine/protocol.js";
import type { GridTableDisplay } from "./GridTableDisplay.js";

export interface TableActions
{
    // Java: TableDisplay.addColumnOperation's action: the column dialog, then the column is added
    // before the given column (by name), or at the end
    addColumn(display: GridTableDisplay, beforeColumn: string | null): void;
    // Java: ColumnHeaderOps.getPrimaryEditOperation for a data table's column (editColumn_IDS): the
    // column dialog for the column, focused on its name or type
    editColumn(display: GridTableDisplay, column: string, focus: "name" | "type"): void;
    // Java: DataDisplay.gotoRow: GotoRowDialog, then the row is selected in the column (on the grid)
    gotoRow(display: GridTableDisplay, column: number): void;
    // Java: the table menu's "Export data" (ExporterManager.chooseAndExportFile)
    exportTable(display: GridTableDisplay): void;
    // Java: a hat's Clickable parts' onClick (TableHat): the source table's PickTableDialog, or the
    // dialog editing the part, centred on the point on the screen
    hatLinkClicked(display: GridTableDisplay, link: HatLink, point: { readonly x: number, readonly y: number }): void;
    // Java: the table menu's "Transform" (View.createTransform): PickTransformationDialog, then the
    // transformation of the table is made below it and edited
    transform(display: GridTableDisplay, point: { readonly x: number, readonly y: number }): void;
}

const TABLE_ACTIONS: InjectionKey<TableActions> = Symbol("tableActions");

export function provideTableActions(actions: TableActions): void
{
    provide(TABLE_ACTIONS, actions);
}

/** The window's actions; none for a grid on its own (as in some tests). */
export function useTableActions(): TableActions | null
{
    return inject(TABLE_ACTIONS, null);
}
