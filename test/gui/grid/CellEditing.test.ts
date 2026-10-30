// Editing cells in the grid (docs/gui-spec/cell-editor.md): how an edit starts and ends, the tables
// that depend on the edited one being re-run, and errors from storing a value.
import { describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { isMac } from "../../../src/gui/shortcuts.js";
import { showAlert } from "../../../src/gui/grid/alerts.js";
import type { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { keyboardMoveToTableCell } from "../base/scrollTo.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";

// A data table K with a number column N, and a Calculate D (beside it) that doubles N:
const DEPENDENT_FIXTURE = `COLUMNAL
VERSION 3

DATA @BEGIN TAB
TAB "K"
TAB FORMAT @BEGIN
TAB @COLUMN N @TYPE Number @DEFAULT 0
TAB @END FORMAT
TAB VALUES @BEGIN
TAB   1
TAB   2
TAB @END VALUES
TAB DISPLAY @BEGIN
TAB POSITION 1 1
TAB SHOWCOLUMNS ALL
TAB @END DISPLAY
@END TAB DATA

TRANSFORMATION @BEGIN CAL
CAL "D"
CAL calculate
CAL SOURCE "K"
CAL @BEGIN
CAL CALCULATE Double @EXPRESSION column\\\\N * 2
CAL @END
CAL DISPLAY @BEGIN
CAL POSITION 4 1
CAL SHOWCOLUMNS ALL
CAL @END DISPLAY
@END CAL TRANSFORMATION
`;

const selectAll = (): Promise<void> => userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");

async function open()
{
    const rendered = await renderEngineGrid(DEPENDENT_FIXTURE);
    rendered.scroller.focus();
    const display = (id: string): GridTableDisplay => rendered.grid.displays().find(d => d.info.id === id)!;
    // The cell's text, once it has arrived:
    const text = (id: string, row: number, column: number): string | undefined => display(id).getCell(row, column)?.text;
    return { ...rendered, display, text };
}

describe("Editing cells", () =>
{
    test("typing starts editing, and Enter stores the value, selects the cell below, and re-runs the dependent table", async () =>
    {
        const { grid, display, text, unmount } = await open();
        try
        {
            const pos = await keyboardMoveToTableCell(grid.grid, display("K"), 0, 0);
            await userEvent.keyboard("5");
            expect(grid.editor()?._test_getGraphicalText()).toBe("5");
            await userEvent.keyboard("{Enter}");
            await vi.waitUntil(() => text("K", 0, 0) === "5");
            expect(grid.grid.getSelection()?.isExactly(pos.offsetByRowCols(1, 0))).toBe(true);
            expect(grid.editor()).toBeNull();
            // D's Double column (after its copy of N):
            await vi.waitUntil(() => text("D", 0, 1) === "10");
            expect(text("D", 0, 0)).toBe("5");
            expect(text("D", 1, 1)).toBe("4");
        }
        finally
        {
            unmount();
        }
    });

    test("Tab stores and keeps the cell selected; Escape goes back; clicking away stores", async () =>
    {
        const { grid, display, text, unmount } = await open();
        try
        {
            const pos = await keyboardMoveToTableCell(grid.grid, display("K"), 1, 0);
            await userEvent.keyboard("{Enter}");
            await selectAll();
            await userEvent.keyboard("7{Tab}");
            await vi.waitUntil(() => text("K", 1, 0) === "7");
            expect(grid.grid.getSelection()?.isExactly(pos)).toBe(true);

            await userEvent.keyboard("{Enter}8{Escape}");
            expect(grid.editor()).toBeNull();
            expect(grid.grid.getSelection()?.isExactly(pos)).toBe(true);
            await new Promise(resolve => setTimeout(resolve, 200));
            expect(text("K", 1, 0)).toBe("7");

            await userEvent.keyboard("{Enter}");
            await selectAll();
            await userEvent.keyboard("9");
            // Click an empty cell, well away from the editor:
            await userEvent.click(page.getByTestId("grid"), { position: { x: 700, y: 400 } });
            await vi.waitUntil(() => text("K", 1, 0) === "9");
            expect(grid.editor()).toBeNull();
        }
        finally
        {
            unmount();
        }
    });

    test("editing a transformation's cell leaves it as it was", async () =>
    {
        const { grid, display, text, unmount } = await open();
        try
        {
            // D's copy of N counts as editable (as in Java), but a transformation refuses the value:
            expect(display("D").info.columnEditable[0]).toBe(true);
            await keyboardMoveToTableCell(grid.grid, display("D"), 0, 0);
            await userEvent.keyboard("3{Enter}");
            await vi.waitUntil(() => grid.editor() === null);
            await new Promise(resolve => setTimeout(resolve, 200));
            expect(text("D", 0, 0)).toBe("1");
            expect(text("K", 0, 0)).toBe("1");
        }
        finally
        {
            unmount();
        }
    });

    test("errors are shown in an alert, one at a time", async () =>
    {
        const { unmount } = await open();
        try
        {
            let closed = 0;
            showAlert({ title: "First title", message: "First message", afterClose: () => closed++ });
            showAlert({ title: "Second title", message: "Second message" });
            await expect.element(page.getByText("First message")).toBeVisible();
            await userEvent.click(page.getByRole("button", { name: "OK" }));
            expect(closed).toBe(1);
            await expect.element(page.getByText("Second message")).toBeVisible();
            await userEvent.keyboard("{Escape}");
            await expect.element(page.getByText("Second message")).not.toBeInTheDocument();
        }
        finally
        {
            unmount();
        }
    });
});
