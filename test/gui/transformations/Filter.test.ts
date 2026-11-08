// Port of test.gui.transformation.TestFilter (tests-gui-transformations): making a Filter from the
// new-table dialog (its source picked by typing its name), entering its expression, and checking the
// values it keeps (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ComparisonExpression } from "../../../src/engine/expressions/transformations/expression/ComparisonExpression.js";
import { IdentExpression, NumericLiteral } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { recordsOnClipboard } from "../base/clipboard.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
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

test("propNumberFilter", () => checkProperty([new GenImmediateData({ numTables: { maxTables: 1 }, mustIncludeNumber: true }), new GenRandom()], async (original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    // Save the table, then open GUI and load it, then add a filter transformation (rename to keeprows)
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(original.mgr) }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const grid = a.mainWindow()!.grid()!.grid;
    const targetPos = engineHost(a).tableManager.getNextInsertPosition(null);
    await keyboardMoveTo(grid, targetPos);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-filter")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
    await write(original.dataFirst().getId().getRaw());
    await push("Enter");
    // (Once the engine has given what the dialog needs, and the expression is selected)
    await vi.waitUntil(() => document.activeElement?.closest(".expression-editor") !== null, { timeout: 5000 });
    // Then enter filter condition.
    // Find numeric column:
    const srcColumn = original.dataFirst().getData().getColumns().find(c => DataTypeUtility.isNumber(c.getType().getType()));
    if (srcColumn === undefined)
        throw new Error("No numeric column");
    // Pick arbitrary value as cut-off:
    const cutOff: Decimal = srcColumn.getLength() === 0 ? new Decimal(42) : Utility.cast(srcColumn.getType().getCollapsed(r.nextInt(srcColumn.getLength())), Decimal);

    await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
    await push("Delete");
    // Select column in auto complete:
    await write(srcColumn.getName().getRaw());
    await push("Tab");
    await write(">");
    await write(DataTypeUtility._test_valueToString(cutOff));
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);

    // Now check output values by getting them from clipboard:
    await sleep(500);
    const filterTitle = await vi.waitUntil(() => document.querySelector<HTMLElement>(".table-display-table-title.transformation-table-title"));
    await navigator.clipboard.writeText("");
    await userEvent.click(filterTitle, { button: "right", position: { x: 2, y: 5 } });
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-copyValues")));
    await sleep(1000);

    const expectedCmp = new ComparisonExpression([IdentExpression.column(srcColumn.getName()), new NumericLiteral(cutOff, null)], [ComparisonExpression.ComparisonOperator.GREATER_THAN]);
    const filter = engineHost(a).tableManager.getAllTables().find(t => t instanceof Filter);
    expect(filter?.getFilterExpression().toString()).toEqual(expectedCmp.toString());
    expect(filter?.getFilterExpression().equals(expectedCmp)).toBe(true);

    const clip = ClipboardUtils.loadValuesFromClipboard(original.mgr.getTypeManager(), await recordsOnClipboard());
    expect(clip).not.toBeNull();
    // Need to fish out first column from clip, then compare item:
    const expected: Either<string, Value>[] = [];
    for (let i = 0; i < srcColumn.getLength(); i++)
    {
        const x = Utility.cast(srcColumn.getType().getCollapsed(i), Decimal);
        if (Utility.compareNumbers(x, cutOff) > 0)
            expected.push(Either.right(x));
    }
    TBasicUtil.assertValueListEitherEqual("Filtered", expected, clip!.find(c => c.columnName !== null && c.columnName.equals(srcColumn.getName()))?.dataValues ?? null);
}, { trials: 10 }), 300_000);
