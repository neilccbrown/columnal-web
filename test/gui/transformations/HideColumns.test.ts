// Port of test.gui.transformation.TestHideColumns (tests-gui-transformations): making a Hide columns
// from the new-table dialog, moving columns to the hidden list, then from its hat showing one again,
// and checking the columns the table shows (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { clickOnItemInBounds, withItemInBounds } from "../base/clickTableLocation.js";
import { push, write } from "../base/keyboard.js";
import { selectGivenListViewItem } from "../base/listUtil.js";
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

const listItem = (columnId: ColumnId) => (option: Element): boolean => option.textContent.trim() === columnId.getRaw();

function getHide(a: RenderedApp): HideColumns
{
    const hide = engineHost(a).tableManager.getAllTables().find(t => t instanceof HideColumns);
    if (hide === undefined)
        throw new Error("No HideColumns found");
    return hide;
}

test("testHideColumns", () => checkProperty([new GenImmediateData({ numTables: { minTables: 1, maxTables: 1 } }), new GenRandom()], async (original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    // Save the table, then open GUI and load it, then add a hide columns transformation
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(original.mgr) }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const src = engineHost(a).tableManager.getAllTables()[0]!;
    const srcRS = src.getData();
    const grid = a.mainWindow()!.grid()!.grid;

    const targetPos = engineHost(a).tableManager.getNextInsertPosition(null);
    await keyboardMoveTo(grid, targetPos);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await scrollTo(await vi.waitUntil(() => document.querySelector(".id-transform-hideColumns")));
    await userEvent.click(document.querySelector(".id-transform-hideColumns")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
    await write(src.getId().getRaw());
    await push("Enter");
    await vi.waitUntil(() => document.querySelector(".shown-columns-list-view") !== null, { timeout: 5000 });

    const toHide: ColumnId[] = [];
    const originalColumnIds = srcRS.getColumnIds();
    let columnIdsLeft = [...originalColumnIds];
    const numToHide = r.nextInt(Math.min(4, columnIdsLeft.length));
    for (let i = 0; i < numToHide; i++)
        toHide.push(columnIdsLeft.splice(r.nextInt(columnIdsLeft.length), 1)[0]!);

    for (const columnId of toHide)
    {
        await selectGivenListViewItem(page.elementLocator(document.querySelector(".shown-columns-list-view")!), listItem(columnId));
        await userEvent.click(document.querySelector(".add-button")!);
    }
    await userEvent.click(document.querySelector(".ok-button")!);
    await sleep(500);

    await vi.waitUntil(() => getHide(a).getHiddenColumns().length === toHide.length, { timeout: 5000 }).catch(() => {});
    expect(new Set(getHide(a).getHiddenColumns().map(c => c.getRaw()))).toEqual(new Set(toHide.map(c => c.getRaw())));

    await checkActualVisibleColumns(a, columnIdsLeft);

    if (toHide.length === 0)
        return;

    // Try editing to unhide a column and check it refreshes:
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".edit-hide-columns")));
    const unHide = toHide.splice(r.nextInt(toHide.length), 1)[0]!;
    await selectGivenListViewItem(page.elementLocator(await vi.waitUntil(() => document.querySelector(".hidden-columns-list-view"))), listItem(unHide));
    await userEvent.click(document.querySelector(".add-button")!);
    await userEvent.click(document.querySelector(".ok-button")!);
    await sleep(500);

    await vi.waitUntil(() => getHide(a).getHiddenColumns().length === toHide.length, { timeout: 5000 }).catch(() => {});
    expect(new Set(getHide(a).getHiddenColumns().map(c => c.getRaw()))).toEqual(new Set(toHide.map(c => c.getRaw())));
    columnIdsLeft = originalColumnIds.filter(c => !toHide.some(h => h.equals(c)));
    await checkActualVisibleColumns(a, columnIdsLeft);
}, { trials: 3 }), 600_000);

async function checkActualVisibleColumns(a: RenderedApp, columnIdsLeft: readonly ColumnId[]): Promise<void>
{
    if (columnIdsLeft.length === 0)
        expect.fail("TODO check for no-columns error");
    const grid = a.mainWindow()!.grid()!.grid;
    for (let i = 0; i < columnIdsLeft.length; i++)
    {
        // (Once the grid shows the remade table)
        const display = await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === getHide(a).getId().getRaw() && d.info.columnNames.length === columnIdsLeft.length));
        const pos = display.getPosition().offsetByRowCols(1, i);
        const columnId = columnIdsLeft[i]!;
        await keyboardMoveTo(grid, pos);
        const { element } = withItemInBounds(".table-display-column-title", grid, new RectangleBounds(pos, pos));
        expect(element.textContent.trim()).toBe(columnId.getRaw());
    }
}
