// The table window (src/gui/grid/gridWindow.ts): small scrolls keep it, large ones move it.
import { describe, expect, test } from "vitest";
import { EMPTY_WINDOW, tableWindow, type WindowInputs } from "../../../src/gui/grid/gridWindow.js";

const inputs = (viewLeft: number, viewTop: number): WindowInputs => ({
    dataTop: 3 * 24, rows: 400, rowHeight: 24, blockSize: 16,
    columnLefts: Array.from({ length: 50 }, (_, i) => 20 + i * 100), right: 5020,
    viewLeft, viewTop, viewWidth: 810, viewHeight: 600,
});

describe("tableWindow", () =>
{
    test("covers what is in view, plus a margin", () =>
    {
        expect(tableWindow(EMPTY_WINDOW, inputs(0, 0))).toEqual({ firstBlock: 0, lastBlockExcl: 3, firstColumn: 0, lastColumnExcl: 10 });
    });

    test("stays for small and medium scrolls, and moves once each way for large ones", () =>
    {
        const start = tableWindow(EMPTY_WINDOW, inputs(0, 0));
        for (const by of [1, 100])
            expect(tableWindow(start, inputs(by, by))).toBe(start);
        const far = tableWindow(start, inputs(1000, 1000));
        expect(far).not.toBe(start);
        expect(tableWindow(far, inputs(1000, 1000))).toBe(far);
        expect(tableWindow(far, inputs(0, 0))).not.toBe(far);
    });

    test("is empty when the table is out of view", () =>
    {
        expect(tableWindow(EMPTY_WINDOW, { ...inputs(0, 20000) })).toBe(EMPTY_WINDOW);
        expect(tableWindow(EMPTY_WINDOW, { ...inputs(6000, 0) })).toBe(EMPTY_WINDOW);
    });
});
