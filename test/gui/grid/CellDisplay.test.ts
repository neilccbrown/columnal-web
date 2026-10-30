// How cells show each kind of value, invalid values and errors, and copying (docs/gui-spec/grid.md).
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { isMac } from "../../../src/gui/shortcuts.js";
import { copyToClipboard } from "../base/clipboard.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";
import { KINDS_FIXTURE } from "../fixtures/kindsFixture.js";

const cell = (table: string, row: number, column: number) =>
    document.querySelector<HTMLElement>(`[data-table="${table}"] .row[data-row="${row}"] .cell[data-col="${column}"]`)!;
// The cell's text parts, with their style classes:
const parts = (c: HTMLElement) => [...c.querySelectorAll("span")].map(s => [s.className, s.textContent]);

describe("cell display", () =>
{
    it("shows each kind of value as its text, with numbers laid out by the formatter", async () =>
    {
        await renderEngineGrid(KINDS_FIXTURE, 1400);
        await expect.poll(() => cell("K", 0, 0)?.classList.contains("loading")).toBe(false);
        expect(parts(cell("K", 0, 0))).toEqual([["stf-number-int", "1"], ["stf-number-dot", "."], ["stf-number-frac", "5"]]);
        expect(cell("K", 0, 0).classList.contains("align-right")).toBe(true);
        expect(cell("K", 0, 1).textContent).toBe("\"a b\"");
        expect(cell("K", 0, 2).textContent).toBe("true");
        expect(cell("K", 0, 3).textContent).toBe("2021-03-04");
        expect(cell("K", 0, 1).classList.contains("stf-cell-text")).toBe(true);
        expect(cell("K", 0, 3).classList.contains("stf-cell-datetime")).toBe(true);
    });

    it("marks an invalid value where its error is, and shows errors", async () =>
    {
        await renderEngineGrid(KINDS_FIXTURE, 1400);
        await expect.poll(() => cell("E", 1, 4)?.classList.contains("loading")).toBe(false);
        expect(parts(cell("K", 1, 0))).toEqual([["", "12"], ["input-error", "x"], ["", ""]]);
        expect(cell("K", 1, 0).classList.contains("has-error")).toBe(true);
        expect(cell("K", 0, 0).classList.contains("has-error")).toBe(false);
        expect(cell("E", 1, 4).textContent).toBe("ERR: List index 5 out of bounds, should be between 1 and 1 (inclusive)");
        expect(cell("E", 1, 4).classList.contains("has-error")).toBe(true);
    });

    it("copies the selected cells with Ctrl/Cmd+C, and an entire table with F11", async () =>
    {
        const { grid } = await renderEngineGrid(KINDS_FIXTURE, 1400);
        const vg = grid.grid;
        const at = (row: number, column: number) => ({ x: vg.sumColumnWidths(0, column) + 30, y: row * 24 + 12 });
        await userEvent.click(page.getByTestId("grid"), { position: at(4, 1) });
        await userEvent.click(page.getByTestId("grid"), { position: at(5, 2), modifiers: ["Shift"] });
        expect(await copyToClipboard(() => userEvent.keyboard(isMac() ? "{Meta>}c{/Meta}" : "{Control>}c{/Control}")))
            .toBe("1.5, \"a b\"\n@INVALID\"12x\", \"c\"");
        // The table name row selects the entire table:
        await userEvent.click(page.getByTestId("grid"), { position: at(1, 1) });
        expect(await copyToClipboard()).toBe("1.5, \"a b\", true, 2021-03-04\n@INVALID\"12x\", \"c\", false, 1999-12-31");
    });
});
