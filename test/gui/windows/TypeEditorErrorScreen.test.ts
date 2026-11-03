// The screen checks of TestTypeEditorError (tests-gui-type-editor), whose errors are checked against the
// type lexer in test/gui-logic/tests-gui-type-editor/: each type is typed into the type editor of a new
// table's column, in the new-column dialog, and the errors must show (underlined, and in the popup)
// once the caret leaves them or OK is clicked, which then doesn't close the dialog.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { CanonicalSpan } from "../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import { javaStringHashCode } from "../../../src/engine/java/JavaObject.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

// An expected error (the logic test, in test/gui-logic/, checks the messages): here only where it is
interface ExpectedError
{
    readonly location: CanonicalSpan;
}
const e = (start: number, end: number, ..._messageParts: string[]): ExpectedError => ({ location: new CanonicalSpan(start, end) });

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const errorPopupShowing = (): boolean => document.querySelector(".expression-info-popup.error") !== null;

// Java: assertErrorShowing
function assertErrorShowing(underlineShowing: boolean, popupShowing: boolean | null): void
{
    expect(document.querySelectorAll(".type-editor .error-underline").length > 0, "Underline showing").toBe(underlineShowing);
    if (popupShowing !== null)
        expect(errorPopupShowing(), "Popup showing").toBe(popupShowing);
}

async function clickOk(): Promise<void>
{
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
    await new Promise(r => setTimeout(r, 300));
}

async function testError(expression: string, ...errors: ExpectedError[]): Promise<void>
{
    const a = app = await renderApp([{ name: "P", content: "" }], 0);
    await waitForLoaded();
    // Java: TAppUtil.openDataAsTable(..., managerWithTestTypes)
    a.transports[0]!.host.tableManager.getTypeManager()._test_copyTaggedTypesFrom(TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager());
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(a.mainWindow()!.grid()!.grid, new CellPosition(CellPosition.row(1), CellPosition.col(1)));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".create-table-grid-button")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-data")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("table-name-text-field") === true);
    await write("Table1");
    await push("Tab");
    await write("Column1");
    // Focus type editor:
    await push("Tab");
    await enterAndDeleteSmartBrackets(expression);
    await new Promise(r => setTimeout(r, 200));

    if (errors.length === 0)
    {
        assertErrorShowing(false, false);
        // Clicking OK should be fine:
        await clickOk();
        expect(document.querySelector(".type-editor"), "Type editor").toBeNull();
    }
    else
    {
        const hasSpanNotContainingEnd = errors.some(s => !s.location.touches(expression.length));
        assertErrorShowing(hasSpanNotContainingEnd, false);

        // Can either provoke error by moving caret into a span or by
        // clicking ok first time
        if (hasSpanNotContainingEnd && javaStringHashCode(expression) % 2 === 0)
        {
            // Move into span:
            let seenPopup = false;
            for (let i = 0; i < expression.length; i++)
            {
                await push("ArrowLeft");
                if (errorPopupShowing())
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
            await clickOk();
            expect(document.querySelector(".type-editor"), "Type editor still showing").not.toBeNull();
            assertErrorShowing(true, null);

            // Should still show even if you click again:
            await userEvent.click(document.querySelector(".ok-button")!);
            await new Promise(r => setTimeout(r, 300));
            expect(document.querySelector(".type-editor"), "Type editor still showing").not.toBeNull();
        }
        await userEvent.click(document.querySelector(".cancel-button")!);
    }
}

describe("TestTypeEditorError (screen)", () =>
{
    test("testFine1", () => testError("Text"));
    test("testFine2", () => testError(TypeManager.MAYBE_NAME + "(Text)"));
    test("testFine3", () => testError("[" + TypeManager.MAYBE_NAME + "(Number{m})]"));
    test("testExtraOp", () => testError("Text,", e(5, 5, "missing")));
    test("testInvalidChar", () => testError("Text#", e(4, 4, "missing", "operator"), e(4, 5, "not allowed")));
    test("testInvalidBracket1", () => testError("Number()", e(6, 6, "missing"), e(7, 7, "empty")));
    test("testInvalidEmptyBracket", () => testError("()", e(1, 1, "empty")));
    test("testUnclosedRound", () => testError("(", e(1, 1, "missing")));
    test("testUnclosedCurly", () => testError("Number{", e(6, 7, "missing")));
    test("testEmptyUnit", () => testError("Number{}", e(7, 7, "missing")));
    test("testOnlyUnit", () => testError("{m}", e(0, 3, "unit")));
    test("testUnknownUnit", () => testError("Number{zzz}", e(7, 10, "unknown")));
    test("testUnknownUnit2", () => testError("(a:Number{zzz}, b:Text)", e(10, 13, "unknown")));
    test("testUnitInvalidOp", () => testError("Number{m**m}", e(9, 9, "missing")));
    test("testUnitInvalidOp2", () => testError("Number{m^m}", e(7, 10, "raise")));
    test("testUnknown0", () => testError("NumbeX", e(0, 6, "unknown")));
    test("testUnknown1", () => testError("NumberX", e(0, 7, "unknown")));
    test("testUnknown2", () => testError("Number X", e(0, 8, "unknown")));
    test("testRecord", () => testError("(a: Text, b: Number)"));
    test("testRecord2", () => testError("(Number: Text, Text: Number, Boolean: [Date], DateYM : Boolean)"));
    test("testBadTuple1", () => testError("Text,Number", e(0, 11, "bracket")));
    test("testBadTuple2", () => testError("[Text,Number]", e(1, 12, "invalid")));
});
