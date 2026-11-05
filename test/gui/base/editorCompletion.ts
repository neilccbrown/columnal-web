// Port of test.gui.expressionEditor.BaseTestEditorCompletion (tests-gui-base): checks which completions
// the editor's completion list shows at each caret position.
import { expect } from "vitest";
import type { LexCompletion } from "../../../src/gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import { settle, waitForOneEditor } from "./editorDisplay.js";
import { push } from "./keyboard.js";

export class CompletionCheck
{
    public constructor(
        public readonly content: string,
        // Inclusive at both ends
        public readonly startInclToEndIncl: readonly (readonly [number, number])[])
    {
    }
}

/** A completion, and the caret positions it should show at (start and end pairs, both inclusive). */
export function c(content: string, ...startEndInclPairs: number[]): CompletionCheck
{
    const pairs: (readonly [number, number])[] = [];
    for (let i = 0; i < startEndInclPairs.length; i += 2)
        pairs.push([startEndInclPairs[i]!, startEndInclPairs[i + 1]!]);
    return new CompletionCheck(content, pairs);
}

/**
 * From the end of the content back to its start, checks at each caret position that each completion is
 * showing exactly once where it should be, and not elsewhere.
 */
export async function checkCompletions(...checks: CompletionCheck[]): Promise<void>
{
    const editorDisplay = await waitForOneEditor();
    // We go from end in case there is a trailing space,
    // which will be removed once we go backwards:
    await push("End");
    let prevPos = -1;
    let curPos: number;
    while (prevPos !== (curPos = editorDisplay._test_getContent().getCaretPosition()))
    {
        // (Java slept half a second for the window to update)
        await settle();
        // Check completions here
        const window = editorDisplay._test_getDisplay()._test_getAutoComplete()._test_getWindow();
        // (The list shows on the page when the window is showing, and not otherwise)
        expect(document.querySelector(".lex-completion-list") !== null, "List on the page at " + curPos).toBe(window !== null);
        const showing: readonly LexCompletion[] = window === null ? [] : window._test_getShowing();
        for (const check of checks)
        {
            const matching = showing.filter(l => l.content === check.content);

            let wasChecked = false;
            for (const [start, end] of check.startInclToEndIncl)
            {
                if (start <= curPos && curPos <= end)
                {
                    wasChecked = true;
                    if (matching.length === 0)
                        expect.fail("Did not find completion {{{" + check.content + "}}} at caret position " + curPos + " set was: " + showing.map(s => s.content).join("|"));
                    else if (matching.length > 1)
                        expect.fail("Found duplicate completions {{{" + check.content + "}}} at caret position " + curPos);
                }
            }
            if (!wasChecked && matching.length > 0)
                expect.fail("Found completion {{{" + check.content + "}}} which should not be present at " + curPos);
        }
        prevPos = curPos;
        await push("ArrowLeft");
    }
}
