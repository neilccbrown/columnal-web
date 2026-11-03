// Port of test.gui.TestVirtualGridScrollCoordinates (tests-gui-central): scrolling a grid with a table of
// about 10,000 pixels each way: scrolling is clamped at the edges, scrolling and scrolling back returns
// to the same place, and wheel scrolling moves steadily one way (docs/gui-spec/grid.md).
//
// PORT-NOTE: Java tested its own scrolling (ScrollGroup), with its render offsets
// (checkOffsetsNegative) and smooth-scroll timing; the grid here scrolls natively, so these check the
// scroll container's position instead (to a pixel: the browser rounds it), and there are no offsets to
// check.  Java's floating "topLeft" label at cell (0, 0) is the canvas's top left here.
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, markRaw } from "vue";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { CellSelection } from "../../../src/gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../../src/gui-logic/stf/gui/grid/GridArea.js";
import { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import TableGrid from "../../../src/gui/grid/TableGrid.vue";
import { checkProperty, Generator, type GenerationStatus, type SourceOfRandomness } from "../../support/quickcheck.js";

const ORIGINAL_SCROLL = 5001.0;
// (The browser's scroll positions are whole, or nearly, pixels; Java's were exact)
const TOLERANCE = 1.0;

let scroller: HTMLElement;

class ScrollAmounts
{
    public constructor(public readonly amounts: readonly number[])
    {
    }
}

class GenScrollAmounts extends Generator<ScrollAmounts>
{
    public generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): ScrollAmounts
    {
        const length = 10;
        const amounts: number[] = [];
        for (let i = 0; i < length; i++)
        {
            amounts.push(sourceOfRandomness.nextInt(10) === 0 ? 0.0 : sourceOfRandomness.nextDouble(-1200.0, 1200.0));
        }
        return new ScrollAmounts(amounts);
    }
}

beforeEach(async () =>
{
    const virtualGrid = markRaw(new VirtualGrid(null, 0, 0));
    // Add a huge table which will be roughly 10,000 pixels square:
    // That's about 400 rows, and 100 columns
    virtualGrid.addGridAreas([markRaw(new class extends GridArea
    {
        protected updateKnownRows(): void
        {
        }

        protected recalculateBottomRightIncl(): CellPosition
        {
            return new CellPosition(CellPosition.row(400), CellPosition.col(100));
        }

        public getSelectionForSingleCell(): CellSelection | null
        {
            return null;
        }

        public getSortKey(): string
        {
            return "";
        }
    }())]);

    virtualGrid._test_setColumnWidth(48, 37.0);
    virtualGrid._test_setColumnWidth(50, 106.0);
    virtualGrid._test_setColumnWidth(51, 52.0);
    virtualGrid._test_setColumnWidth(53, 1.0);
    render(defineComponent(() => () => h(TableGrid, { grid: virtualGrid, displays: [], style: "width: 800px; height: 600px" })));
    scroller = document.querySelector<HTMLElement>("[data-testid=grid]")!;
    await new Promise(resolve => requestAnimationFrame(resolve));
});

afterEach(() => cleanup());

// Java: virtualGrid.getScrollGroup().requestScrollBy(x, y): positive moves the content right and
// down, so the scroll position goes the other way
function requestScrollBy(x: number, y: number): void
{
    scroller.scrollBy({ left: -x, top: -y, behavior: "instant" });
}

function scrollXPos(): number
{
    return scroller.scrollLeft;
}

function scrollYPos(): number
{
    return scroller.scrollTop;
}

function checkAtTop(): void
{
    expect(scrollYPos()).toBe(0);
    expect(scroller.querySelector(".grid-canvas")!.getBoundingClientRect().top).toBeCloseTo(scroller.getBoundingClientRect().top, 1);
}

function checkAtLeft(): void
{
    expect(scrollXPos()).toBe(0);
    expect(scroller.querySelector(".grid-canvas")!.getBoundingClientRect().left).toBeCloseTo(scroller.getBoundingClientRect().left, 1);
}

function expectClose(actual: number, expected: number, message?: string): void
{
    expect(Math.abs(actual - expected), (message ?? "") + ` ${actual} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE);
}

test("clampTest", () => checkProperty([new GenScrollAmounts()], (scrollAmounts: ScrollAmounts) =>
{
    // We started at top and left, so what we do is scroll out by half the amount, then attempt to scroll back the full amount, then repeat
    for (const amount of scrollAmounts.amounts)
    {
        requestScrollBy(-Math.abs(amount) / 2.0, 0.0);
        expectClose(scrollXPos(), Math.abs(amount) / 2.0);
        requestScrollBy(Math.abs(amount), 0.0);
        expectClose(scrollXPos(), 0.0);
        checkAtLeft();

        // Now scroll away and then exactly back:
        requestScrollBy(-Math.abs(amount), 0.0);
        expectClose(scrollXPos(), Math.abs(amount));
        requestScrollBy(Math.abs(amount), 0.0);
        expectClose(scrollXPos(), 0.0);
        checkAtLeft();
    }

    for (const amount of scrollAmounts.amounts)
    {
        requestScrollBy(0.0, -Math.abs(amount) / 2.0);
        expectClose(scrollYPos(), Math.abs(amount) / 2.0);
        requestScrollBy(0.0, Math.abs(amount));
        expectClose(scrollYPos(), 0.0);
        checkAtTop();

        // Now scroll away and then exactly back:
        requestScrollBy(0.0, -Math.abs(amount));
        expectClose(scrollYPos(), Math.abs(amount));
        requestScrollBy(0.0, Math.abs(amount));
        expectClose(scrollYPos(), 0.0);
        checkAtTop();
    }

    // Now we need to go to the very bottom/right and try in the other direction:
    requestScrollBy(-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER);

    // We should really calculate these ourselves, rather than trusting the code we are testing...
    const endX = scrollXPos();
    const endY = scrollYPos();
    expect(endX).toBeGreaterThan(5000);
    expect(endY).toBeGreaterThan(5000);

    for (const amount of scrollAmounts.amounts)
    {
        requestScrollBy(Math.abs(amount) / 2.0, 0.0);
        expectClose(scrollXPos(), endX - Math.abs(amount) / 2.0);
        requestScrollBy(-Math.abs(amount), 0.0);
        expectClose(scrollXPos(), endX);
    }

    for (const amount of scrollAmounts.amounts)
    {
        requestScrollBy(0.0, Math.abs(amount) / 2.0);
        expectClose(scrollYPos(), endY - Math.abs(amount) / 2.0);
        requestScrollBy(0.0, -Math.abs(amount));
        expectClose(scrollYPos(), endY);
    }
    // (Back to the start for the next trial, as Java's grid was made once for the test)
    requestScrollBy(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}, { trials: 5 }));

test("scrollXYBy", () => checkProperty([new GenScrollAmounts(), new GenScrollAmounts()], async (scrollX: ScrollAmounts, scrollY: ScrollAmounts) =>
{
    // Scroll to the middle to begin with so we don't get clamped:
    requestScrollBy(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    requestScrollBy(-ORIGINAL_SCROLL, -ORIGINAL_SCROLL);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check window has sized properly:
    expect(scroller.clientHeight).toBeGreaterThanOrEqual(500.0);
    expect(scroller.clientWidth).toBeGreaterThanOrEqual(700.0);

    // We check with and without delay to try with/without smooth scrolling and jumping (Java's scroll
    // time was 300 ms; the browser's scrolling here is immediate):
    for (const delay of [0, 300])
    {
        expectClose(scrollXPos(), ORIGINAL_SCROLL);
        // Test that scroll and scroll back works:
        for (const amount of scrollX.amounts)
        {
            requestScrollBy(amount, 0.0);
            await new Promise(resolve => setTimeout(resolve, delay));
            expectClose(scrollXPos(), ORIGINAL_SCROLL - amount, "Scrolling " + amount);
            requestScrollBy(-amount, 0.0);
            await new Promise(resolve => setTimeout(resolve, delay));
            expectClose(scrollXPos(), ORIGINAL_SCROLL, "Scrolling " + (-amount));
        }

        expectClose(scrollYPos(), ORIGINAL_SCROLL);
        // Test that scroll and scroll back works.  (As Java has it: the Y amounts scroll sideways,
        // and the Y position is checked after scrolling back)
        for (const amount of scrollY.amounts)
        {
            requestScrollBy(amount, 0.0);
            await new Promise(resolve => setTimeout(resolve, delay));
            expectClose(scrollXPos(), ORIGINAL_SCROLL - amount);
            requestScrollBy(-amount, 0.0);
            await new Promise(resolve => setTimeout(resolve, delay));
            expectClose(scrollYPos(), ORIGINAL_SCROLL);
        }
    }
}, { trials: 5 }), 120_000);

test("testSmoothScrollMonotonic", async () =>
{
    // Down twice, back up to the top twice, each separate:
    await testMonotonicScroll(true);
    await testMonotonicScroll(true);
    await testMonotonicScroll(false);
    await testMonotonicScroll(false);

    // Up to nothing, then down, each separate:
    await testMonotonicScroll(false);
    await testMonotonicScroll(true);

    // We are one from top.  Now scroll thrice up in quick succession:
    await testMonotonicScroll(false, false, false);
}, 60_000);

// Java: moves the mouse over a cell, and records where it is each frame while scrolling with the wheel
// (three notches each time; "document up" is the content moving up, scrolling down)
async function testMonotonicScroll(...scrollDocumentUp: boolean[]): Promise<void>
{
    const yCoords: number[] = [];
    let recording = true;
    const record = (): void =>
    {
        yCoords.push(scroller.querySelector(".grid-canvas")!.getBoundingClientRect().top);
        if (recording)
            requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
    try
    {
        for (const up of scrollDocumentUp)
            await userEvent.wheel(scroller, { direction: up ? "down" : "up", times: 3 });
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
    finally
    {
        recording = false;
    }
    // Check that list is sorted:
    for (let i = 0; i < yCoords.length - 1; i++)
    {
        if (scrollDocumentUp[0])
            expect(yCoords[i]!).toBeGreaterThanOrEqual(yCoords[i + 1]!);
        else
            expect(yCoords[i]!).toBeLessThanOrEqual(yCoords[i + 1]!);
    }
}
