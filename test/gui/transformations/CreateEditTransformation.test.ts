// Port of test.gui.transformation.TestCreateEditTransformation (tests-gui-transformations-create-edit):
// making an Aggregate through the GUI (its first column and split in the new Aggregate's dialog, the rest
// from its add-column arrows) and checking its values; and making a Check, checking its result
// (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { CallExpression, EqualExpression, IdentExpression, ImplicitLambdaArg, NumericLiteral, type Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../../src/engine/utility/utility/IdentifierUtility.js";
import { ListExList, Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenTypeAndValueGen } from "../../engine/tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { clickOnItemInBounds, withItemInBounds } from "../base/clickTableLocation.js";
import { copyToClipboard, recordsOnClipboard } from "../base/clipboard.js";
import { selectGivenComboBoxItem } from "../base/comboUtil.js";
import { ColumnDetails, createDataTable } from "../base/createDataTable.js";
import { enterExpression, EntryBracketStatus } from "../base/enterExpression.js";
import { checkDialogFocused } from "../base/focusOwner.js";
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

class AggCalculation
{
    // expectedResult: one per split value.  If null, UserException expected
    public constructor(public readonly columnName: ColumnId, public readonly expression: Expression, public readonly dataType: DataType, public readonly expectedResult: readonly (Value | null)[])
    {
    }
}

// One instance per source column
class AggColumns
{
    public constructor(public readonly sourceColumn: ColumnDetails, public readonly calculations: readonly AggCalculation[])
    {
    }
}

test("testAggregate", () => checkProperty([new GenRandom()], async (r: JavaRandom) =>
{
    const genTypeAndValueGen = new GenTypeAndValueGen(false);

    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "blank", content: "" }], 0);
    await waitForLoaded();
    const mgr = engineHost(a).tableManager;
    const grid = a.mainWindow()!.grid()!.grid;

    let columns: ColumnDetails[] = [];
    // First add split variable:
    const splitType = genTypeAndValueGen.generate(r);
    mgr.getTypeManager()._test_copyTaggedTypesFrom(splitType.getTypeManager());
    const distinctSplitValues = makeDistinctSortedList(splitType);
    // Now make random duplication count for each:
    const replicationCounts = distinctSplitValues.map(_s => 1 + r.nextInt(10));
    const totalLength = replicationCounts.reduce((x, y) => x + y, 0);
    columns.push(new ColumnDetails(new ColumnId("Split Col"), splitType.getType(),
        distinctSplitValues.flatMap((v, i) => Utility.replicate<Either<string, Value>>(replicationCounts[i]!, Either.right(v)))));

    // Then add source column for aggregate calculations (summing etc):
    const aggColumns = makeSourceAndCalculations(mgr.getTypeManager(), splitType.getType(), distinctSplitValues, replicationCounts, genTypeAndValueGen, r);
    for (const aggColumn of aggColumns)
        columns.splice(r.nextInt(columns.length + 1), 0, aggColumn.sourceColumn);

    // Add some extra columns with errors just to complicate things:
    const numExtraColumns = r.nextInt(4);
    for (let i = 0; i < numExtraColumns; i++)
    {
        const extraType = genTypeAndValueGen.generate(r);
        mgr.getTypeManager()._test_copyTaggedTypesFrom(extraType.getTypeManager());
        columns.splice(r.nextInt(columns.length + 1), 0, new ColumnDetails(new ColumnId(IdentifierUtility.identNum("Extra", i)), extraType.getType(), Utility.replicateM_Ex<Either<string, Value>>(totalLength, () => r.nextInt(10) === 1 ? Either.left("@") : Either.right(extraType.makeValue()))));
    }

    for (const column of columns)
        expect(column.data.length, column.name.getRaw()).toBe(totalLength);

    columns = scrambleDataOrder(columns, replicationCounts, r);

    await createDataTable(a, CellPosition.ORIGIN.offsetByRowCols(1, 1), "Src Data", columns);

    // Sanity check the data before proceeding:
    const clip = await copyTableData(a, "Src Data");
    for (let i = 0; i < clip.length; i++)
    {
        const copiedColumn = clip[i]!;
        expect(copiedColumn.columnName?.getRaw()).toBe(columns[i]!.name.getRaw());
        TBasicUtil.assertValueListEitherEqual("" + i, columns[i]!.data, copiedColumn.dataValues);
    }

    // Now add the actual aggregate:
    const aggTarget = CellPosition.ORIGIN.offsetByRowCols(1, columns.length + 2);
    await keyboardMoveTo(grid, aggTarget);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(aggTarget, aggTarget));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-aggregate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true, { timeout: 5000 });
    await write("Src Data");
    await push("Enter");
    await vi.waitUntil(() => document.activeElement?.closest(".column-name-text-field") !== null, { timeout: 5000 });
    const first = aggColumns[0]!.calculations[0]!;
    await write(first.columnName.getRaw());
    await push("Tab");
    await enterExpression(mgr.getTypeManager(), first.expression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS, r);
    await moveAndDismissPopupsAtPos(centre(".id-agg-split-columns"));
    await userEvent.click(document.querySelector(".id-agg-split-columns")!);
    await sleep(300);
    // PORT-NOTE: Java test bug, fixed: Java then clicked the list's Add button, but choosing the radio
    // button already adds a blank column (focused), so that left the first blank and the dialog couldn't
    // be OKed (in Java too); here the column is entered in the one the radio button added.
    await vi.waitUntil(() => document.activeElement?.classList.contains("split-by-column-field") === true);
    if (r.nextBoolean())
    {
        await write("Split Col");
    }
    else
    {
        await write("Spl");
        await push("ArrowDown");
        await push("Enter");
        const field = document.activeElement as HTMLInputElement;
        expect(field.value).toBe("Split Col");
        expect(field.selectionStart).toBe("Split Col".length);
        // Found showing auto-complete window?
        expect(document.querySelector(".autocomplete-popover")).toBeNull();
    }
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    // (Java slept 3 seconds)
    await vi.waitUntil(() => mgr.getAllTables().some(t => t instanceof Aggregate), { timeout: 5000 });
    await a.mainWindow()!.engine.client.request("idle");

    // Should be one column at the moment, with the distinct split values, and maybe the first calculation:
    const aggTable = mgr.getAllTables().find(t => !t.getId().equals(new TableId("Src Data"))) as Aggregate;
    expect(aggTable.getSplitBy().map(c => c.getRaw())).toEqual(["Split Col"]);
    const aggId = aggTable.getId().getRaw();
    const initialAgg = await copyTableData(a, aggId);

    // Now add the calculations:
    let colCount = initialAgg.length;
    let skipFirst = true;
    for (const aggColumn of aggColumns)
    {
        for (const calculation of aggColumn.calculations)
        {
            if (skipFirst)
            {
                skipFirst = false;
                continue;
            }
            const arrowLoc = aggTarget.offsetByRowCols(2, colCount++);
            await keyboardMoveTo(grid, arrowLoc);
            await clickOnItemInBounds(".expand-arrow", grid, new RectangleBounds(arrowLoc, arrowLoc));
            // Now enter column name and expression:
            await vi.waitUntil(() => document.activeElement?.closest(".column-name-text-field") !== null, { timeout: 5000 });
            checkDialogFocused("New column dialog");
            await write(calculation.columnName.getRaw());
            await push("Tab");
            await enterExpression(mgr.getTypeManager(), calculation.expression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS, r);
            await moveAndDismissPopupsAtPos(centre(".ok-button"));
            await userEvent.click(document.querySelector(".ok-button")!);
            // (Java slept a second)
            const name = calculation.columnName;
            await vi.waitUntil(() => (mgr.getSingleTableOrNull(new TableId(aggId)) as Aggregate | null)?.getColumnExpressions().some(p => p.getFirst().equals(name)) === true, { timeout: 5000 });
            await a.mainWindow()!.engine.client.request("idle");
        }
    }

    const finalAgg = await copyTableData(a, aggId);
    for (const aggColumn of aggColumns)
    {
        for (const calculation of aggColumn.calculations)
        {
            const calcCol = finalAgg.find(c => c.columnName?.equals(calculation.columnName) === true);
            expect(calcCol, "Missing column").toBeDefined();
            expect(calcCol!.dataType.equals(calculation.dataType), calculation.columnName.getRaw() + ": " + calcCol!.dataType.toString() + " vs " + calculation.dataType.toString()).toBe(true);
            TBasicUtil.assertValueListEitherEqual(calculation.columnName.getRaw(),
                calculation.expectedResult.map(x => x === null ? Either.left<string, Value>("") : Either.right<string, Value>(x)),
                calcCol!.dataValues);
        }
    }
}, { trials: 3 }), 900_000);

function makeSourceAndCalculations(copyTypesTo: TypeManager, splitColumnType: DataType, distinctSplitValues: readonly Value[], replicationCounts: readonly number[], genTypeAndValueGen: GenTypeAndValueGen, r: JavaRandom): AggColumns[]
{
    const numColumns = 1 + r.nextInt(4);
    const totalLength = replicationCounts.reduce((x, y) => x + y, 0);

    const aggColumns: AggColumns[] = [];
    for (let i = 0; i < numColumns; i++)
    {
        const typeAndValueGen = genTypeAndValueGen.generate(r);
        copyTypesTo._test_copyTaggedTypesFrom(typeAndValueGen.getTypeManager());
        const sourceData = Utility.replicateM_Ex<Either<string, Value>>(totalLength, () => Either.right(typeAndValueGen.makeValue()));
        const columnDetails = new ColumnDetails(new ColumnId(IdentifierUtility.identNum("Source", i)), typeAndValueGen.getType(), sourceData);
        const calculations = makeCalculations(splitColumnType, distinctSplitValues, typeAndValueGen.getTypeManager().getUnitManager(), columnDetails, replicationCounts, r);
        aggColumns.push(new AggColumns(columnDetails, calculations));
    }
    return aggColumns;
}

function makeCalculations(splitColumnType: DataType, distinctSplitValues: readonly Value[], unitManager: UnitManager, columnDetails: ColumnDetails, replicationCounts: readonly number[], random: JavaRandom): AggCalculation[]
{
    const groups: (readonly Either<string, Value>[])[] = [];
    let start = 0;
    for (const count of replicationCounts)
    {
        groups.push(columnDetails.data.slice(start, start + count));
        start += count;
    }

    const perGroup = (f: (group: readonly Either<string, Value>[]) => Value | null): (Value | null)[] => groups.map(f);
    const name = (s: string): ColumnId => new ColumnId(columnDetails.name.getRaw() + " " + s);
    const valueComparator = DataTypeUtility.getValueComparator();
    const fn = (functionName: string): IdentExpression => IdentExpression.function(TBasicUtil.checkNonNull(FunctionList.lookup(unitManager, functionName)).getFullName());
    const withEithers = (src: readonly Either<string, Value>[], withList: (list: readonly Value[]) => Value | null): Value | null =>
        Either.mapMInt(src, x => x).mapInt(withList).leftToNull();

    // (Java: a DataTypeVisitorEx whose every case is usual())
    const calculations: AggCalculation[] = [];
    const groupExp = IdentExpression.column(columnDetails.name);
    if (random.nextBoolean())
    {
        // Keep group as a list:
        calculations.push(new AggCalculation(name("Group"),
            groupExp,
            DataType.array(columnDetails.dataType),
            perGroup(g => withEithers(g, gr => new ListExList(gr)))));
    }
    if (random.nextBoolean())
    {
        // Minimum:
        calculations.push(new AggCalculation(name("Min"),
            new CallExpression(fn("minimum"), [groupExp]),
            columnDetails.dataType,
            perGroup(g => withEithers(g, gr => gr.length === 0 ? null : gr.reduce((x, y) => valueComparator(y, x) < 0 ? y : x)))));
    }
    if (random.nextBoolean())
    {
        // Maximum:
        calculations.push(new AggCalculation(name("Max"),
            new CallExpression(fn("maximum"), [groupExp]),
            columnDetails.dataType,
            perGroup(g => withEithers(g, gr => gr.length === 0 ? null : gr.reduce((x, y) => valueComparator(y, x) > 0 ? y : x)))));
    }
    if (random.nextBoolean())
    {
        // First:
        calculations.push(new AggCalculation(name("First"),
            new CallExpression(fn("element"), [groupExp, new NumericLiteral(new Decimal(1), null)]),
            columnDetails.dataType,
            perGroup(g => withEithers(g, gr => gr[0] ?? null))));
    }
    if (DataTypeUtility.isNumber(columnDetails.dataType))
    {
        calculations.push(new AggCalculation(name("Sum"),
            new CallExpression(fn("sum"), [groupExp]),
            columnDetails.dataType,
            perGroup(g => withEithers(g, gr => gr.length === 0 ? null : (gr as Decimal[]).reduce((x, y) => Utility.addSubtractNumbers(x, y, true))))));
    }
    if (columnDetails.dataType.equals(DataType.TEXT))
    {
        calculations.push(new AggCalculation(name("Concat"),
            new CallExpression(fn("join text"), [groupExp]),
            columnDetails.dataType,
            perGroup(g => withEithers(g, gr => DataTypeUtility.value((gr as string[]).join(""))))));
    }
    if (random.nextBoolean())
    {
        calculations.push(new AggCalculation(name("Split"),
            IdentExpression.column(new ColumnId("Split Col")),
            splitColumnType,
            [...distinctSplitValues]));
    }
    return calculations;
}

function scrambleDataOrder(columns: readonly ColumnDetails[], groupCounts: readonly number[], r: JavaRandom): ColumnDetails[]
{
    const indexesToDrawFrom: number[][] = [];
    let total = 0;
    for (const count of groupCounts)
    {
        const sub: number[] = [];
        for (let i = 0; i < count; i++)
            sub.push(total + i);
        indexesToDrawFrom.push(sub);
        total += count;
    }

    const oldIndexes: number[] = [];
    for (let i = 0; i < total; i++)
    {
        const group = r.nextInt(indexesToDrawFrom.length);
        const j = indexesToDrawFrom[group]!.shift()!;
        oldIndexes.push(j);
        if (indexesToDrawFrom[group]!.length === 0)
            indexesToDrawFrom.splice(group, 1);
    }

    return columns.map(c => new ColumnDetails(c.name, c.dataType, oldIndexes.map(oldIndex => c.data[oldIndex]!)));
}

// Java: copyTableData: the table header's menu's "Copy values", then the values from the clipboard
async function copyTableData(a: RenderedApp, tableName: string): Promise<ClipboardUtils.LoadedColumnInfo[]>
{
    const grid = a.mainWindow()!.grid()!;
    const display = await vi.waitUntil(() => grid.displays().find(d => d.info.id === tableName), { timeout: 5000 });
    await keyboardMoveTo(grid.grid, display.getPosition());
    await copyToClipboard(async () =>
    {
        // (By an event: the table may be at the top, under its hat; Java found the title's node itself)
        const title = document.querySelector<HTMLElement>(`[data-table="${CSS.escape(tableName)}"] .table-display-table-title`)!;
        const box = title.getBoundingClientRect();
        title.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: box.left + 2, clientY: box.top + 5 }));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-copyValues")));
    });
    const clip = ClipboardUtils.loadValuesFromClipboard(engineHost(a).tableManager.getTypeManager(), await recordsOnClipboard());
    expect(clip).not.toBeNull();
    return clip!;
}

// Makes a list containing no duplicate values, using the given type.
function makeDistinctSortedList(splitType: GenTypeAndValueGen.TypeAndValueGen): Value[]
{
    const targetAmount = 12;
    const attempts = 50;
    const r: Value[] = [];
    for (let i = 0; i < attempts && r.length < targetAmount; i++)
    {
        const newVal = splitType.makeValue();
        // This is O(N^2) but it's only test code, and small N:
        if (r.some(existing => Utility.compareValues(newVal, existing) === 0))
            continue;
        r.push(newVal);
    }
    // (Java's Collections.sort, stable)
    r.sort(DataTypeUtility.getValueComparator());
    return r;
}

test("testCheck", () => checkProperty([new GenImmediateData(), new GenRandom()], async (srcImmedData: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(srcImmedData.mgr) }], 0);
    await waitForLoaded();
    const tableManager = engineHost(a).tableManager;
    await vi.waitUntil(() => document.querySelectorAll(".table").length === tableManager.getAllTables().length, { timeout: 10_000 });
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const virtualGrid = a.mainWindow()!.grid()!.grid;
    const allTables = tableManager.getAllTables();

    const srcTable = allTables[r.nextInt(allTables.length)]!;
    const srcData = srcTable.getData();
    const srcColumns = srcData.getColumns();
    const srcColumn = srcColumns[r.nextInt(srcColumns.length)]!;

    // Standalone is randomly substituted for some of these later on:
    // PORT-NOTE: possible Java bug, kept: ALL_ROWS twice, so ANY_ROW is never tested.
    const possibleTypes = [Check.CheckType.ALL_ROWS, Check.CheckType.NO_ROWS, Check.CheckType.ALL_ROWS];
    let checkType = possibleTypes[r.nextInt(possibleTypes.length)]!;
    if (srcColumn.getLength() === 0)
        return;

    const containedItem = srcColumn.getType().getCollapsed(r.nextInt(srcColumn.getLength()));
    let allEqualToContained = true;
    for (let row = 0; row < srcColumn.getLength(); row++)
    {
        if (Utility.compareValues(containedItem, srcColumn.getType().getCollapsed(row)) !== 0)
            allEqualToContained = false;
    }

    let checkExpression: Expression;
    const expectedPass = checkType === Check.CheckType.ANY_ROW || (checkType === Check.CheckType.ALL_ROWS && allEqualToContained);
    const containedItemExpression = TFunctionUtil.parseExpression(DataTypeUtility.valueToString(containedItem, srcColumn.getType().getType(), false, null), tableManager.getTypeManager(), FunctionList.getFunctionLookup(tableManager.getUnitManager()));
    if (r.nextInt(3) === 0)
    {
        // Fake it using a stand-alone check
        let func: string;
        if (checkType === Check.CheckType.ALL_ROWS)
            func = "all";
        else if (checkType === Check.CheckType.NO_ROWS)
            func = "none";
        else
            func = "any";

        checkExpression = new CallExpression(
            FunctionList.getFunctionLookup(tableManager.getUnitManager()), func,
            IdentExpression.makeEntireColumnReference(srcTable.getId(), srcColumn.getName()),
            new EqualExpression([new ImplicitLambdaArg(), containedItemExpression], false));

        checkType = Check.CheckType.STANDALONE;
    }
    else
    {
        checkExpression = new EqualExpression([IdentExpression.column(srcColumn.getName()), containedItemExpression], false);
    }

    const displays = a.mainWindow()!.grid()!.displays();
    const targetPos = displays.map(d => d.getBottomRightIncl().offsetByRowCols(8, 2)).reduce((x, y) => y.columnIndex > x.columnIndex ? y : x);

    await keyboardMoveTo(virtualGrid, targetPos);
    await sleep(300);

    await clickOnItemInBounds("[data-testid=grid]", virtualGrid, new RectangleBounds(targetPos, targetPos));

    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-check")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true, { timeout: 5000 });
    await write(srcTable.getId().getRaw());
    await push("Enter");

    await vi.waitUntil(() => document.querySelector(".check-type-combo") !== null, { timeout: 5000 });
    await selectGivenComboBoxItem(page.getByRole("combobox"), checkType.toString());

    await push("Tab");

    // Enter expression:
    await enterExpression(tableManager.getTypeManager(), checkExpression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS, r);

    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);

    // (Java slept half a second)
    const labelPos = targetPos.offsetByRowCols(1, 0);
    const label = await vi.waitUntil(() =>
    {
        try
        {
            const l = withItemInBounds(".check-result", virtualGrid, new RectangleBounds(targetPos, labelPos)).element;
            return l.textContent.trim() === "?" ? null : l;
        }
        catch (_e)
        {
            return null;
        }
    }, { timeout: 10_000 });

    expect(label.textContent.trim()).toBe(expectedPass ? "OK" : "Fail");

    // PORT-DEFERRED: if it failed, clicking the result (or Enter on it) shows its explanation
    // (".explanation-flow"), with ExplanationDisplay (Phase 11 step 7).
}, { trials: 5 }), 900_000);
