// Port of test.gui.transformation.TestColumnRecipes (tests-gui-transformations): the column menu's Sum and
// Average recipes, and its Transform type (PickTypeTransformDialog): the types offered for a column's
// values, and the Calculate made (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { ArrayExpression, CallExpression, EqualExpression, Expression, IdentExpression, NumericLiteral, StringLiteral, TypeLiteralExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypePrimitiveLiteral } from "../../../src/engine/expressions/transformations/expression/type/TypePrimitiveLiteral.js";
import { UnitExpression } from "../../../src/engine/expressions/transformations/expression/UnitExpression.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import type { FunctionLookup } from "../../../src/engine/expressions/transformations/expression/function/FunctionLookup.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { TaggedValue } from "../../../src/engine/utility/utility/TaggedValue.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { withItemInBounds } from "../base/clickTableLocation.js";
import { write } from "../base/keyboard.js";
import { selectGivenListViewItem } from "../base/listUtil.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

async function open(content: string, tables: number): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === tables);
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

// Java: keyboardMoveTo the column's first row, then showContextMenu on the column's title, two rows up
async function showColumnMenu(a: RenderedApp, table: Table, column: ColumnId): Promise<void>
{
    const grid = a.mainWindow()!.grid()!;
    const display = await vi.waitUntil(() => grid.displays().find(d => d.info.id === table.getId().getRaw()));
    const columnIndex = display.info.columnNames.indexOf(column.getRaw());
    const firstRow = display.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS, columnIndex);
    await keyboardMoveTo(grid.grid, firstRow);
    const title = firstRow.offsetByRowCols(-2, 0);
    const { element } = withItemInBounds(".table-display-column-title", grid.grid, new RectangleBounds(title, title));
    await userEvent.click(element, { button: "right" });
    await vi.waitUntil(() => document.querySelector(".context-menu") !== null);
}

const save = (e: Expression | null | undefined): string | null => e === null || e === undefined ? null : e.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);

test("testAverageSum", () => checkProperty([new GenImmediateData({ numTables: { minTables: 1, maxTables: 1 }, mustIncludeNumber: true }), new GenRandom()], async (dataMgr: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    // Test the average and sum recipes on numeric columns
    const a = await open(TTableUtil.save(dataMgr.mgr), 1);

    // Find the numeric column and scroll to it:
    const table = engineHost(a).tableManager.getAllTables()[0]!;
    const srcColumn = table.getData().getColumns().find(c => DataTypeUtility.isNumber(c.getType().getType()));
    if (srcColumn === undefined)
        throw new Error("No numeric column");

    await showColumnMenu(a, table, srcColumn.getName());
    const sum = r.nextBoolean();
    await userEvent.click(document.querySelector(sum ? ".id-recipe-sum" : ".id-recipe-average")!);

    const agg = await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find((t): t is Aggregate => t instanceof Aggregate), { timeout: 5000 });
    expect(agg.getSplitBy()).toEqual([]);
    expect(agg.getColumnExpressions().map(p => save(p.getSecond()))).toEqual([save(new CallExpression(getFunctionLookup(), sum ? "sum" : "average", IdentExpression.column(table.getId(), srcColumn.getName())))]);
}, { trials: 2 }), 600_000);

const ERR = Symbol("ERR");

/**
 * @param to If null, check that there are no transforms (expression will be ignored)
 * @param expression If null (and to is not null), check that the to type in specific is not shown.
 */
async function testTypeTransform(from: DataType, to: DataType | null, expression: ((c: ColumnId) => Expression) | null, values: readonly (Value | typeof ERR)[], execAfterTypeSelection: (() => Promise<void>) | null, setUp: (mgr: TableManager) => void = () => {}): Promise<void>
{
    const content = savedFile(mgr =>
    {
        setUp(mgr);
        const column = ColumnUtility.makeImmediateColumn(from, new ColumnId("C"), values.map(v => v === ERR ? Either.left<string, Value>("Error") : Either.right<string, Value>(v)), DataTypeUtility.makeDefaultValue(from));
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("Table1"), null, null, null), new EditableRecordSet([column], () => values.length)));
    });
    const a = await open(content, 1);

    // Find the column and scroll to it:
    const table = engineHost(a).tableManager.getAllTables()[0]!;
    const srcColumn = table.getData().getColumns()[0]!;
    await showColumnMenu(a, table, srcColumn.getName());
    await userEvent.click(document.querySelector(".id-recipe-transformType")!);

    // Now check the options in the dialog:
    const listView = await vi.waitUntil(() => document.querySelector(".destination-type-list"), { timeout: 5000 });
    const items = (): string[] => [...listView.querySelectorAll("[role=option]")].map(e => e.textContent.trim());
    if (to !== null && expression !== null)
    {
        await selectGivenListViewItem(page.elementLocator(listView), o => o.textContent.trim() === to.toString());
        await userEvent.click(document.querySelector(".ok-button")!);
        if (execAfterTypeSelection !== null)
        {
            await sleep(500);
            await execAfterTypeSelection();
        }

        // Find calculate and check expression:
        const calc = await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find((t): t is Calculate => t instanceof Calculate), { timeout: 5000 });
        expect(save(calc.getCalculatedColumns().get(srcColumn.getName()))).toBe(save(expression(srcColumn.getName())));
    }
    else if (to !== null)
    {
        expect(items()).not.toContain(to.toString());
        await userEvent.click(document.querySelector(".cancel-button")!);
    }
    else
    {
        expect(items()).toEqual([]);
        expect(document.querySelector<HTMLButtonElement>(".ok-button")!.disabled).toBe(true);
        await userEvent.click(document.querySelector(".cancel-button")!);
    }
}

const num = (n: number | string): Value => new Decimal(String(n));

test("testEmpty", () => testTypeTransform(DataType.TEXT, null, null, [], null));

test("testNumToBoolean", () => testTypeTransform(DataType.number(new NumberInfo(Unit.SCALAR)), DataType.BOOLEAN, c => new EqualExpression([IdentExpression.column(c), new NumericLiteral(new Decimal(1), null)], false), [num(1), num(0), num(0), num(1), ERR], null));

test("testNumOnlyZeroes", () => testTypeTransform(DataType.number(new NumberInfo(Unit.SCALAR)), DataType.BOOLEAN, null, [num(0), num(0), num(0), num(0)], null));

test("testDateToText", () => testTypeTransform(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY)), DataType.TEXT, c => new CallExpression(getFunctionLookup(), "to text", IdentExpression.column(c)), [], null));

test("testTextualNumberToNumber", () => testTypeTransform(DataType.TEXT, DataType.NUMBER, c => new CallExpression(getFunctionLookup(), "extract number", IdentExpression.column(c)), ["37", "0", "1.65", "-3.562", "none"], null));

test("testTextualNumberToNumber2", () => testTypeTransform(DataType.TEXT, DataType.NUMBER, c => new CallExpression(getFunctionLookup(), "extract number", IdentExpression.column(c)), ["37m", "0m", "1.65m", "-3.562 metres", "n/a"], null));

test("testTextualNumberToNumber3", () =>
{
    const typeManager = new TypeManager(new UnitManager());
    return testTypeTransform(DataType.TEXT, typeManager.getMaybeType().instantiate([Either.right(DataType.NUMBER)], typeManager), c => new CallExpression(getFunctionLookup(), "extract number or none", IdentExpression.column(c)), ["37m", "0m", "1.65m", "-3.562 metres", "n/a"], null);
});

test("testNonDateToText", () => testTypeTransform(DataType.TEXT, DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY)), null, ["37", "0", "1.65", "-3.562"], null));

test("testTextualTimeToTime", () =>
{
    const time = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY));
    return testTypeTransform(DataType.TEXT, time, c => new CallExpression(getFunctionLookup(), "from text to", new TypeLiteralExpression(new TypePrimitiveLiteral(time)), IdentExpression.column(c)), ["4:51", "16:05", "5:21PM", "0:00:03.435346346 AM"], null);
});

test("testTextualDateToDate", () =>
{
    const date = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY));
    return testTypeTransform(DataType.TEXT, date, c => new CallExpression(getFunctionLookup(), "from text to", new TypeLiteralExpression(new TypePrimitiveLiteral(date)), IdentExpression.column(c)), [ERR, "May 12 2018", "30-04-17", "21 Jun 2018", ERR, "2018-03-04"], null);
});

const trues = (): ArrayExpression => new ArrayExpression(["true", "t", "yes", "y", "on"].map(s => new StringLiteral(s)));

test("testTextualNumberToBoolean", () => testTypeTransform(DataType.TEXT, DataType.BOOLEAN, c => new CallExpression(getFunctionLookup(), "list contains", trues(), new CallExpression(getFunctionLookup(), "lower case", IdentExpression.column(c))), ["T", "F", "T", "T", "F"], null));

test("testTextualNumberToBoolean2", () => testTypeTransform(DataType.TEXT, DataType.BOOLEAN, c => new CallExpression(getFunctionLookup(), "list contains", trues(), new CallExpression(getFunctionLookup(), "lower case", IdentExpression.column(c))), ["yes", "no", "Yes", "No", "Y"], null));

test("testDateTimeToDate", () =>
{
    const datetime = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME));
    const date = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY));
    return testTypeTransform(datetime, date, c => new CallExpression(getFunctionLookup(), "date from datetime", IdentExpression.column(c)), [ERR], null);
});

test("testDateTimeZonedToYearYM", () =>
{
    const datetime = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED));
    const date = DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH));
    return testTypeTransform(datetime, date, c => new CallExpression(getFunctionLookup(), "dateym from date", new CallExpression(getFunctionLookup(), "date from datetime", new CallExpression(getFunctionLookup(), "datetime from datetimezoned", IdentExpression.column(c)))), [ERR], null);
});

test("testOptionalNumberToNumber", () =>
{
    const unitManager = new UnitManager();
    const s = unitManager.loadUse("s");
    const typeManager = new TypeManager(unitManager);
    return testTypeTransform(optional(DataType.number(new NumberInfo(s))), DataType.number(new NumberInfo(s)), c => new CallExpression(getFunctionLookup(), "get optional or", IdentExpression.column(c), new NumericLiteral(new Decimal(34), UnitExpression.load(s))), [new TaggedValue(0, null, typeManager.getMaybeType())], async () =>
    {
        await write("34");
        await userEvent.click(document.querySelector(".ok-button")!);
    });
});

function optional(inner: DataType): DataType
{
    const typeManager = new TypeManager(new UnitManager());
    return typeManager.getMaybeType().instantiate([Either.right(inner)], typeManager);
}

function getFunctionLookup(): FunctionLookup
{
    return FunctionList.getFunctionLookup(new UnitManager());
}
