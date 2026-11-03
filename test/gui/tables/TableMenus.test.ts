// The parts of a table on the grid that the Java tests don't reach (docs/gui-spec/tables.md): the table
// menu's columns shown and copy, the column menu's recipes, Goto row, a transformation's hat, and Enter
// on a table's header rows.
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EntireTableSelection } from "../../../src/gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { copyToClipboard } from "../base/clipboard.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { clickMenu, closeApp, engineHost, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

async function start(): Promise<Awaited<ReturnType<typeof renderApp>>>
{
    // (C, the Calculate, lower down, so that its hat fits above it)
    const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE.replace("POSITION 4 1", "POSITION 4 5") }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2 && grid(a).displays().every(d => d.currentKnownRows === 3));
    scroller().focus();
    return a;
}

function grid(a: RenderedApp)
{
    return a.mainWindow()!.grid()!;
}

function display(a: RenderedApp, id: string)
{
    return grid(a).displays().find(d => d.info.id === id)!;
}

function scroller(): HTMLElement
{
    return document.querySelector<HTMLElement>("[data-testid=grid]")!;
}

function columnNames(id: string): string[]
{
    return [...document.querySelectorAll(`[data-table="${id}"] .column-name`)].map(e => e.textContent!.trim());
}

async function tableMenu(id: string): Promise<void>
{
    const title = document.querySelector<HTMLElement>(`[data-table="${id}"] .table-title`)!;
    await userEvent.click(title, { button: "right", position: { x: 2, y: 5 } });
    await vi.waitUntil(() => document.querySelector(".context-menu") !== null);
}

async function chooseShowColumns(id: string, itemClass: string): Promise<void>
{
    await tableMenu(id);
    (await vi.waitUntil(() => document.querySelector<HTMLElement>(".id-tableDisplay-menu-showColumns"))).focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(await vi.waitUntil(() => document.querySelector("." + itemClass)));
    await vi.waitUntil(() => document.querySelector(".context-menu") === null);
}

test("show columns: collapsed, all, and altered, from the menu; middle-click cycles them, and they're saved", async () =>
{
    const a = await start();
    await chooseShowColumns("C", "id-tableDisplay-menu-show-collapse");
    await vi.waitUntil(() => display(a, "C").info.display === "COLLAPSED");
    expect(columnNames("C")).toEqual([]);
    expect(display(a, "C").getBottomRightIncl().equals(display(a, "C").getPosition())).toBe(true);
    await vi.waitUntil(async () => (await a.store.get(a.ids[0]!))?.content.includes("SHOWCOLUMNS COLLAPSED") === true);

    await chooseShowColumns("C", "id-tableDisplay-menu-show-altered");
    await vi.waitUntil(() => columnNames("C").join() === "Double");
    await chooseShowColumns("C", "id-tableDisplay-menu-show-all");
    await vi.waitUntil(() => columnNames("C").join() === "N,Name,Double");

    // Middle-click: all, then altered (C has some altered columns), then collapsed, then all:
    const title = (): HTMLElement => document.querySelector<HTMLElement>('[data-table="C"] .table-title')!;
    for (const expected of ["Double", "", "N,Name,Double"])
    {
        await userEvent.click(title(), { button: "middle", position: { x: 80, y: 5 } });
        await vi.waitUntil(() => columnNames("C").join() === expected);
    }
    // T has no altered columns (all are, as data), so it goes straight to collapsed:
    await userEvent.click(document.querySelector<HTMLElement>('[data-table="T"] .table-title')!, { button: "middle", position: { x: 80, y: 5 } });
    await vi.waitUntil(() => display(a, "T").info.display === "COLLAPSED");
});

test("copy values copies all the table's values", async () =>
{
    await start();
    const text = await copyToClipboard(async () =>
    {
        await tableMenu("C");
        await userEvent.click(document.querySelector(".id-tableDisplay-menu-copyValues")!);
    });
    expect(text).toBe("1, \"a\", 2\n2.5, \"b\", 5\n-3, \"c\", -6");
});

test("recipes make a transformation of the column, to the right of the others", async () =>
{
    const a = await start();
    const menuOn = async (id: string, column: string): Promise<void> =>
    {
        await vi.waitUntil(() => document.querySelector(".context-menu") === null);
        const header = [...document.querySelectorAll<HTMLElement>(`[data-table="${id}"] .column-name`)].find(e => e.textContent?.trim() === column)!;
        await userEvent.click(header, { button: "right" });
        await vi.waitUntil(() => document.querySelector(".context-menu") !== null);
    };
    await menuOn("T", "N");
    expect([...document.querySelectorAll(".context-menu .menu-item")].map(e => e.textContent?.trim())).toEqual(
        ["New column to left", "New column to right", "Delete column", "Recipes", "Calculate sum", "Calculate average", "Make frequency table", "Sort by", "Transform type"]);
    await userEvent.click(document.querySelector(".id-recipe-sum")!);
    await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().length === 3);
    const sum = engineHost(a).tableManager.getAllTables().find(t => t.getId().getRaw() !== "T" && t.getId().getRaw() !== "C")!;
    expect(sum.getData().getColumnIds().map(c => c.getRaw())).toEqual(["Sum N"]);
    expect(sum.getData().getColumns()[0]!.getType().getCollapsed(0).toString()).toBe("0.5");

    // A text column has no sum or average:
    await menuOn("T", "Name");
    expect(document.querySelector(".id-recipe-sum")).toBeNull();
    await userEvent.click(document.querySelector(".id-recipe-sort")!);
    await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().length === 4);

    // A Calculate's own column can be deleted (Java: its TableOperations), one passed through from
    // its source can't; columns can't be added to it here yet:
    await menuOn("C", "Double");
    expect(document.querySelector(".id-virtGrid-column-delete")).not.toBeNull();
    expect(document.querySelector(".id-virtGrid-column-addBefore")).toBeNull();
    expect(document.querySelector(".id-recipe-average")).not.toBeNull();
    await push("Escape");
    await menuOn("C", "N");
    expect(document.querySelector(".id-virtGrid-column-delete")).toBeNull();
});

test("goto row: a row number in the table, selected in the same column", async () =>
{
    const a = await start();
    const t = display(a, "T");
    await keyboardMoveTo(grid(a).grid, t.getPosition().offsetByRowCols(3, 1));
    await clickMenu("id-menu-view", "id-menu-view-goto-row");
    const field = await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".goto-row-field"));
    await vi.waitUntil(() => document.activeElement === field);
    await write("9");
    await userEvent.click(document.querySelector(".ok-button")!);
    // Out of range: the dialog stays, with the error:
    expect(document.querySelector(".goto-row-field")).not.toBeNull();
    await userEvent.click(field);
    await vi.waitUntil(() => document.body.textContent?.includes("Number outside range of table rows (1-3)") === true);
    await userEvent.fill(field, "x");
    await vi.waitUntil(() => document.body.textContent?.includes("Not a number: For input string: \"x\"") === true);
    await userEvent.fill(field, "3");
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".goto-row-field") === null);
    expect(grid(a).grid.getSelection()?.isExactly(t.getPosition().offsetByRowCols(3 + 2, 1))).toBe(true);
});

test("a transformation's hat: its text, collapsing it, and its source link's middle click", async () =>
{
    const a = await start();
    const hat = await vi.waitUntil(() => document.querySelector<HTMLElement>('.table-hat[data-table="C"]'));
    expect(hat.textContent).toBe("From T calculate Double ◄");
    // Above the table (Java: if it fits there), indented:
    const tableBox = document.querySelector('[data-table="C"].table')!.getBoundingClientRect();
    await vi.waitUntil(() => hat.getBoundingClientRect().bottom <= tableBox.top);
    expect(hat.getBoundingClientRect().left - tableBox.left).toBeCloseTo(20, 0);
    expect(document.querySelector('.table-hat[data-table="T"]')).toBeNull();

    await userEvent.click(hat.querySelector(".table-hat-collapse")!);
    await vi.waitUntil(() => hat.textContent === "Calculate ►");
    await userEvent.click(hat, { button: "middle" });
    await vi.waitUntil(() => hat.textContent === "From T calculate Double ◄");

    const source = [...hat.querySelectorAll("span")].find(s => s.textContent === "T")!;
    expect(source.getAttribute("title")).toBe("Click to change source table");
    await userEvent.click(source, { button: "middle" });
    const selection = grid(a).grid.getSelection();
    expect(selection).toBeInstanceOf(EntireTableSelection);
    expect(selection!.includes(display(a, "T"))).toBe(true);
});

test("enter on a table's name row shows its menu; on a column's name or type, edits it", async () =>
{
    const a = await start();
    const t = display(a, "T");
    await keyboardMoveTo(grid(a).grid, t.getPosition());
    await push("Enter");
    await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-delete") !== null);
    await push("Escape");
    await vi.waitUntil(() => document.querySelector(".context-menu") === null);

    await keyboardMoveTo(grid(a).grid, t.getPosition().offsetByRowCols(1, 1));
    await push("Enter");
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    expect((document.activeElement as HTMLInputElement).value).toBe("Name");
    await push("Escape");
    await userEvent.click(document.querySelector(".cancel-button")!);
    await vi.waitUntil(() => document.querySelector(".edit-column-content") === null);

    scroller().focus();
    await keyboardMoveTo(grid(a).grid, t.getPosition().offsetByRowCols(2, 0));
    await push("Enter");
    await vi.waitUntil(() => document.activeElement?.closest(".type-editor") !== null && document.activeElement?.closest(".type-editor") !== undefined);
    await userEvent.click(document.querySelector(".cancel-button")!);
});

test("editing a column's type converts its values, and a used table name can't be given", async () =>
{
    const a = await start();
    // Name's type to Number: "a", "b", "c" don't convert, so are kept as invalid values
    const header = [...document.querySelectorAll<HTMLElement>('[data-table="T"] .column-type')][1]!;
    await userEvent.click(header);
    await vi.waitUntil(() => document.activeElement?.closest(".type-editor") !== null && document.activeElement?.closest(".type-editor") !== undefined);
    await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
    await write("Number");
    await push("Escape");
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".edit-column-content") === null);
    await vi.waitUntil(() => display(a, "T").info.columnTypes[1] === "Number");
    expect(engineHost(a).tableManager.getAllTables().find(t => t.getId().getRaw() === "T")!.getData().getColumns()[1]!.getType().getType().toString()).toBe("Number");

    // Renaming T to C, which is used, shows the error and leaves it as T:
    const field = document.querySelector<HTMLInputElement>('[data-table="T"] .table-name-text-field')!;
    await userEvent.click(field);
    await userEvent.fill(field, "C");
    await vi.waitUntil(() => field.classList.contains("has-error"));
    await push("Enter");
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(engineHost(a).tableManager.getAllTables().map(t => t.getId().getRaw()).sort()).toEqual(["C", "T"]);
});

test("flashing the header", async () =>
{
    const a = await start();
    display(a, "T").flashHeader();
    await vi.waitUntil(() => document.querySelector('[data-table="T"] .table-title.flashing') !== null);
    await vi.waitUntil(() => document.querySelector('[data-table="T"] .table-title.flashing') === null, { timeout: 2000 });
});

test("a cut-off cell's whole text shows after hovering over it for a second", async () =>
{
    const long = "a long piece of text which is cut off";
    const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE.replace("\"a\"", `"${long}"`) }], 0);
    await waitForLoaded();
    const cell = (row: number): HTMLElement => document.querySelector<HTMLElement>(`[data-table="T"] .row[data-row="${row}"] .cell[data-col="1"]:not(.loading)`)!;
    await vi.waitUntil(() => grid(a).displays().length === 2 && cell(0) !== null && cell(1) !== null);
    await userEvent.hover(cell(0));
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(document.querySelector(".virtual-grid-tooltip-flow")).toBeNull();
    const tip = await vi.waitUntil(() => document.querySelector(".virtual-grid-tooltip-flow"), { timeout: 2000 });
    expect(tip.textContent?.trim()).toBe(`"${long}"`);
    // Not for a cell that isn't cut off:
    await userEvent.hover(cell(1));
    await vi.waitUntil(() => document.querySelector(".virtual-grid-tooltip-flow") === null);
    await new Promise(resolve => setTimeout(resolve, 1200));
    expect(document.querySelector(".virtual-grid-tooltip-flow")).toBeNull();
});
