// Port of test.gui.TestExportToCSV (tests-gui-central): a Calculate of some data, exported to CSV through its
// table menu, has the source's columns and the result (docs/gui-spec/tables.md).
import { afterEach, test, vi } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import type { ExpressionValue } from "../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "../../engine/tests-functions/fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "../../engine/tests-functions/fixtures/gen/GenExpressionValueForwards.js";
import { CompositeGenerator, checkProperty } from "../../support/quickcheck.js";
import { collapse, exportToCSVAndCheck } from "../base/checkCSV.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

/**
 * Generates a file with some raw data and a transform, then loads it and exports to CSV
 */
// (Java: @When(seed=1L), a fixed seed)
test("testCalculateToCSV", () => checkProperty([new CompositeGenerator<ExpressionValue>([new GenExpressionValueForwards(), new GenExpressionValueBackwards()])], async (expressionValue: ExpressionValue) =>
{
    let calculatedId = "";
    const content = savedFile(manager =>
    {
        manager.getTypeManager()._test_copyTaggedTypesFrom(expressionValue.typeManager);
        const srcData = new ImmediateDataSource(manager, new Table.InitialLoadDetails(expressionValue.tableId, null, null, null), new EditableRecordSet(expressionValue.recordSet));
        manager.record(srcData);
        const calculated = new Calculate(manager, TFunctionUtil.ILD, srcData.getId(), new HashMap<ColumnId, Expression>([[new ColumnId("Result" as ExpressionIdentifier), expressionValue.expression]]));
        manager.record(calculated);
        calculatedId = calculated.getId().getRaw();
    });
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();

    const expectedContent: (readonly [string, readonly string[]])[] = [];
    for (const column of expressionValue.recordSet.getColumns())
        expectedContent.push([column.getName().getRaw(), collapse(expressionValue.recordSet.getLength(), column.getType())]);
    expectedContent.push(["Result", expressionValue.value.map(o => DataTypeUtility.valueToString(o))]);
    const display = a.mainWindow()!.grid()!.displays().find(d => d.info.id === calculatedId)!;
    await exportToCSVAndCheck(a.mainWindow()!.grid()!.grid, display, "", expectedContent);
}, { trials: 5, seed: 1 }), 300_000);
