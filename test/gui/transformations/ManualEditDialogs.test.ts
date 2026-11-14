// Manual Edit and the "=" guidance (docs/gui-spec/transformations.md, tables.md), beyond the port of
// TestManualEdit: the question when a transformation's cell is edited, the identifier dialog (cancelled,
// from the hat, a column clicked in the grid, a column not found), the entries dialog, and the guidance
// on making a Calculate when a data cell's text starts with "=".
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ManualEdit } from "../../../src/engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveToTableCell } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { at, centre, closeStarted, columnHeader, columnId, hatPart, pickAt, settled, start, tableId } from "./fixtures.js";

afterEach(closeStarted);

const manualEdits = (a: RenderedApp): ManualEdit[] => engineHost(a).tableManager.getAllTables().filter((t): t is ManualEdit => t instanceof ManualEdit);
const display = (a: RenderedApp, id: string): GridTableDisplay => a.mainWindow()!.grid()!.displays().find(d => d.info.id === id)!;
const alertHeader = (): string | null => document.querySelector(".alert-header")?.textContent.trim() ?? null;

// T, U, and S (a Sort of T by A)
const withSort = (): Promise<RenderedApp> => start(mgr => mgr.record(new Sort(mgr, at("S", 1, 10), tableId("T"), [new Pair(columnId("A"), Sort.Direction.ASCENDING)])));

// Edits S's first cell (A: 1) to 5, then waits for the question
async function editSortCell(a: RenderedApp): Promise<void>
{
    await keyboardMoveToTableCell(a.mainWindow()!.grid()!.grid, display(a, "S"), 0, 0);
    await push("Enter");
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
    await write("5");
    await push("Enter");
    await vi.waitUntil(() => alertHeader() === "Create edit transformation?", { timeout: 5000 });
}

describe("Editing a transformation's cell", () =>
{
    test("asks whether to make a Manual Edit; Cancel makes none, and the cell is as it was", async () =>
    {
        const a = await withSort();
        await editSortCell(a);
        expect(document.querySelector(".alert-message")?.textContent).toContain("Transformation results cannot be directly edited.");
        expect([...document.querySelectorAll(".alert-header ~ * button, .light-dialog-buttons button")].map(b => b.textContent.trim())).toContain("Yes");
        await userEvent.click(document.querySelector(".cancel-button")!);
        await settled(a);
        expect(manualEdits(a)).toEqual([]);
        expect(display(a, "S").getCell(0, 0)?.text).toBe("1");
    });

    test("Yes makes one with the edit, to the right, then asks how rows are identified; cancelled, it's removed", async () =>
    {
        const a = await withSort();
        await editSortCell(a);
        await userEvent.click(document.querySelector(".yes-button")!);
        // (By column, blank, focused)
        await vi.waitUntil(() => document.activeElement?.classList.contains("manual-edit-column-field") === true, { timeout: 5000 });
        expect(document.querySelector<HTMLInputElement>(".id-manual-edit-bycolumn")!.checked).toBe(true);
        const made = manualEdits(a)[0]!;
        expect(made.getSrcTableId().getRaw()).toBe("S");
        expect(made.getReplacementCount()).toBe(1);
        await userEvent.click(document.querySelector(".cancel-button")!);
        await vi.waitUntil(() => manualEdits(a).length === 0, { timeout: 5000 });
    });

    test("Yes, then a column clicked in the grid identifies the rows, and names it", async () =>
    {
        const a = await withSort();
        await editSortCell(a);
        await userEvent.click(document.querySelector(".yes-button")!);
        await vi.waitUntil(() => document.activeElement?.classList.contains("manual-edit-column-field") === true, { timeout: 5000 });
        // Not one that isn't a column:
        await write("Q");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => document.querySelector(".error-label")?.textContent.includes("Column not found: Q") === true);
        await pickAt(columnHeader("S", "B"));
        await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".manual-edit-column-field")?.value === "B");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => manualEdits(a)[0]?.getReplacementIdentifier()?.getRaw() === "B", { timeout: 5000 });
        expect(manualEdits(a)[0]!.getId().getRaw()).toBe("Edit by B");
        await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().some(d => d.info.id === "Edit by B"), { timeout: 5000 });
    });
});

describe("A Manual Edit's hat", () =>
{
    // S's Manual Edit, by row number, with S's A at rows 0 and 1 replaced
    const withManualEdit = async (): Promise<RenderedApp> =>
    {
        const a = await withSort();
        await editSortCell(a);
        await userEvent.click(document.querySelector(".yes-button")!);
        await vi.waitUntil(() => document.querySelector(".id-manual-edit-byrownum") !== null, { timeout: 5000 });
        await userEvent.click(document.querySelector(".id-manual-edit-byrownum")!);
        expect(document.querySelector<HTMLInputElement>(".manual-edit-column-field")!.disabled).toBe(true);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => manualEdits(a)[0]?.getId().getRaw() === "Edit by row", { timeout: 5000 });
        await settled(a);
        await keyboardMoveToTableCell(a.mainWindow()!.grid()!.grid, display(a, "Edit by row"), 1, 0);
        await push("Enter");
        await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
        await write("7");
        await push("Enter");
        await vi.waitUntil(() => manualEdits(a)[0]?.getReplacementCount() === 2, { timeout: 5000 });
        await settled(a);
        return a;
    };

    test("its entries: links to them; deleting them all, \"No edits\"", async () =>
    {
        const a = await withManualEdit();
        const entries = (): string[] => [...document.querySelectorAll(".manual-edit-entries-dialog .fancy-list-cell")].map(c => [...c.querySelectorAll(".jump-to-link")].map(l => l.textContent.trim()).join("|"));
        const openEntries = async (): Promise<void> =>
        {
            (await vi.waitUntil(() => document.querySelector<HTMLElement>('.table-hat[data-table="Edit by row"] .manual-edit-entries'))).click();
            await vi.waitUntil(() => document.querySelector(".manual-edit-entries-dialog") !== null, { timeout: 5000 });
        };
        await openEntries();
        expect(entries()).toEqual(["0|A|5", "1|A|7"]);

        // Deleting the first, then clicking the second, goes to it:
        await userEvent.click(document.querySelector(".manual-edit-entries-dialog .fancy-list-cell .small-delete")!);
        await vi.waitUntil(() => entries().length === 1, { timeout: 5000 });
        await userEvent.click(document.querySelector<HTMLElement>(".jump-to-link")!);
        await vi.waitUntil(() => manualEdits(a)[0]?.getReplacementCount() === 1, { timeout: 5000 });
        const d = display(a, "Edit by row");
        await vi.waitUntil(() => a.mainWindow()!.grid()!.grid._test_getSelection()?.getActivateTarget().equals(d.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + 1, 0)) === true, { timeout: 5000 });

        // Deleting the last; then there are none:
        await openEntries();
        await userEvent.click(document.querySelector(".manual-edit-entries-dialog .fancy-list-cell .small-delete")!);
        await vi.waitUntil(() => document.querySelector(".manual-edit-entries-empty")?.textContent === "No edits", { timeout: 5000 });
        await userEvent.click(document.querySelector(".close-button")!);
        await vi.waitUntil(() => manualEdits(a)[0]?.getReplacementCount() === 0, { timeout: 5000 });
    });

    test("its identifier: starting as it is (by row number); changed to a column, its automatic name follows", async () =>
    {
        const a = await withManualEdit();
        await userEvent.click(await vi.waitUntil(() => hatPart("Edit by row", "row number")));
        await vi.waitUntil(() => document.querySelector(".id-manual-edit-byrownum") !== null, { timeout: 5000 });
        expect(document.querySelector<HTMLInputElement>(".id-manual-edit-byrownum")!.checked).toBe(true);
        await userEvent.click(document.querySelector(".id-manual-edit-bycolumn")!);
        await push("Tab");
        await write("B");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => manualEdits(a)[0]?.getId().getRaw() === "Edit by B", { timeout: 5000 });
    });
});

describe("Typing \"=\" in a data cell", () =>
{
    const guidanceText = (): string | null => document.querySelector(".guidance-content")?.textContent.trim() ?? null;

    test("shows the guidance on making a Calculate, step by step, until the column's dialog closes", async () =>
    {
        const a = await start();
        const grid = a.mainWindow()!.grid()!.grid;
        await keyboardMoveToTableCell(grid, display(a, "T"), 0, 1);
        await write("=");
        await vi.waitUntil(() => guidanceText() === "Data tables cannot contain formulas.  To perform a calculation, create a Calculate transformation.", { timeout: 5000 });
        await push("Escape");
        await userEvent.click(document.querySelector(".id-guidance-show-me")!);
        await vi.waitUntil(() => guidanceText() === "To create a transformation, click on an empty cell.");
        grid._test_keyboardMoveTo(new CellPosition(CellPosition.row(8), CellPosition.col(1)));
        await vi.waitUntil(() => guidanceText() === "Click the New... button.", { timeout: 5000 });
        // (The button outlined)
        await vi.waitUntil(() => document.querySelector(".guidance-highlight") !== null);
        await userEvent.keyboard("{Enter}");
        await vi.waitUntil(() => guidanceText() === "Click the Transform button.", { timeout: 5000 });
        await userEvent.click(document.querySelector(".id-new-transform")!);
        await vi.waitUntil(() => guidanceText() === "Click the Calculate button.", { timeout: 5000 });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
        await vi.waitUntil(() => guidanceText() === "Click on the table you want to use in the calculation", { timeout: 5000 });
        await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
        await write("T");
        await push("Enter");
        await vi.waitUntil(() => guidanceText() === "Enter the column name and expression you want to calculate, then click Ok.", { timeout: 5000 });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".cancel-button")));
        await vi.waitUntil(() => guidanceText() === null, { timeout: 5000 });
    });

    test("once per edit; Close closes it", async () =>
    {
        const a = await start();
        await keyboardMoveToTableCell(a.mainWindow()!.grid()!.grid, display(a, "T"), 0, 1);
        await write("=");
        await vi.waitUntil(() => guidanceText() !== null, { timeout: 5000 });
        await userEvent.click(document.querySelector(".guidance-root .id-close")!);
        await vi.waitUntil(() => guidanceText() === null);
        // (Typing on, it doesn't show again)
        await write("1");
        await sleep(300);
        expect(guidanceText()).toBeNull();
    });
});
