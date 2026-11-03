// Port of TestBlankMainWindow (tests-gui-central): a new project's window, making data tables, adding
// columns and rows, and undoing.
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { TypeExpression } from "../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { IdentifierUtility } from "../../../src/engine/utility/utility/IdentifierUtility.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenDataTypeMaker } from "../../engine/tests-functions/fixtures/gen/type/GenDataTypeMaker.js";
import { GenTypeAndValueGen } from "../../engine/tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { textToType } from "../../gui-logic/stf/fixtures/textToType.js";
import { checkProperty } from "../../support/quickcheck.js";
import { enterType } from "../base/enterType.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { clickMenu, closeApp, renderApp, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const NEW_TABLE_POS = new CellPosition(CellPosition.row(1), CellPosition.col(1));

// Java: start(), a MainWindow on a new file
async function start(): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const rendered = await renderApp([{ name: "blank", content: "" }], 0);
    await waitForLoaded();
    return rendered;
}

// Both a test, and used as utility method.
async function testStartState(a: RenderedApp): Promise<void>
{
    expect(document.querySelector(".main-window")).not.toBeNull();
    expect(a.transports.length).toBe(1);
    expect(a.transports[0]!.host.tableManager.getAllTables()).toEqual([]);
    // No dialogs or other windows:
    expect(document.querySelectorAll("[role=dialog]").length, [...document.querySelectorAll("[role=dialog]")].map(d => d.textContent).join(" / ")).toBe(0);
}

test("testStartState", async () =>
{
    app = await start();
    await testStartState(app);
});

test("testNewClick", async () =>
{
    app = await start();
    await testStartState(app);
    await clickMenu("id-menu-project", "id-menu-project-new");
    // A second project, in a window of its own (here, another tab):
    await vi.waitUntil(() => app!.openedInNewTab.length === 1);
    const [newId] = app.openedInNewTab;
    expect(newId).not.toBe(shownProject());
    expect((await app.store.get(newId!))?.name).toBe("Untitled-1");
    expect(document.querySelector(".main-window")).not.toBeNull();
});

test("testCloseMenu", async () =>
{
    app = await start();
    await testStartState(app);
    await clickMenu("id-menu-project", "id-menu-project-close");
    // No project window (Java: none left); the tab shows the initial window
    await vi.waitUntil(() => document.querySelector(".initial-window") !== null);
    expect(document.querySelector(".main-window")).toBeNull();
    expect(shownProject()).toBeNull();
});

const shortcut = (key: string): string => isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`;

function tableManager(a: RenderedApp): TableManager
{
    return a.transports.at(-1)!.host.tableManager;
}

async function idle(a: RenderedApp): Promise<void>
{
    await a.mainWindow()!.engine.client.whenIdle();
    await new Promise(r => setTimeout(r, 50));
}

function count(selector: string): number
{
    return document.querySelectorAll(selector).length;
}

// Java: makeNewDataEntryTable: the create-table button at the position, Data Entry, the table's name
// (if given), column "A" of type Text, and OK
async function makeNewDataEntryTable(a: RenderedApp, targetPos: CellPosition, tableName: string | null = null): Promise<void>
{
    const grid = a.mainWindow()!.grid()!.grid;
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(grid, targetPos);
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".create-table-grid-button")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-data")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("table-name-text-field") === true);
    if (tableName !== null)
        await write(tableName);
    await push("Tab");
    await write("A");
    await push("Tab");
    await write("Text");
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".edit-column-content") === null);
    await idle(a);
}

async function undo(a: RenderedApp): Promise<void>
{
    await clickMenu("id-menu-edit", "id-menu-edit-undo");
    await idle(a);
    await new Promise(r => setTimeout(r, 300));
    await idle(a);
}

test("testNewEntryTable", async () =>
{
    app = await start();
    await testNewEntryTable(app);
});

async function testNewEntryTable(a: RenderedApp): Promise<void>
{
    await testStartState(a);
    await makeNewDataEntryTable(a, NEW_TABLE_POS);
    await vi.waitUntil(() => tableManager(a).getAllTables().length === 1);
    const table = tableManager(a).getAllTables()[0]!;
    expect(table.getId().getRaw()).not.toBe("");
    expect(table.getData().getColumns().length).toBe(1);
}

test("testUndoNewEntryTable", async () =>
{
    const a = app = await start();
    await testStartState(a);
    await makeNewDataEntryTable(a, NEW_TABLE_POS);
    await vi.waitUntil(() => tableManager(a).getAllTables().length === 1);
    expect(count(".table-title")).toBe(1);
    await undo(a);
    await vi.waitUntil(() => tableManager(a).getAllTables().length === 0);
    await vi.waitUntil(() => count(".table-title") === 0);
});

test("propUndoNewEntryTable", () => checkProperty([new GenRandom()], async (r: JavaRandom) =>
{
    const a = app = await start();
    const tableIds: string[] = [];
    for (let i = 0; i < 8; i++)
    {
        if (r.nextInt(5) <= 2 || tableIds.length === 0)
        {
            const name = IdentifierUtility.identNum("Table", i);
            await makeNewDataEntryTable(a, NEW_TABLE_POS.offsetByRowCols(4 * tableIds.length, 0), name);
            tableIds.push(name);
        }
        else
        {
            await undo(a);
            tableIds.pop();
        }
        await vi.waitUntil(() => tableManager(a).getAllTables().length === tableIds.length);
        expect(new Set(tableManager(a).getAllTables().map(t => t.getId().getRaw()))).toEqual(new Set(tableIds));
        await vi.waitUntil(() => count(".table-title") === tableIds.length);
    }
}, { trials: 2 }), 300_000);

test("testUndoAddRow", async () =>
{
    const a = app = await start();
    await testStartState(a);
    await makeNewDataEntryTable(a, NEW_TABLE_POS);
    await vi.waitUntil(() => tableManager(a).getAllTables().length === 1);
    expect(tableManager(a).getAllTables()[0]!.getData().getLength()).toBe(0);
    await addNewRow(a);
    await vi.waitUntil(() => tableManager(a).getAllTables()[0]!.getData().getLength() === 1);
    expect(count(".table-title")).toBe(1);
    await vi.waitUntil(() => count(".cell.table-data-cell") === 1);
    await undo(a);
    await vi.waitUntil(() => tableManager(a).getAllTables()[0]?.getData().getLength() === 0);
    expect(tableManager(a).getAllTables().length).toBe(1);
    expect(count(".table-title")).toBe(1);
    await vi.waitUntil(() => count(".cell.table-data-cell") === 0);
});

// Java: @Ignore // TODO re-enable
test.skip("propUndoAddAndEditData", () => {});

test("propAddColumnToEntryTable", () => checkProperty([new GenDataTypeMaker(undefined, true)], async (dataTypeMaker: GenDataTypeMaker.DataTypeMaker) =>
{
    app = await start();
    await addColumnToEntryTable(app, dataTypeMaker.getTypeManager(), dataTypeMaker.makeType().getDataType());
}, { trials: 5 }), 300_000);

async function addColumnToEntryTable(a: RenderedApp, typeManager: TypeManager, dataType: DataType): Promise<void>
{
    tableManager(a).getTypeManager()._test_copyTaggedTypesFrom(typeManager);
    await addNewTableWithColumn(a, dataType, null);
}

// Java: addNewTableWithColumn: a new table, then a column added with the add-column arrow
async function addNewTableWithColumn(a: RenderedApp, dataType: DataType, value: Value | null): Promise<void>
{
    await testNewEntryTable(a);
    const expandRight = await vi.waitUntil(() => document.querySelector(".expand-arrow.expand-right"));
    await userEvent.click(expandRight);
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    const newColName = "Column " + Math.abs(new JavaRandom().nextInt());
    await write(newColName);
    await push("Tab");
    await enterType(TypeExpression.fromDataType(dataType), new JavaRandom(1n));
    await push("Escape");
    if (value !== null)
    {
        const field = document.querySelector<HTMLElement>(".default-value")!;
        await userEvent.click(field.matches("textarea") ? field : field.querySelector("textarea")!);
        await userEvent.keyboard(shortcut("a"));
        await push("Delete");
        await write(textToType(dataType, value, new JavaRandom(1n), true));
    }
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".edit-column-content") === null, { timeout: 2000 }).catch(() =>
    {
        throw new Error("Dialog didn't close: " + (document.querySelector(".error-label")?.textContent ?? "") + " " + dataType.toString());
    });
    await idle(a);
    const columns = tableManager(a).getAllTables()[0]!.getData().getColumns();
    expect(columns.length).toBe(2);
    expect(columns[1]!.getName().getRaw()).toBe(newColName);
    expect(columns[1]!.getType().getType().equals(dataType), columns[1]!.getType().getType().toString() + " vs " + dataType.toString()).toBe(true);
}

test("propDefaultValue", () => checkProperty([new GenTypeAndValueGen()], async (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen) =>
{
    const a = app = await start();
    tableManager(a).getTypeManager()._test_copyTaggedTypesFrom(typeAndValueGen.getTypeManager());
    const initialVal = typeAndValueGen.makeValue();
    await addNewTableWithColumn(a, typeAndValueGen.getType(), initialVal);
    const values: Value[] = [];
    for (let i = 0; i < 3; i++)
    {
        await addNewRow(a);
        values.push(initialVal);
        await vi.waitUntil(() => tableManager(a).getAllTables()[0]!.getData().getLength() === values.length);
        const column = tableManager(a).getAllTables()[0]!.getData().getColumns()[1]!.getType();
        for (let j = 0; j < values.length; j++)
            TBasicUtil.assertValueEqual("Index " + j, values[j]!, column.getCollapsed(j));
    }
}, { trials: 5 }), 300_000);

test("propEnterColumn", () => checkProperty([new GenTypeAndValueGen(), new GenRandom()], async (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
{
    const a = app = await start();
    await addColumnToEntryTable(a, typeAndValueGen.getTypeManager(), typeAndValueGen.getType());
    const values: Either<string, Value>[] = [];
    for (let i = 0; i < 10; i++)
    {
        await addNewRow(a);
        let entry: Either<string, Value>;
        let invalidChar = "";
        let invalidPos = -1;
        if (r.nextInt(8) !== 1 || typeAndValueGen.getType().equals(DataType.TEXT))
        {
            entry = Either.right(typeAndValueGen.makeValue());
        }
        else
        {
            const invalidChars = ["@", "#", "%"];
            invalidChar = invalidChars[r.nextInt(invalidChars.length)]!;
            if (r.nextInt(3) === 1)
            {
                entry = Either.left(invalidChar);
                invalidPos = 0;
            }
            else
            {
                const content = DataTypeUtility.valueToString(typeAndValueGen.makeValue());
                if (r.nextBoolean())
                {
                    entry = Either.left(invalidChar + content);
                    invalidPos = 0;
                }
                else
                {
                    entry = Either.left(content + invalidChar);
                    invalidPos = content.length;
                }
            }
        }
        values.push(entry);
        await enterValue(a, NEW_TABLE_POS.offsetByRowCols(3 + i, 1), entry, typeAndValueGen.getType(), r);
        if (entry.isLeft())
        {
            // The invalid character shows as an error:
            const cell = await vi.waitUntil(() => document.querySelector(`[data-table] .row[data-row="${i}"] .cell[data-col="1"]:not(.loading)`));
            const errors = [...cell.querySelectorAll(".input-error")].map(e => e.textContent).join("");
            expect(errors, cell.textContent ?? "").toContain(invalidChar);
            void invalidPos;
        }
    }
    await idle(a);
    const column = tableManager(a).getAllTables()[0]!.getData().getColumns()[1]!.getType();
    expect(tableManager(a).getAllTables()[0]!.getData().getLength()).toBe(values.length);
    for (let i = 0; i < values.length; i++)
    {
        let actual: Either<string, Value>;
        try
        {
            actual = Either.right(column.getCollapsed(i));
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            actual = Either.left(e.getInvalid());
        }
        TBasicUtil.assertValueEitherEqual("Index " + i, values[i]!, actual);
    }
}, { trials: 3 }), 600_000);

// Java: enterValue: selects the cell, starts editing it (by clicking it again, Enter, or typing), types
// the value, and Enter
async function enterValue(a: RenderedApp, position: CellPosition, value: Either<string, Value>, dataType: DataType, random: JavaRandom): Promise<void>
{
    const grid = a.mainWindow()!.grid()!.grid;
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(grid, position);
    const choice = random.nextInt(3);
    if (choice === 1)
        await push("Enter");
    else if (choice === 0)
        await push("Enter");
    const needDeleteAll = choice !== 2;
    if (needDeleteAll)
    {
        await vi.waitUntil(() => document.activeElement?.closest(".cell-editor") !== null);
        await userEvent.keyboard(shortcut("a"));
        await push("Delete");
    }
    await value.either(async s => await write(s), async v => await write(textToType(dataType, v, random, true)));
    await vi.waitUntil(() => document.activeElement?.closest(".cell-editor") !== null);
    await push("Enter");
    await idle(a);
}

// Java: addNewRow: clicks the add-row arrow
async function addNewRow(a: RenderedApp): Promise<void>
{
    const before = tableManager(a).getAllTables()[0]!.getData().getLength();
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".expand-arrow.expand-down")));
    await vi.waitUntil(() => tableManager(a).getAllTables()[0]!.getData().getLength() === before + 1);
    await idle(a);
}

