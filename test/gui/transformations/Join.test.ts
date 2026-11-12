// Port of test.gui.transformation.TestJoin (tests-gui-transformations): making a Join from the new-table
// dialog, entering its tables and the columns to match, and checking the values it gives
// (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Join } from "../../../src/engine/transformations/transformations/Join.js";
import { TaggedValue } from "../../../src/engine/utility/utility/TaggedValue.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { GenDataTypeMaker } from "../../engine/tests-functions/fixtures/gen/type/GenDataTypeMaker.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty } from "../../support/quickcheck.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, engineHost, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// (Java: Pair<Integer, OptionalInt>, with null for an empty OptionalInt)
type SourceRows = [number, number | null];

function removeFirst(list: SourceRows[], item: SourceRows): void
{
    const i = list.findIndex(p => p[0] === item[0] && p[1] === item[1]);
    if (i !== -1)
        list.splice(i, 1);
}

test("testJoin", () => checkProperty([new GenDataTypeMaker(undefined, true), new GenRandom()], async (dataTypeMaker: GenDataTypeMaker.DataTypeMaker, r: JavaRandom) =>
{
    // We make four types for columns (T1-T4), where table A has
    // T1-T3 and table B has T2-T4.  Table A has
    const dataTypes = Utility.replicateM_Ex(4, () => dataTypeMaker.makeType());
    const srcMgr = new DummyManager();
    srcMgr.getTypeManager()._test_copyTaggedTypesFrom(dataTypeMaker.getTypeManager());
    const aSize = 10 + r.nextInt(10);
    const bSize = 10 + r.nextInt(10);
    const aColumns: ((rs: RecordSet) => EditableColumn)[] = [];
    const bColumns: ((rs: RecordSet) => EditableColumn)[] = [];
    const columnsNamedSame = r.nextBoolean();
    const leftJoin = r.nextBoolean();
    // One entry per output row.  Which row numbers do the result rows come from?
    const resultSourceRows: SourceRows[] = [];
    // Join on nothing (0), T1-T2 (1) or T1-T2+T2-T3 (2)
    const joinColumnCount = r.nextInt(3);
    // Start with all pairs:
    for (let i = 0; i < aSize; i++)
    {
        for (let j = 0; j < bSize; j++)
            resultSourceRows.push([i, j]);
        if (leftJoin)
            resultSourceRows.push([i, null]);
    }
    for (let i = 0; i < 4; i++)
    {
        const maker = dataTypes[i]!;
        const aValues = Utility.replicateM_Ex(aSize, () => Either.right<string, Value>(maker.makeValue()));
        if (i <= 2)
            aColumns.push(ColumnUtility.makeImmediateColumn(maker.getDataType(), new ColumnId("T " + i), aValues, maker.makeValue()));

        const bValues: Either<string, Value>[] = [];
        // Pick some amount that are the same, and the rest that may or may not be:
        const duplicate = r.nextInt(bSize);
        for (let d = 0; d < duplicate; d++)
            bValues.push(aValues[r.nextInt(aValues.length)]!);
        bValues.push(...Utility.replicateM_Ex(bSize - bValues.length, () => Either.right<string, Value>(maker.makeValue())));

        if (i > 0)
        {
            // To cause deliberate name confusion, second table columns are offset by one:
            bColumns.push(ColumnUtility.makeImmediateColumn(maker.getDataType(), new ColumnId((columnsNamedSame ? "T " : "R ") + (i + 1)), bValues, maker.makeValue()));
        }
        if (i > 0 && i - 1 < joinColumnCount)
        {
            // Remove any non-matches
            for (let a = 0; a < aSize; a++)
            {
                for (let b = 0; b < bSize; b++)
                {
                    if (Utility.compareValues(aValues[a]!.getRight("A"), bValues[b]!.getRight("B")) !== 0)
                        removeFirst(resultSourceRows, [a, b]);
                }
            }
        }
    }

    // Remove left join matches if any are present:
    for (let a = 0; a < aSize; a++)
    {
        if (resultSourceRows.some(p => p[0] === a && p[1] !== null))
            removeFirst(resultSourceRows, [a, null]);
    }

    srcMgr.record(new ImmediateDataSource(srcMgr, new Table.InitialLoadDetails(new TableId("Table A"), null, null, null), new EditableRecordSet(aColumns, () => aSize)));
    srcMgr.record(new ImmediateDataSource(srcMgr, new Table.InitialLoadDetails(new TableId("Table B"), null, null, null), new EditableRecordSet(bColumns, () => bSize)));

    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(srcMgr) }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const grid = a.mainWindow()!.grid()!.grid;
    const targetPos = engineHost(a).tableManager.getNextInsertPosition(null);
    await keyboardMoveTo(grid, targetPos);
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-join")));

    const expJoin: [string, string][] = [];
    if (joinColumnCount >= 1)
        expJoin.push(["T 1", columnsNamedSame ? "T 2" : "R 2"]);
    if (joinColumnCount >= 2)
        expJoin.push(["T 2", columnsNamedSame ? "T 3" : "R 3"]);

    // (Once the dialog shows, the primary table focused)
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true, { timeout: 5000 });
    await write("Table A");
    await push("Tab");
    await write("Table B");
    if (leftJoin)
        await userEvent.click(document.querySelector(".id-join-isLeftJoin")!);
    for (const pair of expJoin)
    {
        await userEvent.click(document.querySelector(".id-fancylist-add")!);
        await vi.waitUntil(() => document.activeElement?.classList.contains("join-primary-column") === true);
        await write(pair[0]);
        await push("Escape");
        await push("Tab");
        await write(pair[1]);
    }
    await userEvent.click(document.querySelector(".ok-button")!);

    const tableA = engineHost(a).tableManager.getSingleTableOrThrow(new TableId("Table A"));
    const tableB = engineHost(a).tableManager.getSingleTableOrThrow(new TableId("Table B"));
    const join = await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find((t): t is Join => t instanceof Join && t.getPrimarySource().getRaw() !== ""), { timeout: 5000 });
    expect(new Set([...join.getSources()].map(t => t.getRaw()))).toEqual(new Set(["Table A", "Table B"]));
    expect(join.isKeepPrimaryWithNoMatch()).toBe(leftJoin);
    expect(join.getColumnsToMatch().map(p => [p.getFirst().getRaw(), p.getSecond().getRaw()])).toEqual(expJoin);

    // Check the data values in the actual table:
    const maybeType = srcMgr.getTypeManager().getMaybeType();
    for (let i = 0; i <= 3; i++)
    {
        const srcOccurrences: [Table, ColumnId][] = [];
        if (i < 3)
            srcOccurrences.push([tableA, new ColumnId("T " + i)]);
        if (i > 0)
            srcOccurrences.push([tableB, new ColumnId((columnsNamedSame ? "T " : "R ") + (i + 1))]);

        for (const [srcTable, srcColName] of srcOccurrences)
        {
            const expected: Either<string, Value>[] = [];
            const srcCol = srcTable.getData().getColumn(srcColName).getType();
            for (const src of resultSourceRows)
            {
                if (tableA === srcTable)
                    expected.push(TBasicUtil.getSingleCollapsedData(srcCol, src[0]));
                else if (leftJoin)
                {
                    if (src[1] !== null)
                        expected.push(TBasicUtil.getSingleCollapsedData(srcCol, src[1]).map(v => new TaggedValue(1, v, maybeType)));
                    else
                        expected.push(Either.right(new TaggedValue(0, null, maybeType)));
                }
                else
                    expected.push(TBasicUtil.getSingleCollapsedData(srcCol, src[1]!));
            }

            // Adjust for overlapping names:
            let joinColName = srcColName;
            if (tableA === srcTable && tableB.getData().getColumnIds().some(c => c.equals(joinColName)))
                joinColName = new ColumnId(tableA.getId().getRaw() + " " + joinColName.getRaw());
            if (tableB === srcTable && tableA.getData().getColumnIds().some(c => c.equals(joinColName)))
                joinColName = new ColumnId(tableB.getId().getRaw() + " " + joinColName.getRaw());
            TBasicUtil.assertValueListEitherEqual("Values for " + srcTable.getId().getRaw() + " -> " + joinColName.getRaw(),
                expected,
                TBasicUtil.getAllCollapsedData(join.getData().getColumn(joinColName).getType(), expected.length));
        }
    }
}, { trials: 5 }), 600_000);
