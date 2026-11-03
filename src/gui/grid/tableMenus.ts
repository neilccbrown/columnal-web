// A table's menus (Java: TableDisplay.getTableHeaderContextMenu, getColumnActions' ColumnHeaderOps,
// and makeRowContextMenu), as menu data (menus.ts) for the grid's context menu (docs/gui-spec/tables.md).
import { checkMenuItem, disabled, menu, menuItem, separator, textItem, type MenuEntry, type MenuItem } from "../components/menus/menus.js";
import type { TableDisplayMode } from "../engine/protocol.js";
import type { GridTableDisplay } from "./GridTableDisplay.js";

/** Java: TableDisplay.getTableHeaderContextMenu. */
export function tableHeaderMenu(display: GridTableDisplay): MenuEntry[]
{
    const current = display.info.display;
    // Java: radio menu items, in Display's order
    const show = (key: string, mode: TableDisplayMode): MenuEntry => checkMenuItem(key, current === mode, () => display.setDisplay(mode));
    return [
        menu("tableDisplay.menu.showColumns",
            show("tableDisplay.menu.show.collapse", "COLLAPSED"),
            show("tableDisplay.menu.show.all", "ALL"),
            show("tableDisplay.menu.show.altered", "ALTERED"),
            // PORT-DEFERRED: the custom display, whose dialog (CustomColumnDisplayDialog) has Phase 11's
            // HideColumnsPanel
            checkMenuItem("tableDisplay.menu.show.custom", current === "CUSTOM", () => {}, true)),
        menuItem("tableDisplay.menu.copyValues", () => display.copyAllValues()),
        menuItem("tableDisplay.menu.exportData", () => display.getActions()?.exportTable(display)),
        menuItem("tableDisplay.menu.delete", () => display.doDelete()),
        separator(),
        // PORT-DEFERRED: making a transformation of the table (View.createTransform, Phase 11)
        disabled(menuItem("tableDisplay.menu.transform", () => {})),
    ];
}

/**
 * Java: TableDisplay.getColumnActions' contextOperations (with DataDisplay's "No operations" when
 * there are none), for the column (by its index among those shown).
 */
export function columnHeaderMenu(display: GridTableDisplay, columnIndex: number): MenuEntry[]
{
    const info = display.info;
    const column = info.columnNames[columnIndex];
    if (column === undefined)
        return [];
    const r: MenuEntry[] = [];
    const actions = display.getActions();
    // PORT-DEFERRED: adding columns to Calculate and Aggregate (Phases 10 and 11)
    if (info.canAddColumn && actions !== null)
    {
        r.push(menuItem("virtGrid.column.addBefore", () => actions.addColumn(display, column)));
        r.push(menuItem("virtGrid.column.addAfter", () => actions.addColumn(display, info.columnAfter[columnIndex] ?? null)));
    }
    if (info.columnDeletable[columnIndex] === true)
        r.push(menuItem("virtGrid.column.delete", () => display.deleteColumn(column)));
    if (info.error === null)
    {
        // Java: a disabled item with the text "Recipes" (not translated)
        r.push(textItem("Recipes", "recipe-header-menu-item"));
        const recipe = (key: string, recipe: "sum" | "average" | "frequency" | "sort"): MenuItem => menuItem(key, () => display.recipe(column, recipe), "recipe-menu-item");
        if (info.columnNumber[columnIndex] === true)
        {
            r.push(recipe("recipe.sum", "sum"));
            r.push(recipe("recipe.average", "average"));
        }
        r.push(recipe("recipe.frequency", "frequency"));
        r.push(recipe("recipe.sort", "sort"));
        // PORT-DEFERRED: transforming the column's type (PickTypeTransformDialog, Phase 11)
        r.push(disabled(menuItem("recipe.transformType", () => {}, "recipe-menu-item")));
    }
    if (r.length === 0)
        r.push(textItem("No operations"));
    return r;
}

/** Java: TableDisplay.makeRowContextMenu, for the data row (from 0); empty if none. */
export function rowLabelMenu(display: GridTableDisplay, row: number): MenuEntry[]
{
    const r: MenuEntry[] = [];
    if (display.info.canInsertRows)
    {
        r.push(menuItem("virtGrid.row.insertBefore", () => display.insertRows(row, 1)));
        r.push(menuItem("virtGrid.row.insertAfter", () => display.insertRows(row + 1, 1)));
    }
    if (display.info.canDeleteRows)
        r.push(menuItem("virtGrid.row.delete", () => display.deleteRows(row, 1)));
    return r;
}
