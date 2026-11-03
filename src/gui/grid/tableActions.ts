// What the grid asks of the project's window (Java: the TableDisplay's View): the dialogs it shows.
import { inject, provide, type InjectionKey } from "vue";
import type { GridTableDisplay } from "./GridTableDisplay.js";

export interface TableActions
{
    // Java: TableDisplay.addColumnOperation's action: the column dialog, then the column is added
    // before the given column (by name), or at the end
    addColumn(display: GridTableDisplay, beforeColumn: string | null): void;
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
