// What the grid asks of the project's window (Java: the TableDisplay's View): the dialogs it shows.
import { inject, provide, type InjectionKey } from "vue";
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
