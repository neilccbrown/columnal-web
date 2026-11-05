// The port of TestExpressionEditorPosition (tests-gui-expression-editor-position): an expression typed
// into a new Calculate column's expression editor shows as expected, and the caret goes to the expected
// positions with Left and Right, with them by words, by clicking where it was, and double-clicking there
// selects the word; again once the dialog is opened again.  And Left and Right always come to an end.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { _test_editors, type TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { checkProperty } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickAt, clickOnItemInBounds } from "../base/clickTableLocation.js";
import { doubleOk } from "../base/doubleOk.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { getFocusOwner } from "../base/focusOwner.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java: TypeManager.MAYBE_NAME.length()
const M = "Optional".length;
const targetPos = new CellPosition(CellPosition.row(5), CellPosition.col(5));

// Java's tables: S1..3 (text) and ACC1..3 (numbers in m/s^2), and for the display tests Str and "The quick
// brown fox" (text); none with rows
async function open(extraColumns: boolean): Promise<{ a: RenderedApp, columns: number }>
{
    let columnCount = 0;
    const content = savedFile(manager =>
    {
        const u = new UnitManager();
        const typeManager = new TypeManager(u);
        typeManager._test_copyTaggedTypesFrom(TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager());
        manager.getTypeManager()._test_copyTaggedTypesFrom(typeManager);
        const columns: ((rs: RecordSet) => EditableColumn)[] = [];
        for (let i = 1; i <= 3; i++)
        {
            columns.push(rs => new MemoryStringColumn(rs, new ColumnId("S" + i), [], ""));
            columns.push(rs => new MemoryNumericColumn(rs, new ColumnId("ACC" + i), new NumberInfo(manager.getUnitManager().loadUse("m/s^2")), [], ZERO));
        }
        if (extraColumns)
        {
            columns.push(rs => new MemoryStringColumn(rs, new ColumnId("Str"), [], ""));
            columns.push(rs => new MemoryStringColumn(rs, new ColumnId("The quick brown fox"), [], ""));
        }
        columnCount = columns.length;
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(columns, () => 0)));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, targetPos);
    // Only need to click once as already selected by keyboard:
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("text-field") === true);
    await write("Table1");
    await push("Enter");
    await sleep(200);
    // (The dialog shows once the engine has made the Calculate)
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("DestCol");
    // Focus expression editor:
    await push("Tab");
    return { a, columns: columnCount };
}

// Java: getEditorDisplay, the focus owner
function editor(): TopLevelEditorApi<Expression>
{
    const focusOwner = getFocusOwner();
    const e = focusOwner === null ? undefined : _test_editors.get(focusOwner.closest(".top-level-editor")!);
    if (e === undefined)
        throw new Error("Focus owner is " + String(focusOwner?.className));
    return e as unknown as TopLevelEditorApi<Expression>;
}

const getPosition = (): number => editor()._test_getContent().getCaretPosition();
const getAnchorPosition = (): number => editor()._test_getContent().getAnchorPosition();
// Java: the TextFlow's text
const getDisplayText = (): string => editor()._test_getContent().getDisplay().toPlain();

// Java: getCaretPosOnScreen, the centre of the caret
function getCaretPosOnScreen(): { x: number, y: number }
{
    const view = editor()._test_getView()!;
    const r = view.coordsAtPos(view.state.selection.main.head)!;
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

const wordKey = isMac() ? "Alt" : "Control";

async function testCaretPositionsAndDisplay(r: JavaRandom, internalContent: string, display: string, internalCaretPos: readonly number[], wordBoundaryCaretPos: readonly number[] = internalCaretPos): Promise<void>
{
    const { columns } = await open(true);
    await enterAndDeleteSmartBrackets(internalContent);

    // Once for initial load, twice for opening editor again
    for (let i = 0; i < 2; i++)
    {
        const caretCentres: ({ x: number, y: number } | null)[] = internalCaretPos.map(() => null);
        expect(getDisplayText()).toBe(display);

        await push("Home");
        let curIndex = 0;
        while (curIndex < internalCaretPos.length)
        {
            // Speed up by not assessing every position on every run:
            if (r.nextInt(10) === 1)
                caretCentres[curIndex] = getCaretPosOnScreen();
            expect(getPosition(), "Index " + curIndex).toBe(internalCaretPos[curIndex]);
            curIndex += 1;
            await push("ArrowRight");
        }
        await push("End");
        curIndex = internalCaretPos.length - 1;
        while (curIndex >= 0)
        {
            expect(getPosition()).toBe(internalCaretPos[curIndex]);
            curIndex -= 1;
            await push("ArrowLeft");
        }

        await push("Home");
        curIndex = 0;
        await userEvent.keyboard(`{${wordKey}>}`);
        while (curIndex < wordBoundaryCaretPos.length)
        {
            expect(getPosition(), "Index " + curIndex).toBe(wordBoundaryCaretPos[curIndex]);
            curIndex += 1;
            await push("ArrowRight");
        }
        await push("End");
        curIndex = wordBoundaryCaretPos.length - 1;
        while (curIndex >= 0)
        {
            expect(getPosition()).toBe(wordBoundaryCaretPos[curIndex]);
            curIndex -= 1;
            await push("ArrowLeft");
        }
        await userEvent.keyboard(`{/${wordKey}}`);

        for (let clickIndex = 0; clickIndex < caretCentres.length; clickIndex++)
        {
            const caretCentre = caretCentres[clickIndex] ?? null;
            if (caretCentre === null)
                continue;
            await moveAndDismissPopupsAtPos(caretCentre);
            await sleep(400);
            const point = { x: caretCentre.x + 1, y: caretCentre.y };
            await clickAt(document.elementFromPoint(point.x, point.y)!, point);
            expect(getPosition(), "Clicked: " + JSON.stringify(point)).toBe(internalCaretPos[clickIndex]);
            // Try double-click just after the position:
            await push("ArrowLeft");
            // (Java faked the double click: EditorDisplay._test_doubleClickOn)
            editor()._test_getView()!.contentDOM.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 2, clientX: point.x, clientY: point.y }));
            await sleep(0);
            const lhsSel = findPrev(wordBoundaryCaretPos, internalCaretPos[clickIndex === internalCaretPos.length - 1 ? clickIndex - 1 : clickIndex]!);
            expect(getAnchorPosition(), "Double clicked: " + JSON.stringify(point)).toBe(lhsSel);
            expect(getPosition(), "Double clicked: " + JSON.stringify(point)).toBe(findNext(wordBoundaryCaretPos, internalCaretPos[clickIndex]!));

            // Cancel selection:
            await push("ArrowLeft");
            expect(getPosition(), "Left after click: " + JSON.stringify(point)).toBe(lhsSel);
        }

        // Dismiss dialog:
        await doubleOk();

        if (i === 0)
        {
            // Bring editor up again:
            await keyboardMoveTo(app!.mainWindow()!.grid()!.grid, targetPos.offsetByRowCols(1, columns));
            await push("Enter");
            // (Java: clickOn("DestCol"), the dialog's name field)
            await userEvent.click(await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".column-name-text-field"), { timeout: 5000 }));
            await push("Tab");
            await vi.waitUntil(() => document.activeElement?.closest(".expression-editor") !== null);
        }
    }
}

// Java: IntStream.range
function range(from: number, toExcl: number): number[]
{
    return Array.from({ length: toExcl - from }, (_x, i) => from + i);
}

function findPrev(wordBoundaryCaretPos: readonly number[], caretPos: number): number
{
    const index = wordBoundaryCaretPos.findLastIndex(w => w <= caretPos);
    return wordBoundaryCaretPos[index === -1 ? 0 : index]!;
}

function findNext(wordBoundaryCaretPos: readonly number[], caretPos: number): number
{
    const index = wordBoundaryCaretPos.findIndex(w => w > caretPos);
    return wordBoundaryCaretPos[index === -1 ? wordBoundaryCaretPos.length - 1 : index]!;
}

// Tests that you can get back to the caret positions that were seen during insertion, by using left and
// right cursor keys
async function testCaretPositions(content: string): Promise<void>
{
    await open(false);
    await write(content);

    // We check that if we go all-left then all-right, we reach a termination point
    // in each case (as opposed to looping forever somewhere in the middle)
    let curPosition = getPosition();
    let oldPosition: number | null = null;
    let maxRemaining = 3 * content.length + 5;
    while (curPosition !== oldPosition && --maxRemaining > 0)
    {
        await push("ArrowLeft");
        oldPosition = curPosition;
        curPosition = getPosition();
    }
    expect(maxRemaining).not.toBe(0);

    curPosition = getPosition();
    oldPosition = null;
    maxRemaining = 3 * content.length + 5;
    while (curPosition !== oldPosition && --maxRemaining > 0)
    {
        await push("ArrowRight");
        oldPosition = curPosition;
        curPosition = getPosition();
    }
    expect(maxRemaining).not.toBe(0);

    // Dismiss dialog:
    await push("Escape");
    await push("Escape");
    await doubleOk();
}

describe("TestExpressionEditorPosition", () =>
{
    test("testPosition1", () => testCaretPositions("1"), 60_000);
    test("testPosition2", () => testCaretPositions("1+2"), 60_000);
    test("testPosition3", () => testCaretPositions("\"ab\";\"yz\""), 60_000);
    test("testPosition4", () => testCaretPositions("@iftrue@thensum(3+\"az\")@elsefalse@endif"), 60_000);
    test("testPos1", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1", "1", [0, 1]), { trials: 1 }), 120_000);
    test("testPos2", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+2", "1 + 2", [0, 1, 2, 3]), { trials: 1 }), 120_000);
    test("testPos3", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@iftrue@thensum(3+\"az\")@elsefalse@endif", "@if true\n  @then sum(3 + \"az\")\n  @else false\n@endif ", [0, 3,4,5,6,7, 12,13,14,15,16,17,18,19,20,21,22,23,  28,29,30,31,32,33, 39], [0, 3, 7, 12, 15,16,17,18,19,21,22,23,28,33,39] ), { trials: 1 }), 120_000);
    test("testPos4", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "ACC1>ACC2", "ACC1 > ACC2", [0,1,2,3,4, 5,6,7,8,9], [0, 4, 5, 9]), { trials: 1 }), 120_000);
    test("testPos5", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "Str>Str", "Str > Str", [0,1,2,3, 4,5,6,7], [0, 3, 4, 7]), { trials: 1 }), 120_000);
    test("testPos6", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "ACC1<>3{(m/s)/s}", "ACC1 <> 3{(m/s)/s}", [0,1,2,3,4, 6,7,8,9,10,11,12,13,14,15,16], [0,4,6,7,8,9,10,11,12,13,14,15,16]), { trials: 1 }), 120_000);
    test("testPos7", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "abs(1+2)=sum([3/4])", "abs(1 + 2) = sum([3 / 4])", [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19], [0,3,4,5,6,7,8,9,12,13,14,15,16,17,18,19] ), { trials: 1 }), 120_000);
    test("testPos8", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "from string to(type{Optional(Number{m},Text)},\"Maybe Not\")", "from string to(type{Optional(Number{m}, Text)}, \"Maybe Not\")", [...range(0, 16), ...range(20, 51 + M)], [0, 14, 15, 20, 20 + M, 21 + M, 27 + M, 28 + M, 29 + M, 30 + M, 31 + M, 35 + M, 36 + M, 37 + M, 38 + M, 39 + M, 48 + M, 49 + M, 50 + M]), { trials: 1 }), 120_000);
    test("testPos9", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "date{2019}<=time{20:10}<type{Number{}}", "date{2019} <= time{20:10} < type{Number{ }}", [0, 5,6,7,8,9,10, 12, 17,18,19,20,21,22,23, 24, 29,30,31,32,33,34,35,36,37,38], [0, 5, 9, 10, 12, 17, 22,23,24, 29, 35,36,37,38] ), { trials: 1 }), 120_000);
    test("testPos10", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@definex=3@thenx@enddefine", "@define x = 3\n  @then x\n@enddefine ", [0, 7,8,9,10, 15,16, 26] ), { trials: 1 }), 120_000);
    test("testPos11", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@definex=3,abc=x@thenabc@enddefine", "@define x = 3, \n       abc = x\n  @then abc\n@enddefine ", [0, 7,8,9,10, 11,12,13,14,15,16, 21,22,23,24, 34], [0, 7,8,9,10, 11,14,15,16, 21,24, 34] ), { trials: 1 }), 120_000);
    test("testPos12", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@match3@case5@then7@endmatch", "@match 3\n  @case 5 @then 7\n@endmatch ", [0, 6,7, 12,13, 18,19, 28] ), { trials: 1 }), 120_000);
    test("testPos13", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@match3@case5@then7@casexyz@thenxyz@endmatch", "@match 3\n  @case 5 @then 7\n  @case xyz @then xyz\n@endmatch ", [0, 6,7, 12,13, 18,19, 24,25,26,27, 32,33,34,35, 44], [0, 6,7, 12,13, 18,19, 24,27, 32,35, 44] ), { trials: 1 }), 120_000);
    test("testPos14", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@if1<(2*3)@then0@else1@endif", "@if 1 < (2 * 3)\n  @then 0\n  @else 1\n@endif ", [0, 3,4,5,6,7,8,9,10,  15,16, 21,22, 28] ), { trials: 1 }), 120_000);
    test("testPos15", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@match[3]@case[]@then7@case[1+(2*3)]@then99@case[1]@giventrue&(true|false)@then8@endmatch", "@match [3]\n  @case [] @then 7\n  @case [1 + (2 * 3)] @then 99\n  @case [1] @given true & (true | false) @then 8\n@endmatch ", [0, 6,7,8,9,  14,15,16, 21,22, 27,28,29,30,31,32,33,34,35,36, 41,42,43, 48,49,50,51, 57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74, 79,80,89], [0, 6,7,8,9,  14,15,16, 21,22, 27,28,29,30,31,32,33,34,35,36, 41,43, 48,49,50,51, 57,61,62,63,67,68,73,74, 79,80,89]), { trials: 1 }), 120_000);
    // Java: @Ignore
    test.skip("testPos16", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@definex::[Text],x=[\"a\";\"b\"]@thenx;(x;x)@enddefine", "@define x :: [Text], \n       x = [\"a\" ; \"b\"]\n  @then x ; (x ; x)\n@enddefine ", [0,7,8,10,11,12,13,14,15,16, 17,18,19,20,21,22,23,24,25,26,27,28,  33,34,35,36,37,38,39,40,50], [0,7,8,10,11,15,16, 17,18,19,20,21,22,23,24,25,26,27,28,  33,34,35,36,37,38,39,40,50] ), { trials: 1 }), 120_000);
    test("testPosConstructors", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+Is(2)", "1 + Is(2)", [0,1,2,3,4,5,6,7], [0,1,2, 4,5,6,7]), { trials: 1 }), 120_000);
    test("testPosConstructors2", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+Nested(2)", "1 + Nested(2)", [0,1,2,3,4,5,6,7,8,9,10,11], [0,1,2, 8,9,10,11]), { trials: 1 }), 120_000);
    test("testPosConstructors3", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+B\\Single(2)", "1 + B\\Single(2)", [0,1,2,3,4,5,6,7,8,9,10,11,12,13], [0,1,2, 10,11,12,13]), { trials: 1 }), 120_000);
    test("testPosConstructors4", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+Nested(A\\Single(2))", "1 + Nested(A\\Single(2))", [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21], [0,1,2,8,9,17,18,19,20,21]), { trials: 1 }), 120_000);
    test("testPosDoubleSpace", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "The quick  brown fox>Str", "The quick brown fox > Str", [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19, 20,21,22,23], [0,19, 20,23]), { trials: 1 }), 120_000);
    test("testPosDoubleSpace2", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "The quick  brown  fox>The quick brown fox", "The quick brown fox > The quick brown fox", [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19, 20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39], [0,19, 20, 39]), { trials: 1 }), 120_000);
    test("testPosIncomplete1", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1+", "1 +  ", [0, 1, 2]), { trials: 1 }), 120_000);
    test("testPosIncomplete2", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1<", "1 <  ", [0, 1, 2]), { trials: 1 }), 120_000);
    test("testPosIncomplete2b", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "1<=", "1 <=  ", [0, 1, 3]), { trials: 1 }), 120_000);
    test("testPosIncomplete3", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@i", "@i", [0, 1, 2], [0,2]), { trials: 1 }), 120_000);
    test("testPosIncomplete4", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@if", "@if  ", [0, 3]), { trials: 1 }), 120_000);
    test("testPosIncomplete5", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@if@then@else@endif", "@if  \n  @then  \n  @else  \n@endif ", [0, 3, 8, 13, 19]), { trials: 1 }), 120_000);
    // Java: @Ignore
    test.skip("testPosIncomplete6", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@iftrue@then(1+2@else3@endif+1", "@if true\n  @then (1 + 2\n  @else 3\n@endif  + 1", [0, 3,4,5,6,7, 12,13,14,15,16, 21,22, 28,29,30], [0, 3,7, 12,13,14,15,16, 21,22, 28,29,30]), { trials: 1 }), 120_000);
    test("testPosIncompleteCase", () => checkProperty([new GenRandom()], (r: JavaRandom) => testCaretPositionsAndDisplay(r, "@case", "  @case ", [0, 5]), { trials: 1 }), 120_000);
});
