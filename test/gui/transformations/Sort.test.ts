// Port of test.gui.transformation.TestSort (tests-gui-transformations): making a Sort from the new-table
// dialog, entering its columns (typed, each with its direction), and checking the values it gives are
// in order (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import type { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { copyToClipboard, recordsOnClipboard } from "../base/clipboard.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo, scrollTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const centre = (selector: string): { x: number, y: number } =>
{
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

test("propSort", () => checkProperty([new GenImmediateData({ canHaveErrorValues: true }), new GenRandom()], async (original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    // Save the table, then open GUI and load it, then add a sort transformation
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(original.mgr) }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const grid = a.mainWindow()!.grid()!.grid;
    const targetPos = engineHost(a).tableManager.getNextInsertPosition(null);
    await keyboardMoveTo(grid, targetPos);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-sort")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
    await write(original.dataFirst().getId().getRaw());
    await push("Enter");
    // (Once the engine has given what the dialog needs, with a column to edit)
    await vi.waitUntil(() => document.activeElement?.classList.contains("sort-column-field") === true, { timeout: 5000 });
    // Then enter sort information.
    // Find random column (s):
    const allColumns = original.dataFirst().getData().getColumns();
    // Pick a random subset:
    const pickFrom = [...allColumns];
    const pickedColumns: Pair<ColumnId, Sort.Direction>[] = [];
    do
    {
        pickedColumns.push(new Pair(pickFrom.splice(r.nextInt(pickFrom.length), 1)[0]!.getName(), Sort.Direction.values()[r.nextInt(Sort.Direction.values().length)]!));
    }
    while (r.nextInt(2) === 1 && pickFrom.length > 0);

    let prevFocus: Element | null = null;
    let needToAdd = false;
    for (const pickedColumn of pickedColumns)
    {
        if (needToAdd)
        {
            await scrollTo(document.querySelector(".id-fancylist-add")!);
            await moveAndDismissPopupsAtPos(centre(".id-fancylist-add"));
            await userEvent.click(document.querySelector(".id-fancylist-add")!);
            await sleep(300);
        }
        needToAdd = true;
        const focused = await vi.waitUntil(() => document.activeElement instanceof HTMLInputElement && document.activeElement !== prevFocus ? document.activeElement : null);
        prevFocus = focused;

        await write(pickedColumn.getFirst().getRaw());
        // All columns start ascending.  We click n * 2 times, + 1 if descending
        const numClicks = 2 * r.nextInt(3) + (pickedColumn.getSecond() === Sort.Direction.DESCENDING ? 1 : 0);
        // Bit of a hack to find the matching button
        const button = focused.closest(".sort-pane")!.querySelector<HTMLElement>(".sort-direction-button")!;
        for (let i = 0; i < numClicks; i++)
        {
            await userEvent.click(button);
            await sleep(400);
        }
    }

    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);

    await sleep(500);
    const sort = await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find((t): t is Sort => t instanceof Sort && t.getSortBy().length > 0), { timeout: 5000 });
    expect(sort.getSortBy().map(p => p.getFirst().getRaw() + " " + p.getSecond().name())).toEqual(pickedColumns.map(p => p.getFirst().getRaw() + " " + p.getSecond().name()));

    await copyToClipboard(async () =>
    {
        // Now check output values by getting them from clipboard:
        await userEvent.click(document.querySelector<HTMLElement>(".table-display-table-title.transformation-table-title")!, { button: "right", position: { x: 2, y: 5 } });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-copyValues")));
    });

    const clip = ClipboardUtils.loadValuesFromClipboard(original.mgr.getTypeManager(), await recordsOnClipboard());
    expect(clip).not.toBeNull();
    const sorted: Map<string, Either<string, Value>>[] = [];
    const length = original.dataFirst().getData().getLength();
    for (let i = 0; i < length; i++)
        sorted.push(new Map(clip!.map(c => [c.columnName!.getRaw(), c.dataValues[i]!])));
    checkSorted(length, pickedColumns, sorted);
}, { trials: 10 }), 600_000);

function checkSorted(length: number, sortBy: readonly Pair<ColumnId, Sort.Direction>[], actual: readonly Map<string, Either<string, Value>>[]): void
{
    // No point checking order if 1 row or less:
    if (length > 1)
    {
        // Need to check that items are in the right order:
        let prev = actual[0]!;
        for (let i = 1; i < length; i++)
        {
            const cur = actual[i]!;

            for (const pickedColumn of sortBy)
            {
                const prevVal = TBasicUtil.checkNonNull(prev.get(pickedColumn.getFirst().getRaw()));
                const curVal = TBasicUtil.checkNonNull(cur.get(pickedColumn.getFirst().getRaw()));
                // If both errors, sort by error text:
                if (prevVal.isLeft() && curVal.isLeft())
                {
                    expect(prevVal.getLeft("prev") <= curVal.getLeft("cur")).toBe(true);
                    if (!prevVal.equals(curVal))
                        break; // Don't check other columns
                }
                else if (prevVal.isRight() && curVal.isRight())
                {
                    const actualComparison = Utility.compareValues(prevVal.getRight("prev"), curVal.getRight("cur"));
                    // For equals (i.e. zero) results, there's nothing to check (valid for ASC and DESC)
                    // and we continue on to compare the next column:
                    if (actualComparison !== 0)
                    {
                        // For non-zero, check it is in right direction and break:
                        if (pickedColumn.getSecond() === Sort.Direction.ASCENDING)
                            expect(actualComparison).toBeLessThan(0);
                        else
                            expect(actualComparison).toBeGreaterThan(0);
                        break;
                    }
                }
                else
                {
                    // A mix of left and right
                    // Left should always be first, regardless
                    expect(prevVal.isLeft()).toBe(true);
                    expect(curVal.isLeft()).toBe(false);
                    break;
                }
            }

            prev = cur;
        }
    }
}
