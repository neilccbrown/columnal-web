// A table's menus (Java: TableDisplay.getTableHeaderContextMenu, getColumnActions' ColumnHeaderOps,
// and makeRowContextMenu), as menu data (menus.ts) for the grid's context menu (docs/gui-spec/tables.md).
import { checkMenuItem, disabled, menu, menuItem, menuItemPos, separator, textItem, type MenuEntry, type MenuItem } from "../components/menus/menus.js";
import type { TableDisplayMode } from "../engine/protocol.js";
import type { GridTableDisplay } from "./GridTableDisplay.js";

/** Java: TableDisplay.getTableHeaderContextMenu. */
export function tableHeaderMenu(display: GridTableDisplay): MenuEntry[]
{
    // Java: CheckDisplay.getTableHeaderContextMenu, just Delete
    if (display.info.check !== null)
        return [menuItem("tableDisplay.menu.delete", () => display.doDelete())];
    const current = display.info.display;
    // Java: radio menu items, in Display's order
    const show = (key: string, mode: TableDisplayMode): MenuEntry => checkMenuItem(key, current === mode, () => display.setDisplay(mode));
    return [
        menu("tableDisplay.menu.showColumns",
            show("tableDisplay.menu.show.collapse", "COLLAPSED"),
            show("tableDisplay.menu.show.all", "ALL"),
            show("tableDisplay.menu.show.altered", "ALTERED"),
            checkMenuItem("tableDisplay.menu.show.custom", current === "CUSTOM", () => display.getActions()?.customDisplay(display))),
        menuItem("tableDisplay.menu.copyValues", () => display.copyAllValues()),
        menuItem("tableDisplay.menu.exportData", () => display.getActions()?.exportTable(display)),
        menuItem("tableDisplay.menu.delete", () => display.doDelete()),
        separator(),
        menuItemPos("tableDisplay.menu.transform", point => display.getActions()?.transform(display, point)),
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
        // (Without the window, as for a grid on its own, it can't be done)
        const transformType = menuItem("recipe.transformType", () => actions?.transformType(display, column), "recipe-menu-item");
        r.push(actions === null ? disabled(transformType) : transformType);
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
