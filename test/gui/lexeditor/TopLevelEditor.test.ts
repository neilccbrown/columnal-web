// The lex editor on CodeMirror (docs/gui-spec/lex-editor.md): the display, keys, mouse, errors and
// fixes, completions, the clipboard and input methods.
/// <reference types="@vitest/browser-playwright" />
import { describe, expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import type { StyledShowable } from "../../../src/engine/utility-error/styled/StyledShowable.js";
import type { CodeCompletionContext } from "../../../src/gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import type { Lexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/Lexer.js";
import { TypeLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import TopLevelEditor from "../../../src/gui/lexeditor/TopLevelEditor.vue";
import type { TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { copyToClipboard } from "../base/clipboard.js";
import { sleep } from "../base/util.js";
import { testExpressionLexer, testTypeManager } from "../fixtures/lexers.js";

type Api = TopLevelEditorApi<StyledShowable>;

interface Mounted
{
    readonly editor: Api;
    // The editor's element
    readonly root: HTMLElement;
    readonly changes: StyledShowable[];
    // Key events which got past the editor
    readonly keysOutside: string[];
}

async function mount(lexer: Lexer<StyledShowable, CodeCompletionContext>, originalContent: string | null = null): Promise<Mounted>
{
    cleanup();
    const editor = ref<Api | null>(null);
    const changes: StyledShowable[] = [];
    const keysOutside: string[] = [];
    render(defineComponent(() => () => h("div", { style: { padding: "150px 20px 20px" }, onKeydown: (e: KeyboardEvent) => keysOutside.push(e.key) }, [
        h(TopLevelEditor as never, { ref: editor, lexer, originalContent, editorClass: "test-editor", onChange: (e: StyledShowable) => changes.push(e) }),
    ])));
    await settle();
    return { editor: editor.value!, root: document.querySelector<HTMLElement>(".test-editor")!, changes, keysOutside };
}

const expressionEditor = (originalContent: string | null = null): Promise<Mounted> => mount(testExpressionLexer() as never, originalContent);
// As a new column's type editor: a concrete type, not empty
const typeEditor = (originalContent: string | null = null): Promise<Mounted> => mount(new TypeLexer(testTypeManager(), true, false) as never, originalContent);

// Lets the sync with the content (a microtask) and a frame run
async function settle(): Promise<void>
{
    await new Promise(r => requestAnimationFrame(r));
    await sleep(0);
}

async function focus(root: HTMLElement): Promise<void>
{
    await userEvent.click(root.querySelector(".cm-content")!);
    await settle();
}

async function keys(text: string): Promise<void>
{
    await userEvent.keyboard(text);
    await settle();
}

// CodeMirror's text and selection
function cm(editor: Api): { doc: string, head: number, anchor: number }
{
    const state = editor._test_getView()!.state;
    return { doc: state.doc.toString(), head: state.selection.main.head, anchor: state.selection.main.anchor };
}

function lineOfCaret(editor: Api): number
{
    const view = editor._test_getView()!;
    return view.state.doc.lineAt(view.state.selection.main.head).number;
}

// Clicks at the given display position (count 2 for a double click)
async function clickAtDisplay(m: Mounted, displayPos: number, count: 1 | 2 | 3 = 1): Promise<void>
{
    const at = m.editor._test_getView()!.coordsAtPos(displayPos)!;
    const element = m.root.querySelector<HTMLElement>(".cm-content")!;
    const box = element.getBoundingClientRect();
    const position = { x: at.left - box.left + 1, y: (at.top + at.bottom) / 2 - box.top };
    if (count === 1)
        await userEvent.click(element, { position });
    else if (count === 2)
        await userEvent.dblClick(element, { position });
    else
        await userEvent.tripleClick(element, { position });
    await settle();
}

const shortcut = (key: string): string => isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`;
const selectedCompletion = (m: Mounted): string | null => m.editor._test_getDisplay()._test_getAutoComplete()._test_getWindow()?._test_getSelectedContent() ?? null;
const infoPopup = (): HTMLElement | null => document.querySelector(".expression-info-popup");
const completionList = (): HTMLElement | null => document.querySelector(".lex-completion-list");

describe("TopLevelEditor", () =>
{
    test("the display differs from the content", async () =>
    {
        const m = await expressionEditor();
        await focus(m.root);
        await keys("1+2");
        expect(m.editor._test_getRawText()).toBe("1+2");
        expect(cm(m.editor)).toEqual({ doc: "1 + 2", head: 5, anchor: 5 });
        // Spaces typed are removed from the content, as Java's lexer did:
        await keys("  *3");
        expect(m.editor._test_getRawText()).toBe("1+2*3");
        expect(cm(m.editor).doc).toBe("1 + 2 * 3");
        // Each change was given out, after the forced save when it was made:
        expect(m.changes.length).toBeGreaterThan(1);
        expect(m.changes.at(-1)!.toStyledString().toPlain()).toBe(m.editor.save(false).toStyledString().toPlain());
    });

    test("matched brackets and overtyping", async () =>
    {
        const m = await expressionEditor();
        await focus(m.root);
        await keys("abs(");
        expect(m.editor._test_getRawText()).toBe("abs()");
        expect(m.editor._test_getContent().getCaretPosition()).toBe(4);
        await keys("3)");
        expect(m.editor._test_getRawText()).toBe("abs(3)");
        expect(m.editor._test_getContent().getCaretPosition()).toBe(6);
    });

    test("the caret skips inside keywords", async () =>
    {
        const m = await expressionEditor("@if true @then 1 @else 2 @endif");
        await focus(m.root);
        await keys("{Home}{ArrowRight}");
        // Content position 3 (after "@if") shows at display position 4 (after "@if ")
        expect(m.editor._test_getContent().getCaretPosition()).toBe(3);
        expect(cm(m.editor).head).toBe(4);
        expect(m.editor._test_getView()!.state.doc.lines).toBe(4);
    });

    test("Up and Down", async () =>
    {
        const m = await expressionEditor("@if true @then 1 @else 2 @endif");
        await focus(m.root);
        const content = m.editor._test_getContent();
        // As in Java, a click 8 pixels below the caret, at the caret position nearest in the display
        // text: from after "@then" (content 12), on the next line
        content.positionCaret(12, true);
        await settle();
        await keys("{Escape}{ArrowDown}");
        expect(lineOfCaret(m.editor)).toBe(3);
        await keys("{Escape}{ArrowUp}");
        expect(lineOfCaret(m.editor)).toBe(2);
        expect(content.getValidCaretPositions()).toContain(content.getCaretPosition());
        // With Shift, the selection extends:
        const anchor = content.getCaretPosition();
        await keys("{Escape}{Shift>}{ArrowDown}{/Shift}");
        expect(content.getAnchorPosition()).toBe(anchor);
        expect(lineOfCaret(m.editor)).toBe(3);
    });

    test("clicking inside a keyword snaps the caret", async () =>
    {
        const m = await expressionEditor("@if true @then 1 @else 2 @endif");
        await focus(m.root);
        await clickAtDisplay(m, 2);
        expect([0, 3]).toContain(m.editor._test_getContent().getCaretPosition());
        expect(cm(m.editor).head).toBe(m.editor._test_getContent().getDisplayCaretPosition());
    });

    test("double click selects a word, triple click everything", async () =>
    {
        const m = await expressionEditor("abs(price)");
        await focus(m.root);
        await clickAtDisplay(m, 6, 2);
        const c = m.editor._test_getContent();
        const selected = (): string => c.getText().slice(Math.min(c.getAnchorPosition(), c.getCaretPosition()), Math.max(c.getAnchorPosition(), c.getCaretPosition()));
        expect(selected()).toBe("price");
        await clickAtDisplay(m, 6, 3);
        expect(selected()).toBe("abs(price)");
    });

    test("dragging selects", async () =>
    {
        const m = await expressionEditor("abs(price)");
        await focus(m.root);
        const view = m.editor._test_getView()!;
        const from = view.coordsAtPos(4)!;
        const to = view.coordsAtPos(9)!;
        const y = (from.top + from.bottom) / 2;
        await cdp().send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.left + 1, y, button: "left", clickCount: 1 });
        await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: to.left + 1, y, button: "left" });
        await cdp().send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.left + 1, y, button: "left", clickCount: 1 });
        await settle();
        const c = m.editor._test_getContent();
        expect([c.getAnchorPosition(), c.getCaretPosition()]).toEqual([4, 9]);
    });

    test("errors show once the caret leaves, and the popup offers fixes", async () =>
    {
        const m = await typeEditor();
        await focus(m.root);
        await keys("Numbre");
        // While typing, no underline or popup:
        expect(m.root.querySelector(".error-underline")).toBeNull();
        expect(infoPopup()).toBeNull();
        // Leaving the field shows all errors:
        await userEvent.click(document.body, { position: { x: 1, y: 1 } });
        await settle();
        expect(m.root.querySelector(".error-underline")?.textContent).toBe("Numbre");
        // Back in, with the caret on the error: the popup shows it, above the editor, with the fix
        await focus(m.root);
        await keys("{End}");
        await expect.poll(() => infoPopup()?.classList.contains("error")).toBe(true);
        expect(infoPopup()!.textContent).toContain("Numbre");
        expect(infoPopup()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(m.root.getBoundingClientRect().top);
        expect(infoPopup()!.querySelector(".quick-fix-row.key-F1")!.textContent).toContain("Number");
        // The underline containing the caret has no outline:
        expect(m.root.querySelector(".error-underline")!.classList.contains("contains-caret")).toBe(true);
        await keys("{Shift>}{F1}{/Shift}");
        expect(m.editor._test_getRawText()).toBe("Number");
        expect(m.root.querySelector(".error-underline")).toBeNull();
        expect(m.editor.hasErrors()).toBe(false);
    });

    test("clicking a fix", async () =>
    {
        const m = await typeEditor("Booleen");
        // With original content, its errors show at once:
        expect(m.root.querySelector(".error-underline")?.textContent).toBe("Booleen");
        await focus(m.root);
        await keys("{End}");
        await expect.poll(() => infoPopup()?.querySelector(".quick-fix-row.key-F1")).not.toBeNull();
        await userEvent.click(infoPopup()!.querySelector(".quick-fix-row.key-F1")!);
        await settle();
        expect(m.editor._test_getRawText()).toBe("Boolean");
        expect(m.root.contains(document.activeElement)).toBe(true);
    });

    test("completions: keys, position, and their documentation", async () =>
    {
        const m = await typeEditor();
        await focus(m.root);
        await keys("Num");
        expect(completionList()).not.toBeNull();
        expect([...completionList()!.querySelectorAll(".lex-completion")].map(e => e.textContent)).toContainEqual(expect.stringContaining("Number"));
        // Below the start of the word, with the completions' text in line with it:
        const start = m.editor._test_getView()!.coordsAtPos(0)!;
        const box = completionList()!.getBoundingClientRect();
        expect(Math.abs(box.top - start.bottom)).toBeLessThan(2);
        expect(Math.abs(box.left + 4 - start.left)).toBeLessThan(2);
        for (let i = 0; i < 30 && selectedCompletion(m) !== "Number"; i++)
            await keys("{ArrowDown}");
        await keys("{Enter}");
        expect(m.editor._test_getRawText()).toBe("Number");

        const ex = await expressionEditor();
        await focus(ex.root);
        await keys("abs");
        for (let i = 0; i < 30 && !(selectedCompletion(ex) ?? "").startsWith("abs"); i++)
            await keys("{ArrowDown}");
        expect(selectedCompletion(ex)).toBe("abs()");
        // The function's documentation shows beside the list:
        await expect.poll(() => document.querySelector(".lex-webview-wrapper")?.textContent?.replace(/\s+/g, " ") ?? "").toMatch(/abs\(original\).*positive/);
        await keys("{Enter}");
        expect(ex.editor._test_getRawText()).toBe("abs()");
        // Escape hides the completions:
        await keys("{Backspace}{Backspace}");
        expect(completionList()).not.toBeNull();
        await keys("{Escape}");
        expect(completionList()).toBeNull();
    });

    test("clicking a completion", async () =>
    {
        const m = await typeEditor();
        await focus(m.root);
        await keys("Bool");
        const item = [...document.querySelectorAll(".lex-completion:not(.lex-completion-header)")].find(e => e.textContent?.startsWith("Boolean"))!;
        // One click selects it; a second chooses it
        await userEvent.click(item);
        await settle();
        expect(selectedCompletion(m)).toBe("Boolean");
        expect(m.editor._test_getRawText()).toBe("Bool");
        await userEvent.click(item);
        await settle();
        expect(m.editor._test_getRawText()).toBe("Boolean");
        // The editor kept the focus:
        expect(m.root.contains(document.activeElement)).toBe(true);
    });

    test("copy, cut and paste use the content", async () =>
    {
        const m = await expressionEditor();
        await focus(m.root);
        await keys("1+2");
        await keys(shortcut("a"));
        expect(await copyToClipboard(() => userEvent.keyboard(shortcut("c")))).toBe("1+2");
        expect(await copyToClipboard(() => userEvent.keyboard(shortcut("x")))).toBe("1+2");
        await settle();
        expect(m.editor._test_getRawText()).toBe("");
        await navigator.clipboard.writeText("3*(4");
        await keys(shortcut("v"));
        expect(m.editor._test_getRawText()).toBe("3*(4");
        expect(cm(m.editor).doc).toBe(m.editor._test_getContent().getDisplay().toPlain());
    });

    test("undo and redo", async () =>
    {
        const m = await expressionEditor();
        await focus(m.root);
        await keys("12");
        await sleep(1100);
        await keys("+3");
        expect(m.editor._test_getRawText()).toBe("12+3");
        await keys(shortcut("z"));
        const undone = m.editor._test_getRawText();
        expect(undone).not.toBe("12+3");
        expect(cm(m.editor).doc).toBe(m.editor._test_getContent().getDisplay().toPlain());
        await keys(shortcut("y"));
        expect(m.editor._test_getRawText()).toBe("12+3");
    });

    test("an input method's composition", async () =>
    {
        const m = await expressionEditor();
        await focus(m.root);
        await keys("1+");
        // As a Japanese input method does: composing text, then committing it
        await cdp().send("Input.imeSetComposition", { text: "ね", selectionStart: 1, selectionEnd: 1 });
        await settle();
        await cdp().send("Input.imeSetComposition", { text: "ねこ", selectionStart: 2, selectionEnd: 2 });
        await settle();
        await cdp().send("Input.insertText", { text: "猫" });
        await sleep(50);
        await settle();
        expect(m.editor._test_getRawText()).toBe("1+猫");
        expect(cm(m.editor)).toEqual({ doc: "1 + 猫", head: 5, anchor: 5 });
    });

    test("keys stay in the editor, except Enter without completions", async () =>
    {
        const m = await typeEditor();
        await focus(m.root);
        await keys("Text");
        // Completions showing: Enter chooses one, and stays in the editor
        expect(completionList()).not.toBeNull();
        await keys("{Escape}{Tab}{ArrowLeft}x");
        expect(m.keysOutside).toEqual([]);
        // Tab didn't move the focus (Java's parentFocusRightOfThis does nothing for these editors):
        expect(m.root.contains(document.activeElement)).toBe(true);
        await keys("{Escape}{Enter}");
        expect(m.keysOutside).toEqual(["Enter"]);
        // Enter never adds a line:
        expect(m.editor._test_getRawText()).toBe("Texxt");
    });

    test("save, and showing errors", async () =>
    {
        const m = await typeEditor();
        await focus(m.root);
        await keys("Numbre");
        expect(m.root.querySelector(".error-underline")).toBeNull();
        expect(m.editor.save(true).toStyledString().toPlain()).toBe("Numbre");
        await settle();
        // A forced save shows the errors, as clicking OK did:
        expect(m.root.querySelector(".error-underline")).not.toBeNull();
    });
});
