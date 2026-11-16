// Port of test.gui.TestExplanationDisplay (tests-gui-central): a failing Check's result, clicked, shows
// why it failed, line by line (docs/gui-spec/tables.md).
import { afterEach, expect, test, vi } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryBooleanColumn } from "../../../src/engine/data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

const CHECK_POS = new CellPosition(CellPosition.row(20), CellPosition.col(9));

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const bools = (name: string, ...values: boolean[]) => (rs: RecordSet): EditableColumn => new MemoryBooleanColumn(rs, new ColumnId(name), values.map(v => Either.right(v)), false);
const nums = (name: string, ...values: number[]) => (rs: RecordSet): EditableColumn => new MemoryNumericColumn(rs, new ColumnId(name), NumberInfo.DEFAULT, values.map(v => Either.right(new Decimal(v))), ZERO);
const text = (name: string, ...values: string[]) => (rs: RecordSet): EditableColumn => new MemoryStringColumn(rs, new ColumnId(name), values.map(v => Either.right(v)), "");

// Java: loadSourceTables (before each test), then addCheck: here the Check is in the file the app opens
// (Java recorded it in the open window's manager, then waited two seconds)
async function addCheck(srcTable: string, checkType: Check.CheckType, expressionSrc: string): Promise<void>
{
    const content = savedFile(mgr =>
    {
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T1"), null, null, null), new EditableRecordSet([
            bools("all true", true, true, true, true),
            bools("half false", false, true, false, true),
            bools("all false", false, false, false, false),
        ], () => 4)));
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T2"), null, null, null), new EditableRecordSet([
            nums("asc", 1, 2, 3, 4),
            text("alphabet animals", "Aardvark", "Bear", "Cat", "Deer"),
        ], () => 4)));
        const expression = TFunctionUtil.parseExpression(expressionSrc, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
        mgr.record(new Check(mgr, new Table.InitialLoadDetails(null, null, CHECK_POS, null), new TableId(srcTable), checkType, expression));
    });
    app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 3, { timeout: 10_000 });
    // (Its result, "Fail" or "Error", with an explanation)
    await vi.waitUntil(() => document.querySelector(".check-result.explainable") !== null, { timeout: 10_000 });
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
}

async function testFailureExplanation(...lines: string[]): Promise<void>
{
    const grid = app!.mainWindow()!.grid()!.grid;
    grid.findAndSelect(Either.left(CellPosition.ORIGIN.offsetByRowCols(1, 1)));
    await keyboardMoveTo(grid, CHECK_POS);
    const resultPos = CHECK_POS.offsetByRowCols(1, 0);
    await clickOnItemInBounds(".check-result", grid, new RectangleBounds(resultPos, resultPos));
    const textFlow = await vi.waitUntil(() => document.querySelector(".explanation-flow"), { timeout: 5000 });
    expect(textFlow).not.toBeNull();
    await vi.waitUntil(() => textFlow.textContent !== "Loading...", { timeout: 5000 });
    const allText = textFlow.textContent;
    const splitText = allText.split(/\n(?:⬑ )?/);
    expect(splitText).toEqual(lines);
}

test("testExplanationSimple1", async () =>
{
    await addCheck("T2", Check.CheckType.STANDALONE, "0 > 1");
    await testFailureExplanation("0 > 1 was false");
});

test("testExplanationSimple2", async () =>
{
    await addCheck("T2", Check.CheckType.ALL_ROWS, "column\\\\asc < 4");
    await testFailureExplanation("asc < 4 was false", "asc was 4, using asc (row 4)");
});

test("testExplanationSimple2b", async () =>
{
    await addCheck("T2", Check.CheckType.STANDALONE, "@call function\\\\all(table\\\\T2#asc, ? < 4)");
    await testFailureExplanation(
        //"asc was 4, using asc (row 4)"
        "all(T2#asc, ? < 4) was false, using asc (row 4)",
        "? < 4 was false",
        "? was 4");
});

test("testExplanationSimple3", async () =>
{
    await addCheck("T2", Check.CheckType.ALL_ROWS, "column\\\\asc < @call function\\\\text length(column\\\\alphabet animals)");
    await testFailureExplanation(
        "asc < text length(alphabet animals) was false",
        "text length(alphabet animals) was 3",
        "alphabet animals was \"Cat\", using alphabet animals (row 3)",
        "asc was 3, using asc (row 3)");
});

test("testExplanationError", async () =>
{
    await addCheck("T2", Check.CheckType.ALL_ROWS, "(1 / (column\\\\asc - 3)) < 1.1");
    await testFailureExplanation(
        "In: (1 / (column\\\\asc - 3)) < 1.1",
        "Division by zero in: 1 / (column\\\\asc - 3)",
        "asc - 3 was 0",
        "asc was 3, using asc (row 3)");
});

test("testExplanationError2", async () =>
{
    await addCheck("T2", Check.CheckType.ALL_ROWS, "@if (column\\\\asc > 2) @then (1 / (column\\\\asc - 3)) @else 0 @endif < 1.1");
    await testFailureExplanation(
        "In: @if column\\\\asc > 2 @then 1 / (column\\\\asc - 3) @else 0 @endif < 1.1",
        "In: @if column\\\\asc > 2 @then 1 / (column\\\\asc - 3) @else 0 @endif",
        "Division by zero in: 1 / (column\\\\asc - 3)",
        "asc - 3 was 0",
        "asc > 2 was true",
        "asc was 3, using asc (row 3)");
});

test("testExplanationMatch", async () =>
{
    await addCheck("T2", Check.CheckType.NO_ROWS, "@match (num: column\\\\asc, animal: column\\\\alphabet animals) @case (num: n) @given n > 5 @then false @case (num: _, animal: animal) @then (@call function\\\\text length(animal) =~ n) & (n > 5) @endmatch");
    await testFailureExplanation(
        "@match (num: asc, animal: alphabet animals) @case (num: n) @given n > 5 @then false @case (num: _, animal: animal) @then (text length(animal) =~ n) & (n > 5) @endmatch was true",
        "(text length(animal) =~ n) & (n > 5) was true",
        "n > 5 was true",
        "n was 8",
        "text length(animal) =~ n was true",
        "text length(animal) was 8",
        "animal was \"Aardvark\"",
        "(num: _, animal: animal) matched",
        "n > 5 was false",
        "n was 1",
        "(num: n) matched",
        "(num: asc, animal: alphabet animals) was (animal: \"Aardvark\", num: 1), using asc (row 1), alphabet animals (row 1)");
});

test("testExplanationRepetitiveIf", async () =>
{
    await addCheck("T2", Check.CheckType.NO_ROWS, "@if (column\\\\asc + 1) > 3 @then (column\\\\asc + 1) > 4 @else (column\\\\asc + 1) > 3 @endif");
    await testFailureExplanation(
        "@if (asc + 1) > 3 @then (asc + 1) > 4 @else (asc + 1) > 3 @endif was true",
        "(asc + 1) > 4 was true",
        "(asc + 1) > 3 was true",
        "asc + 1 was 5",
        "asc was 4, using asc (row 4)");
});
