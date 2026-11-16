// The import dialog and how importing starts (docs/gui-spec/importing.md): Import File (a text file, an
// HTML file's table picked, an Excel file, an R file's tables picked, or a file whose importer is
// picked), Import URL, and pasting text into an empty cell; the dialog's choices, area and preview.
import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { selectGivenComboBoxItem } from "../base/comboUtil.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { closeStarted, start } from "../transformations/fixtures.js";

afterEach(closeStarted);

const TARGET = new CellPosition(CellPosition.row(8), CellPosition.col(1));
const PEOPLE = "Name,Age\nAlice,30\nBob,41\nCarol,25\n";

// Picks the file (as the browser's file picker would) for the new-table dialog's Import File, at the cell
async function importFile(a: RenderedApp, name: string, content: BlobPart): Promise<void>
{
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, TARGET);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(TARGET, TARGET));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-import-file")));
    const input = document.querySelector<HTMLInputElement>(".import-file-input")!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

const dialogShowing = (): boolean => document.querySelector(".guess-format-content") !== null;
const texts = (selector: string): string[] => [...document.querySelectorAll(selector)].map(e => e.textContent.trim());
const description = (): string => document.querySelector(".import-selection-description")?.textContent ?? "";
const cells = (grid: string): string[][] =>
{
    const byTop = new Map<number, [number, string][]>();
    for (const cell of document.querySelectorAll<HTMLElement>(`${grid} .import-data-cell`))
    {
        const top = Number.parseFloat(cell.style.top);
        byTop.set(top, [...byTop.get(top) ?? [], [Number.parseFloat(cell.style.left), cell.textContent.trim()]]);
    }
    return [...byTop.entries()].sort((x, y) => x[0] - y[0]).map(([, row]) => row.sort((x, y) => x[0] - y[0]).map(c => c[1]));
};
const tableValues = (a: RenderedApp, id: string): string[][] =>
{
    const data = engineHost(a).tableManager.getSingleTableOrThrow(new TableId(id)).getData();
    const columns = data.getColumns();
    const r: string[][] = [];
    for (let row = 0; row < data.getLength(); row++)
        r.push(columns.map(c => DataTypeUtility.valueToString(c.getType().getCollapsed(row))));
    return r;
};
const newTables = (a: RenderedApp): string[] => engineHost(a).tableManager.getAllTables().map(t => t.getId().getRaw()).filter(id => id !== "T" && id !== "U");

async function ok(): Promise<void>
{
    await userEvent.click(document.querySelector(".guess-format-content")!.closest("[role=dialog]")!.querySelector(".ok-button")!);
    await vi.waitUntil(() => !dialogShowing(), { timeout: 5000 });
}

describe("Importing a text file", () =>
{
    test("the dialog: its choices, the original with its area outlined, and a preview level with it; OK imports it at the cell", async () =>
    {
        const a = await start();
        await importFile(a, "people.csv", PEOPLE);
        await vi.waitUntil(() => description() !== "" && cells(".import-dest-grid").length === 3, { timeout: 5000 });
        expect(texts(".import-choice-label")).toEqual(["Encoding", "Column separator", "Column quote"]);
        expect(texts(".import-choice-combo")).toEqual(["UTF-8", ",", "None"]);
        expect(texts(".import-src-grid .import-column-name")).toEqual(["Col 1", "Col 2"]);
        expect(cells(".import-src-grid")).toEqual([["\"Name\"", "\"Age\""], ["\"Alice\"", "\"30\""], ["\"Bob\"", "\"41\""], ["\"Carol\"", "\"25\""]]);
        // (The first row is the column names, so the area is below it)
        expect(description()).toBe("Rows ↕ 2-4 of 4.  Columns ↔ 1-2 of 2.");
        expect(texts(".import-dest-grid .import-column-name")).toEqual(["Name", "Age"]);
        expect(texts(".import-dest-grid .import-column-type")).toEqual(["Text", "Number"]);
        expect(cells(".import-dest-grid")).toEqual([["\"Alice\"", "30"], ["\"Bob\"", "41"], ["\"Carol\"", "25"]]);
        // The preview's rows are level with the area's:
        const area = document.querySelector(".prospective-import-rectangle")!.getBoundingClientRect();
        const firstPreviewRow = document.querySelector(".import-dest-grid .import-data-cell")!.getBoundingClientRect();
        expect(Math.abs(area.top - firstPreviewRow.top)).toBeLessThan(2);
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(newTables(a)).toEqual(["people"]);
        expect(tableValues(a, "people")).toEqual([["\"Alice\"", "30"], ["\"Bob\"", "41"], ["\"Carol\"", "25"]]);
        await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === "people")?.getPosition().equals(TARGET) === true, { timeout: 5000 });
    });

    test("Cancel imports nothing; Enter and Escape don't close it", async () =>
    {
        const a = await start();
        await importFile(a, "people.csv", PEOPLE);
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        // (With nothing focused: Enter on a combo box opens it)
        (document.activeElement as HTMLElement | null)?.blur();
        await userEvent.keyboard("{Escape}");
        await userEvent.keyboard("{Enter}");
        await sleep(300);
        expect(dialogShowing()).toBe(true);
        await userEvent.click(document.querySelector(".guess-format-content")!.closest("[role=dialog]")!.querySelector(".cancel-button")!);
        await vi.waitUntil(() => !dialogShowing());
        await sleep(300);
        expect(newTables(a)).toEqual([]);
    });

    test("a choice changed reloads the original: another separator, or one typed as Other... (an error, until it is one character)", async () =>
    {
        const a = await start();
        await importFile(a, "people.csv", PEOPLE);
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        const separator = page.getByRole("combobox", { name: "Column separator" });
        await selectGivenComboBoxItem(separator, "Space");
        await vi.waitUntil(() => texts(".import-src-grid .import-column-name").length === 1, { timeout: 5000 });
        // (A different number of columns, so the area guessed for it: no row of names now)
        expect(description()).toBe("Rows ↕ 1-4 of 4.  Columns ↔ 1-1 of 1.");
        await selectGivenComboBoxItem(separator, "Other...");
        const other = await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".import-choice-other"));
        await userEvent.type(other, "ab");
        await vi.waitUntil(() => document.querySelector(".import-choice .error-label") !== null);
        // (No separator then: one column)
        await vi.waitUntil(() => texts(".import-src-grid .import-column-name").length === 1, { timeout: 5000 });
        await userEvent.clear(other);
        await userEvent.type(other, ",");
        await vi.waitUntil(() => texts(".import-src-grid .import-column-name").length === 2 && cells(".import-dest-grid").length === 3, { timeout: 5000 });
        expect(document.querySelector(".import-choice .error-label")).toBeNull();
        expect(newTables(a)).toEqual([]);
    });
});

// Drags in the original from one point to another (in its canvas, in pixels), as the mouse would
async function drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void>
{
    const pane = document.querySelector<HTMLElement>(".import-mouse-pane")!;
    const box = pane.getBoundingClientRect();
    const at = (p: { x: number, y: number }, type: string, buttons: number): void =>
    {
        pane.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: box.left + p.x, clientY: box.top + p.y, button: 0, buttons, pointerId: 1 }));
    };
    at(from, "pointermove", 0);
    at(from, "pointerdown", 1);
    at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, "pointermove", 1);
    at(to, "pointermove", 1);
    at(to, "pointerup", 0);
    await sleep(100);
}

describe("The area of the original", () =>
{
    // (Columns are 100 px, rows 24 px; the original's data starts at row 2, column 1)
    const ROW = 24;
    const WIDTH = 100;

    test("its edge dragged leaves out more (the cursor shows which edge); the preview follows", async () =>
    {
        await start().then(a => importFile(a, "people.csv", PEOPLE));
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        // The area's top edge is at row 3 (below the names):
        const pane = document.querySelector<HTMLElement>(".import-mouse-pane")!;
        const box = pane.getBoundingClientRect();
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + 1.5 * WIDTH, clientY: box.top + 3 * ROW }));
        await vi.waitUntil(() => pane.style.cursor === "n-resize");
        await drag({ x: 1.5 * WIDTH, y: 3 * ROW }, { x: 1.5 * WIDTH, y: 4 * ROW + 3 });
        expect(description()).toBe("Rows ↕ 3-4 of 4.  Columns ↔ 1-2 of 2.");
        await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
        // The right edge, in a column:
        await drag({ x: 3 * WIDTH, y: 4.5 * ROW }, { x: 2 * WIDTH + 10, y: 4.5 * ROW });
        expect(description()).toBe("Rows ↕ 3-4 of 4.  Columns ↔ 1-1 of 2.");
        await vi.waitUntil(() => cells(".import-dest-grid")[0]?.length === 1, { timeout: 5000 });
    });

    test("dragged elsewhere, a new area from where the mouse was pressed", async () =>
    {
        await start().then(a => importFile(a, "people.csv", PEOPLE));
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        // From the top left of Bob's age to the top left of Carol's (Java: the cell whose top left corner
        // is nearest the mouse):
        await drag({ x: 2 * WIDTH + 5, y: 4 * ROW + 5 }, { x: 2 * WIDTH + 10, y: 5 * ROW + 5 });
        expect(description()).toBe("Rows ↕ 3-4 of 4.  Columns ↔ 2-2 of 2.");
        await vi.waitUntil(() => cells(".import-dest-grid").length === 2 && cells(".import-dest-grid")[0]?.length === 1, { timeout: 5000 });
    });

    test("Undo area goes back to the area before, and Reset area to the one guessed; neither remakes the preview (Java's bug, kept)", async () =>
    {
        await start().then(a => importFile(a, "people.csv", PEOPLE));
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        await drag({ x: 1.5 * WIDTH, y: 3 * ROW }, { x: 1.5 * WIDTH, y: 4 * ROW + 3 });
        await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
        await userEvent.click(document.querySelector(".id-undo-import-selection-change")!);
        expect(description()).toBe("Rows ↕ 2-4 of 4.  Columns ↔ 1-2 of 2.");
        await sleep(300);
        expect(cells(".import-dest-grid").length).toBe(2);
        await drag({ x: 1.5 * WIDTH, y: 3 * ROW }, { x: 1.5 * WIDTH, y: 5 * ROW + 3 });
        expect(description()).toBe("Rows ↕ 4-4 of 4.  Columns ↔ 1-2 of 2.");
        await userEvent.click(document.querySelector(".id-reset-import-selection")!);
        expect(description()).toBe("Rows ↕ 2-4 of 4.  Columns ↔ 1-2 of 2.");
        await sleep(300);
        expect(cells(".import-dest-grid").length).toBe(1);
    });
});

describe("Importing other files", () =>
{
    test("HTML: its tables that can be imported are outlined to pick from; the one clicked goes to the dialog, with its check box", async () =>
    {
        const a = await start();
        const html = "<html><body><p>Two tables</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table>"
            + "<table><tr><th>Animal</th><th>Legs</th></tr><tr><td> Cat </td><td>4</td></tr><tr><td>Bird</td><td>2</td></tr></table></body></html>";
        await importFile(a, "zoo.html", html);
        const frame = await vi.waitUntil(() => document.querySelector<HTMLIFrameElement>(".pick-html-table-frame"), { timeout: 5000 });
        expect(document.querySelector(".pick-html-table-instruction")?.textContent.trim()).toBe("Click any red-bordered table to import it");
        const links = await vi.waitUntil(() =>
        {
            const found = [...frame.contentDocument?.querySelectorAll<HTMLElement>("a.gui_import") ?? []];
            return found.length === 2 ? found : null;
        }, { timeout: 5000 });
        // (Outlined in red)
        const overlay = links[1]!.querySelector(".overlay")!;
        expect(frame.contentWindow!.getComputedStyle(overlay).borderTopColor).toBe("rgb(255, 0, 0)");
        links[1]!.querySelector("td")!.click();
        await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
        expect(document.querySelector(".pick-html-table-frame")).toBeNull();
        expect(texts(".import-choice-label")).toEqual(["Remove leading/trailing spaces from values"]);
        expect(document.querySelector<HTMLInputElement>(".import-choice .check-box")!.checked).toBe(true);
        expect(texts(".import-dest-grid .import-column-name")).toEqual(["Animal", "Legs"]);
        expect(cells(".import-dest-grid")).toEqual([["\"Cat\"", "4"], ["\"Bird\"", "2"]]);
        // Without trimming, Cat has its spaces:
        await userEvent.click(document.querySelector(".import-choice .check-box")!);
        await vi.waitUntil(() => cells(".import-dest-grid")[0]?.[0] === "\" Cat \"", { timeout: 5000 });
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(tableValues(a, newTables(a)[0]!)).toEqual([["\" Cat \"", "4"], ["\"Bird\"", "2"]]);
    });

    test("HTML: Cancel in the table picker imports nothing", async () =>
    {
        const a = await start();
        await importFile(a, "one.html", "<table><tr><td>1</td></tr></table>");
        await vi.waitUntil(() => document.querySelector(".pick-html-table-frame") !== null, { timeout: 5000 });
        await userEvent.click(document.querySelector(".pick-html-table")!.closest("[role=dialog]")!.querySelector(".cancel-button")!);
        await vi.waitUntil(() => document.querySelector(".pick-html-table-frame") === null);
        await sleep(300);
        expect(dialogShowing()).toBe(false);
        expect(newTables(a)).toEqual([]);
    });

    test("Excel: the dialog, with no choices", async () =>
    {
        const a = await start();
        const XLSX = await import("xlsx");
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["City", "Pop"], ["Leeds", 800], ["York", 200]]), "Sheet1");
        const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        await importFile(a, "cities.xlsx", bytes);
        await vi.waitUntil(() => cells(".import-dest-grid").length === 2, { timeout: 5000 });
        expect(texts(".import-choice-label")).toEqual([]);
        expect(texts(".import-dest-grid .import-column-name")).toEqual(["City", "Pop"]);
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(tableValues(a, newTables(a)[0]!)).toEqual([["\"Leeds\"", "800"], ["\"York\"", "200"]]);
    });

    test("R, with several tables: they're picked (all at first; OK needs one), then imported side by side", async () =>
    {
        const a = await start();
        const bytes = await (await fetch(new URL("../../engine/tests-gui-r/importExport/resources/df-df2.Rdata", import.meta.url))).arrayBuffer();
        await importFile(a, "df-df2.Rdata", bytes);
        const items = await vi.waitUntil(() =>
        {
            const found = [...document.querySelectorAll<HTMLElement>(".r-table-item")];
            return found.length > 1 ? found : null;
        }, { timeout: 5000 });
        expect(document.querySelector(".pick-r-tables label")?.textContent.trim()).toBe("Choose tables to import");
        expect(items.every(i => i.getAttribute("aria-selected") === "true")).toBe(true);
        const ok = document.querySelector(".pick-r-tables")!.closest("[role=dialog]")!.querySelector<HTMLButtonElement>(".ok-button")!;
        // Only the first, then none (Ctrl/Cmd+click), then the first again:
        await userEvent.click(items[0]!);
        expect(items.map(i => i.getAttribute("aria-selected"))).toEqual(["true", ...items.slice(1).map(() => "false")]);
        await userEvent.click(items[0]!, { modifiers: [navigator.platform.includes("Mac") ? "Meta" : "Control"] });
        await vi.waitUntil(() => ok.disabled);
        await userEvent.click(items[0]!);
        await userEvent.click(ok);
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(newTables(a)).toEqual([items[0]!.textContent.trim()]);
    });

    test("a file no importer handles: the importer is picked first (none picked: an error)", async () =>
    {
        const a = await start();
        await importFile(a, "people.dat", PEOPLE);
        await vi.waitUntil(() => document.querySelector(".importer-list") !== null, { timeout: 5000 });
        expect(document.querySelector(".pick-importer label")?.textContent.trim()).toBe("Pick importer for people.dat");
        expect(texts(".importer-item")).toEqual(["Text files [CSV] (*.txt, *.csv)", "HTML files (*.html, *.htm)", "Excel files (*.xls, *.xlsx, *.xlsm)", "R data files (*.rds, *.Rdata)"]);
        expect(document.querySelector(".importer-item.selected")?.textContent.trim()).toBe("Text files [CSV] (*.txt, *.csv)");
        await userEvent.click(document.querySelector(".importer-list")!.closest("[role=dialog]")!.querySelector(".ok-button")!);
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
    });
});

describe("Import URL", () =>
{
    async function importURL(a: RenderedApp): Promise<HTMLInputElement>
    {
        const grid = a.mainWindow()!.grid()!.grid;
        await keyboardMoveTo(grid, TARGET);
        await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(TARGET, TARGET));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-import-url")));
        return vi.waitUntil(() => document.querySelector<HTMLInputElement>(".import-link-field"), { timeout: 5000 });
    }
    const selectedImporter = (): string => document.querySelector(".importer-item.selected")?.textContent.trim() ?? "";
    const okButton = (): HTMLElement => document.querySelector(".import-link-contents")!.closest("[role=dialog]")!.querySelector(".ok-button")!;

    test("the clipboard's URL is filled in, and the importer follows its extension; OK downloads it, to import (named after the download: Java's bug, kept)", async () =>
    {
        const a = await start();
        const url = new URL("resources/people.csv", import.meta.url).href;
        await navigator.clipboard.writeText(url);
        const field = await importURL(a);
        await vi.waitUntil(() => field.value === url, { timeout: 5000 });
        expect(selectedImporter()).toBe("Text files [CSV] (*.txt, *.csv)");
        await userEvent.click(okButton());
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(newTables(a)[0]).toMatch(/^testguiimportingresourcespeoplecsv[0-9]+$/);
        expect(tableValues(a, newTables(a)[0]!)).toEqual([["\"Alice\"", "30"], ["\"Bob\"", "41"], ["\"Carol\"", "25"]]);
    });

    test("not the clipboard's text if it isn't a URL; typed, the importer follows the extension; the errors", async () =>
    {
        const a = await start();
        await navigator.clipboard.writeText("not a link");
        const field = await importURL(a);
        await sleep(300);
        expect(field.value).toBe("");
        // (HTML first selected)
        expect(selectedImporter()).toBe("HTML files (*.html, *.htm)");
        await userEvent.click(okButton());
        await vi.waitUntil(() => document.querySelector(".import-link-contents .error-label")?.textContent.trim() === "URL cannot be blank");
        await userEvent.type(field, "localhost:1/data.XLSX");
        await vi.waitUntil(() => selectedImporter() === "Excel files (*.xls, *.xlsx, *.xlsm)");
        // (http:// is added; nothing answers there)
        await userEvent.click(okButton());
        await vi.waitUntil(() => document.querySelector(".import-link-contents .error-label")?.textContent.trim().startsWith("Problem downloading: ") === true, { timeout: 10_000 });
        expect(newTables(a)).toEqual([]);
    });
});

describe("Pasting text into an empty cell", () =>
{
    test("imports it as text: the dialog, then the table, selected", async () =>
    {
        const a = await start();
        const grid = a.mainWindow()!.grid()!.grid;
        await navigator.clipboard.writeText(PEOPLE);
        await keyboardMoveTo(grid, TARGET);
        await userEvent.keyboard("{ControlOrMeta>}v{/ControlOrMeta}");
        await vi.waitUntil(() => cells(".import-dest-grid").length === 3, { timeout: 5000 });
        await ok();
        await vi.waitUntil(() => newTables(a).length === 1, { timeout: 5000 });
        expect(newTables(a)).toEqual(["clipboard"]);
        const display = await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === "clipboard"), { timeout: 5000 });
        expect(display.getPosition().equals(TARGET)).toBe(true);
        await vi.waitUntil(() => grid._test_getSelection()?.getActivateTarget().equals(TARGET) === true, { timeout: 5000 });
    });
});
