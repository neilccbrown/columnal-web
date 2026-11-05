// Port of test.gui.expressionEditor.BaseTestExpressionEditorError (tests-gui-base): an expression typed
// into a new Calculate column's editor has the expected errors, which show (underlined, and in a popup)
// only once the caret leaves them or OK is clicked, and show from the outset when the dialog is opened
// again.  The table, Table1, has text columns S1-S3 and number columns ACC1-ACC3 (in m/s^2), and a row.
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { javaStringHashCode } from "../../../src/engine/java/JavaObject.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { EditorLocationAndErrorRecorder } from "../../../src/gui-logic/lex-editor/gui/lexeditor/EditorLocationAndErrorRecorder.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { CanonicalSpan } from "../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import { containsInOrder, type ExpectedError } from "../../gui-logic/lex-editor/EditorTestUtil.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { clickOnItemInBounds } from "./clickTableLocation.js";
import { doubleOk } from "./doubleOk.js";
import { settle, waitForOneEditor } from "./editorDisplay.js";
import { push, write } from "./keyboard.js";
import { moveAndDismissPopupsAtPos } from "./popup.js";
import { scrollTo } from "./scrollTo.js";
import { sleep } from "./util.js";

export { e } from "../../gui-logic/lex-editor/EditorTestUtil.js";

let app: RenderedApp | null = null;

/** For the test file's afterEach. */
export async function closeErrorTestApp(): Promise<void>
{
    if (app !== null)
        await closeApp(app);
    app = null;
}

const centre = (element: Element): { x: number, y: number } =>
{
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const showing = (selector: string): boolean => document.querySelector(selector) !== null;

/**
 * Checks that errors don't show up while still in the span, but do show up when you move out or when
 * you click OK.  If the expression has \u0000 as its first character, bracket auto-matching is relied
 * upon.  If no such character is there, auto-inserted brackets are deleted as they are entered, then
 * typed manually later on.
 */
export async function testError(expression: string, ...errors: ExpectedError[]): Promise<void>
{
    const content = savedFile(manager =>
    {
        const u = manager.getUnitManager();
        const columns: ((rs: RecordSet) => EditableColumn)[] = [];
        for (let i = 1; i <= 3; i++)
        {
            columns.push(rs => new MemoryStringColumn(rs, new ColumnId("S" + i), [Either.right("Hi " + i)], ""));
            columns.push(rs => new MemoryNumericColumn(rs, new ColumnId("ACC" + i), new NumberInfo(u.loadUse("m/s^2")), [Either.right(new Decimal(i))], ZERO));
        }
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(columns, () => 1)));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);

    const grid = a.mainWindow()!.grid()!.grid;
    const targetPos = new CellPosition(CellPosition.row(6), CellPosition.col(3));
    for (let i = 0; i < 2; i++)
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
    for (const c of expression)
    {
        if (c !== "\u0000")
            await write(c);
        // Delete auto-matched brackets:
        if (!expression.startsWith("\u0000") && "({[\"".includes(c))
            await push("Delete");
    }
    await settle();

    if (errors.length === 0)
    {
        assertErrorShowing(false, false);
        // Clicking OK should be fine:
        await moveAndDismissPopupsAtPos(centre(document.querySelector(".ok-button")!));
        await userEvent.click(document.querySelector(".ok-button")!);
        await sleep(300);
        expect(showing(".expression-editor"), "Expression editor").toBe(false);
    }
    else
    {
        const editorDisplay = await waitForOneEditor<Expression>();
        const shownErrors = (): EditorLocationAndErrorRecorder.ErrorDetails[] => editorDisplay._test_getContent().getErrors().filter(err => err.error.getLength() > 0).sort((x, y) => x.location.compareTo(y.location));
        let actualErrors = shownErrors();
        const expectedErrors = [...errors].sort((x, y) => x.location.compareTo(y.location));
        const describe = (): string => actualErrors.map(err => err.location.toString() + " " + err.error.toPlain()).join("; ");
        expect(actualErrors.length, describe()).toBe(expectedErrors.length);
        for (let i = 0; i < expectedErrors.length; i++)
        {
            expect(actualErrors[i]!.location.toString(), "Error: " + actualErrors[i]!.error.toPlain()).toBe(expectedErrors[i]!.location.toString());
            expect(containsInOrder(actualErrors[i]!.error.toPlain(), expectedErrors[i]!.expectedMessageParts), actualErrors[i]!.error.toPlain() + " should contain " + expectedErrors[i]!.expectedMessageParts.join("…")).toBe(true);
        }

        // Not necessarily caret pos of the end, if they
        // entered auto-matched brackets.
        const endingCaretPos = editorDisplay._test_getContent().getCaretPosition();

        const hasSpanNotContainingEndingPos = errors.some(s => !s.location.touches(endingCaretPos));
        assertErrorShowing(hasSpanNotContainingEndingPos, false);

        // Can either provoke error by moving caret into a span or by
        // clicking ok first time
        if (hasSpanNotContainingEndingPos && javaStringHashCode(expression) % 2 === 0)
        {
            // Move into span:
            let seenPopup = false;
            for (let i = 0; i < expression.length; i++)
            {
                await push("ArrowLeft");
                await settle();
                if (isShowingErrorPopup())
                {
                    seenPopup = true;
                    break;
                }
            }
            expect(seenPopup, "Error popup showed somewhere").toBe(true);
        }
        else
        {
            // Click ok and check dialog remains and error shows up
            await moveAndDismissPopupsAtPos(centre(document.querySelector(".ok-button")!));
            await userEvent.click(document.querySelector(".ok-button")!);
            await sleep(300);
            // Make sure it's still showing:
            expect(showing(".expression-editor"), "Expression editor still showing").toBe(true);
            assertErrorShowing(true, null);
            expect(showing(".ok-double-prompt"), "OK double prompt").toBe(true);
        }

        actualErrors = shownErrors();
        for (let i = 0; i < expectedErrors.length; i++)
        {
            const start = expectedErrors[i]!.location.start;
            const end = expectedErrors[i]!.location.end;
            const expectedDisplay = expectedErrors[i]!.displayLocation ?? new CanonicalSpan(start, start === end ? end + 1 : end);
            const actualDisplay = actualErrors[i]!.displayLocation;
            expect(actualDisplay === null ? null : actualDisplay.start + "->" + actualDisplay.end, "Error: " + actualErrors[i]!.error.toPlain()).toBe(expectedDisplay.start + "->" + expectedDisplay.end);
        }

        await doubleOk();
        expect(showing(".expression-editor"), "Expression editor still showing").toBe(false);
        // Show again and check error is showing from the outset:
        // (Once the engine has given the Calculate its column)
        const title = await vi.waitUntil(() => [...document.querySelectorAll(".column-title")].find(t => t.textContent?.trim() === "DestCol"), { timeout: 5000 });
        await scrollTo(title);
        await userEvent.click(title);
        await vi.waitUntil(() => showing(".expression-editor"), { timeout: 5000 });
        await settle();
        assertErrorShowing(true, false);
        // Check it shows if you move into it:
        await push("Tab");
        await push("Home");
        let seenPopup = false;
        for (let i = 0; i < expression.length; i++)
        {
            await push("ArrowRight");
            await settle();
            if (isShowingErrorPopup())
            {
                seenPopup = true;
                break;
            }
        }
        expect(seenPopup, "Error popup showed somewhere").toBe(true);

        await doubleOk();
        expect(showing(".expression-editor"), "Expression editor still showing").toBe(false);
    }
}

function assertErrorShowing(underlineShowing: boolean, errorPopupShowing: boolean | null): void
{
    expect(showing(".expression-editor .error-underline"), "Underline showing").toBe(underlineShowing);
    if (errorPopupShowing !== null)
        expect(isShowingErrorPopup(), "Popup showing").toBe(errorPopupShowing);
}

function isShowingErrorPopup(): boolean
{
    // Important to check the .error part too, as it may be showing information or a prompt and that's fine:
    return showing(".expression-info-popup.error");
}
