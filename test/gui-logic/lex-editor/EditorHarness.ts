// A harness for the tests derived from the GUI tests of the editors, which type into an editor and
// check its completions, errors and fixes: here the keys go to the editor's content and display
// (see makeEditor).  Includes BaseTestEditorCompletion, AutoCompleteTrait (the completions are those
// the display's auto-complete shows) and the steps of BaseTestQuickFix.testFix.
import { expect } from "vitest";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../src/engine/utility-error/styled/StyledShowable.js";
import type { LexCompletion } from "../../../src/gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import type { CodeCompletionContext } from "../../../src/gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import { EditorContent } from "../../../src/gui-logic/lex-editor/gui/lexeditor/EditorContent.js";
import { EditorDisplay } from "../../../src/gui-logic/lex-editor/gui/lexeditor/EditorDisplay.js";
import type { Lexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/Lexer.js";

export const NO_MODIFIERS: EditorDisplay.KeyModifiers = { shift: false, shortcut: false, wordSkip: false };

/**
 * An editor's content and display, with the display's completions updated as the caret moves (as
 * TopLevelEditor does).  If focused, the completions are shown at the start, as when the GUI tests
 * focus the editor.
 */
export function makeEditor<E extends StyledShowable, C extends CodeCompletionContext>(initialContent: string, lexer: Lexer<E, C>, focused: boolean = false): Editing<E, C>
{
    const content = new EditorContent<E, C>(initialContent, lexer);
    const display = new EditorDisplay(content as unknown as EditorContent<StyledShowable, CodeCompletionContext>);
    content.addCaretPositionListener((caretPos, caretMoveReason) =>
    {
        if (caretMoveReason !== EditorContent.CaretMoveReason.FORCED_SAVE)
        {
            display.showCompletions(content.getLexerResult().getCompletionsFor(caretPos));
        }
    });
    if (focused)
        display.showCompletions(content.getLexerResult().getCompletionsFor(content.getCaretPosition()));
    return new Editing(content, display);
}

export class Editing<E extends StyledShowable, C extends CodeCompletionContext>
{
    public constructor(
        public readonly content: EditorContent<E, C>,
        public readonly display: EditorDisplay)
    {
    }

    public write(text: string): void
    {
        for (const c of text)
            this.display.keyTyped(c);
    }

    public push(key: string): void
    {
        this.display.keyPressed(key, NO_MODIFIERS);
    }

    // Java: listWindows() filtered to a showing LexAutoCompleteWindow, and its _test_getShowing()
    public showing(): readonly LexCompletion[]
    {
        return this.display._test_getAutoComplete()._test_getWindow()?._test_getShowing() ?? [];
    }

    public selectedContent(): string | null
    {
        return this.display._test_getAutoComplete()._test_getWindow()?._test_getSelectedContent() ?? null;
    }

    // Java: TFXUtil.doubleOk (which closes the editor, losing its focus), and the value saved
    public finish(): E
    {
        this.content.forceSaveAsIfUnfocused();
        return this.content.getLexerResult().result;
    }

    // Checks the completions are showing (the GUI test also checks where)
    public checkPosition(): void
    {
        expect(this.display._test_getAutoComplete()._test_getWindow(), "Completions showing").not.toBeNull();
    }

    // AutoCompleteTrait.scrollLexAutoCompleteToOption
    public scrollLexAutoCompleteToOption(content: string): void
    {
        expect(this.display._test_getAutoComplete()._test_getWindow(), "Completions showing").not.toBeNull();

        // Move to top:
        let prev: string | null = "\u0000";
        while (prev !== this.selectedContent())
        {
            prev = this.selectedContent();
            this.push("PAGE_UP");
        }

        const all: string[] = [];

        // Now scroll down until we find it, or reach end:
        prev = "\u0000";
        while (prev !== this.selectedContent() && content !== this.selectedContent())
        {
            prev = this.selectedContent();
            if (prev !== null)
                all.push(prev);
            this.push("DOWN");
        }

        expect(this.selectedContent(), "Options: " + all.join(";")).toBe(content);
    }

    // BaseTestEditorCompletion.checkCompletions
    public checkCompletions(...checks: CompletionCheck[]): void
    {
        // We go from end in case there is a trailing space,
        // which will be removed once we go backwards:
        this.push("END");
        let prevPos = -1;
        let curPos: number;
        while (prevPos !== (curPos = this.content.getCaretPosition()))
        {
            // Check completions here
            const showing = this.showing();
            for (const check of checks)
            {
                const matching = showing.filter(l => l.content === check.content);

                let wasChecked = false;
                for (const startInclToEndIncl of check.startInclToEndIncl)
                {
                    if (startInclToEndIncl.getFirst() <= curPos && curPos <= startInclToEndIncl.getSecond())
                    {
                        wasChecked = true;
                        if (matching.length === 0)
                        {
                            expect.fail("Did not find completion {{{" + check.content + "}}} at caret position " + curPos + " set was: " + showing.map(s => s.content).join("|"));
                        }
                        else if (matching.length > 1)
                        {
                            expect.fail("Found duplicate completions {{{" + check.content + "}}} at caret position " + curPos);
                        }
                    }
                }
                if (!wasChecked)
                {
                    if (matching.length > 0)
                    {
                        expect.fail("Found completion {{{" + check.content + "}}} which should not be present at " + curPos);
                    }
                }
            }
            prevPos = curPos;
            this.push("LEFT");
        }
    }
}

export class CompletionCheck
{
    public constructor(public readonly content: string, public readonly startInclToEndIncl: readonly Pair<number, number>[])
    {
    }
}

export function c(content: string, ...startEndInclPairs: number[]): CompletionCheck
{
    const pairs: Pair<number, number>[] = [];
    for (let i = 0; i < startEndInclPairs.length; i += 2)
        pairs.push(new Pair(startEndInclPairs[i]!, startEndInclPairs[i + 1]!));
    return new CompletionCheck(content, pairs);
}

/**
 * Types the text into the editor a character at a time.  Unless it starts with \u0000 (which is not
 * typed), each closing bracket which the editor inserts after an opening one is deleted (as
 * EnterTypeTrait.enterAndDeleteSmartBrackets does).
 */
export function typeInto(display: EditorDisplay, text: string): void
{
    for (const c of text)
    {
        if (c !== "\u0000")
            display.keyTyped(c);
        // Delete auto-matched brackets:
        if (!text.startsWith("\u0000") && "({[\"".includes(c))
            display.keyPressed("DELETE", NO_MODIFIERS);
    }
}

/**
 * The steps of BaseTestQuickFix.testFix (and TestTypeQuickFix.testFix) up to applying the fix:
 * types the original into the editor (deleting auto-inserted closing brackets), clicks OK (so errors
 * show), moves the caret onto fixFieldContent (empty for the end), checks an error shows there,
 * picks the one quick fix with the given CSS class (or the only one, if fixCssClass is empty), and
 * applies it.  Returns false if the fix is an action (such as a dialog), which needs the GUI.
 *
 * PORT-NOTE: the GUI test also checks the popups; here the error shown is the errors touching the
 * caret (as TopLevelEditor's caretMoved gathers them, once OK has been clicked), and its fixes are
 * the rows of the fix list.
 */
export function typeAndApplyFix<E extends StyledShowable, C extends CodeCompletionContext>(ed: Editing<E, C>, original: string, fixFieldContent: string, fixCssClass: string): boolean
{
    const { content, display } = ed;
    typeInto(display, original);
    // Click OK so that errors show up:
    content.forceSaveAsIfUnfocused();

    // Now need to move to right position:
    let moveDist = content._test_getCaretMoveDistance(fixFieldContent);
    while (moveDist > 0)
    {
        display.keyPressed("RIGHT", NO_MODIFIERS);
        moveDist -= 1;
    }
    while (moveDist < 0)
    {
        display.keyPressed("LEFT", NO_MODIFIERS);
        moveDist += 1;
    }
    expect(content._test_getCaretMoveDistance(fixFieldContent)).toBe(0);

    const caretPos = content.getCaretPosition();
    const errorsHere = content.getErrors().filter(err => err.location.touches(caretPos));
    const describe = (): string => content.getText() + " caret " + caretPos + " errors: " + content.getErrors().map(err => err.location.toString() + " " + err.error.toPlain() + " fixes: " + err.quickFixes.map(f => "{" + f.getCssClasses().join(", ") + "}").join(" and ")).join("; ");
    expect(errorsHere.map(err => err.error.toPlain()).join("\n"), "Error showing: " + describe()).not.toBe("");
    const fixes = errorsHere.flatMap(err => err.quickFixes).filter(f => fixCssClass === "" || f.getCssClasses().includes(fixCssClass));
    expect(fixes.length, "Looking for fix " + fixCssClass + ": " + describe()).toBe(1);
    return fixes[0]!.getReplacement().either(_action => false, replacement =>
    {
        content.replaceText(replacement.getFirst().start, replacement.getFirst().end, replacement.getSecond());
        return true;
    });
}
