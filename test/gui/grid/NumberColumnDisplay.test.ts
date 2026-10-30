// Port of TestNumberColumnDisplay (tests-gui-numbers): numbers in a column are shortened to fit, and
// line up on the decimal point; editing shows the whole number, with the caret where the click was in
// the shortened one; scrolling keeps them in order.  (The layouts are also tested without the GUI, with
// fixed digit widths, in test/gui-logic/stf/CellEntry.test.ts.)
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { nextTick } from "vue";
import { javaTrim } from "../../../src/engine/java/JavaString.js";
import { sleep } from "../base/util.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";
import { numberColumnFile } from "../fixtures/wideTable.js";

const cellElement = (row: number): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-table="Table1"] .row[data-row="${row}"] .cell[data-col="0"]:not(.loading)`);

// Where clicks go in the shortened number (Java: TestNumberColumnDisplay.Target)
const TARGETS = ["FAR_LEFT", "FAR_LEFT_AFTER_MINUS", "INSIDE_LEFT", "INSIDE_RIGHT", "FAR_RIGHT", "MIDDLE"] as const;

// The bounds of the n-th character shown in a cell (Java: _test_getCharacterBoundsOnScreen):
function characterBounds(cell: HTMLElement, n: number): DOMRect
{
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    {
        const length = node.textContent?.length ?? 0;
        if (n < length)
        {
            const range = document.createRange();
            range.setStart(node, n);
            range.setEnd(node, n + 1);
            return range.getBoundingClientRect();
        }
        n -= length;
    }
    throw new Error("Character not on screen: " + n);
}

async function clickAt(element: HTMLElement, x: number, y: number): Promise<void>
{
    const r = element.getBoundingClientRect();
    await userEvent.click(element, { position: { x: x - r.left, y: y - r.top } });
}

async function testNumbers(actualValues: readonly string[], expectedGUI: readonly string[]): Promise<void>
{
    const { grid, unmount } = await renderEngineGrid(numberColumnFile(actualValues));
    try
    {
        await vi.waitUntil(() => actualValues.every((_v, i) => cellElement(i) !== null));
        const cells = actualValues.map((_v, i) => cellElement(i)!);
        expect(cells.map(c => c.textContent)).toEqual(expectedGUI);
        // The right of the lowest integer digit is in the same place in each cell:
        const rightOfLowestIntDigit = cells.map(c => c.querySelector(".stf-number-int")!.getBoundingClientRect().right);
        expect(Math.max(...rightOfLowestIntDigit)).toBeCloseTo(Math.min(...rightOfLowestIntDigit), 0);

        // Check what happens when you click into number to edit:
        const editorText = (): string | undefined => grid.editor()?._test_getGraphicalText();
        for (let i = 0; i < expectedGUI.length; i++)
        {
            // Click, then Enter, to edit:
            await userEvent.click(cellElement(i)!);
            await sleep(200);
            await userEvent.keyboard("{Enter}");
            await vi.waitUntil(() => grid.editor() !== null);
            expect(editorText(), "Row " + i).toEqual(actualValues[i]);
            await userEvent.keyboard("{Escape}");
            await vi.waitUntil(() => grid.editor() === null);
        }

        // Clicking away from the edges is obvious.  For far sides of ellipsis, we do basic thing: click lands
        // on the far side of the digit that the ellipsis directly replaced.
        for (const target of TARGETS)
        {
            for (let i = 0; i < expectedGUI.length; i++)
            {
                const cell = cellElement(i)!;
                const actual = actualValues[i]!;
                // Click twice to edit, so click once now:
                await userEvent.click(cell);
                await sleep(400);
                const gui = expectedGUI[i]!;
                const guiMinusEllipsis = javaTrim(gui.replaceAll("\u2026", "").replaceAll("-", "").replaceAll(". ", ""));

                const posOfCaret = (n: number): { x: number, y: number } =>
                {
                    const curText = cell.textContent!;
                    if (n < curText.length)
                    {
                        const b = characterBounds(cell, n);
                        return { x: b.left, y: b.top + b.height * 0.5 };
                    }
                    else if (n === curText.length)
                    {
                        const b = characterBounds(cell, n - 1);
                        return { x: b.right, y: b.top + b.height * 0.5 };
                    }
                    throw new Error("Character not on screen: " + n);
                };

                // Second click needs to be at target position:
                let clickOnScreenPos: { x: number, y: number };
                let afterIndex: number;
                const nonEllipsisPos = actual.indexOf(guiMinusEllipsis);
                expect(nonEllipsisPos, `Should be able to find minus ellipsis string: "${guiMinusEllipsis}" in "${actual}"`).not.toBe(-1);
                const startsWithMinus = actual.startsWith("-");
                const ellipsisAtStart = gui.startsWith("\u2026") || gui.startsWith("-\u2026");
                switch (target)
                {
                    case "FAR_LEFT":
                        clickOnScreenPos = posOfCaret(0);
                        afterIndex = 0;
                        break;
                    case "FAR_LEFT_AFTER_MINUS":
                        clickOnScreenPos = posOfCaret(startsWithMinus ? 1 : 0);
                        afterIndex = startsWithMinus ? 1 : 0;
                        break;
                    case "INSIDE_LEFT":
                        clickOnScreenPos = posOfCaret(startsWithMinus ? 2 : 1);
                        afterIndex = nonEllipsisPos + (ellipsisAtStart ? 0 : 1);
                        break;
                    case "INSIDE_RIGHT":
                        clickOnScreenPos = posOfCaret(javaTrim(gui).length - (javaTrim(gui).endsWith(".") ? 2 : 1));
                        afterIndex = nonEllipsisPos + guiMinusEllipsis.length + (gui.endsWith("\u2026") ? 0 : -1);
                        break;
                    case "FAR_RIGHT":
                        clickOnScreenPos = posOfCaret(javaTrim(gui).length);
                        if (!gui.endsWith(" "))
                            expect(clickOnScreenPos.x).toBeCloseTo(cell.getBoundingClientRect().right, -1);
                        afterIndex = nonEllipsisPos + guiMinusEllipsis.length + (gui.endsWith("\u2026") ? 1 : 0);
                        break;
                    default: // MIDDLE
                    {
                        const targetPos = Math.floor(javaTrim(gui).length / 2);
                        clickOnScreenPos = posOfCaret(targetPos);
                        afterIndex = targetPos + nonEllipsisPos + (ellipsisAtStart ? -1 : 0) + (startsWithMinus ? -1 : 0);
                        break;
                    }
                }
                await clickAt(cell, clickOnScreenPos.x, clickOnScreenPos.y);
                await vi.waitUntil(() => grid.editor()?.isFocused() === true);
                expect(grid.editor()!.getCaretPosition(), `Clicking ${target} before: "${gui}" after: "${actual}" pos: ${clickOnScreenPos.x},${clickOnScreenPos.y}`).toBe(afterIndex);
                // Double-check cellText while we're here:
                expect(editorText(), "Row " + i).toEqual(actual);

                // Now exit to make sure text goes back:
                await userEvent.keyboard("{Escape}");
                await vi.waitUntil(() => grid.editor() === null);
                await nextTick();
                expect(cellElement(i)?.textContent, "Row " + i).toEqual(expectedGUI[i]);
            }
        }
    }
    finally
    {
        unmount();
    }
}

describe("TestNumberColumnDisplay", () =>
{
    test("testUnaltered", () => testNumbers(["0.1", "1.1", "2.1"], ["0.1", "1.1", "2.1"]));
    test("testNegative", () => testNumbers(["0.1", "-0.1", "2"], ["0.1", "-0.1", "2. "]));
    test("testAllTruncated", () => testNumbers(["0.112233445566778899", "1.112233445566778899", "2.112233445566778899"], ["0.11223344…", "1.11223344…", "2.11223344…"]));
    test("testAllTruncatedNeg", () => testNumbers(["-0.112233445566778899", "1.112233445566778899", "-2.112233445566778899"], ["-0.1122334…", "1.1122334…", "-2.1122334…"]));
    test("testSomeTruncated", () => testNumbers(["0.112233445566778899", "1.112233445", "2.11223344", "3.11223344"], ["0.11223344…", "1.112233445", "2.11223344 ", "3.11223344 "]));
    test("testSomeTruncatedNeg", () => testNumbers(["-0.112233445566778899", "1.112233445", "-2.11223344", "3.112233"], ["-0.1122334…", "1.1122334…", "-2.11223344", "3.112233  "]));
    test("testAllAbbreviated", () => testNumbers(["1234567890", "2234567890", "3234567890"], ["…34567890", "…34567890", "…34567890"]));
    test("testAllAbbreviatedNeg", () => testNumbers(["1234567890", "-2234567890", "3234567890"], ["…34567890", "-…4567890", "…34567890"]));
    test("testSomeAbbreviated", () => testNumbers(["1234567890", "234567890", "34567890"], ["…34567890", "234567890", "34567890"]));
    test("testSomeAbbreviatedNeg", () => testNumbers(["-1234567890", "234567890", "34567890"], ["-…4567890", "234567890", "34567890"]));
    test("testMixedUnaltered", () => testNumbers(["123.456", "2", "0.3456"], ["123.456 ", "2.    ", "0.3456"]));
    test("testBothEnds", () => testNumbers(["1234567890.112233445566778899", "2.3", "3.45", "4.567", "1234567890"], ["…567890.1…", "2.3 ", "3.45", "4.5…", "…567890.  "]));
    test("testBothEndsNeg", () => testNumbers(["-1234567890.112233445566778899", "2.3", "3.45", "-4.567", "1234567890"], ["-…67890.1…", "2.3 ", "3.45", "-4.5…", "…567890.  "]));

    test("testScrollUpDown", async () =>
    {
        // A column of ascending numbers; scroll up and down, and check they are still in order:
        const values = Array.from({ length: 1000 }, (_v, i) => String(i));
        const { scroller, unmount } = await renderEngineGrid(numberColumnFile(values));
        try
        {
            const showing = (): number[] => [...document.querySelectorAll<HTMLElement>('[data-table="Table1"] .row')]
                .sort((a, b) => Number(a.dataset.row) - Number(b.dataset.row))
                .flatMap(row => [...row.querySelectorAll<HTMLElement>(".cell:not(.loading)")].map(c => Number(c.textContent)));
            const checkNumericSorted = (numbers: number[]): void =>
            {
                expect(numbers.length).toBeGreaterThan(0);
                for (let i = 1; i < numbers.length; i++)
                    expect(numbers[i - 1]).toBeLessThan(numbers[i]!);
            };
            await vi.waitUntil(() => showing().length > 0);
            checkNumericSorted(showing());
            for (let i = 0; i < 15; i++)
            {
                // (Java's requestScrollBy(0, 1000) scrolls up)
                scroller.scrollBy({ top: i % 4 === 0 ? -1000 : 1000, behavior: "instant" });
                await new Promise(resolve => setTimeout(resolve, 1000));
                await nextTick();
                checkNumericSorted(showing());
            }
        }
        finally
        {
            unmount();
        }
    }, 60_000);
});
