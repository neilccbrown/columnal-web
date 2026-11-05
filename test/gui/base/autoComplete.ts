// Port of test.gui.trait.AutoCompleteTrait (tests-gui-base): choosing a completion in a lex editor's
// completion list, or in a text field's autocomplete list.
import { expect, vi } from "vitest";
import { focusedEditor, settle } from "./editorDisplay.js";
import { push, write } from "./keyboard.js";

// The focused editor's completion list, if showing (Java: the showing LexAutoCompleteWindows, of which
// there must be one)
function lexAutoCompleteWindow(): { _test_getSelectedContent(): string | null }
{
    expect(document.querySelectorAll(".lex-completion-list").length, "Completion lists showing").toBe(1);
    const window = focusedEditor()._test_getDisplay()._test_getAutoComplete()._test_getWindow();
    expect(window, "The editor's completion list").not.toBeNull();
    return window!;
}

/** Completes in the lex editor's completion list: types the first character, then picks the completion. */
export async function lexComplete(completion: string): Promise<void>
{
    await write(completion.substring(0, 1));
    await settle();
    await scrollLexAutoCompleteToOption(completion);
    await push("Enter");
}

/** Selects the completion with the given content in the lex editor's completion list, by keyboard. */
export async function scrollLexAutoCompleteToOption(content: string): Promise<void>
{
    const autoComplete = lexAutoCompleteWindow();

    // Move to top:
    let prev: string | null = "\u0000";
    while (prev !== autoComplete._test_getSelectedContent())
    {
        prev = autoComplete._test_getSelectedContent();
        await push("PageUp");
    }

    const all: string[] = [];

    // Now scroll down until we find it, or reach end:
    prev = "\u0000";
    while (prev !== autoComplete._test_getSelectedContent() && content !== autoComplete._test_getSelectedContent())
    {
        prev = autoComplete._test_getSelectedContent();
        if (prev !== null)
            all.push(prev);
        await push("ArrowDown");
    }

    expect(autoComplete._test_getSelectedContent(), "Options: " + all.join(";")).toBe(content);
}

/**
 * Picks the completion in a text field's autocomplete list (going down from the selection), with Tab or
 * Enter.  PORT-NOTE: Java compared each completion's content; here its text in the list.
 */
export async function autoComplete(completion: string, useTab: boolean): Promise<void>
{
    const listView = await vi.waitUntil(() => document.querySelector(".autocomplete"));
    const items = (): HTMLElement[] => [...listView.querySelectorAll<HTMLElement>(".completion-cell")];
    const selectedContent = (): string | null => listView.querySelector(".completion-cell.selected .completion-cell-text")?.textContent ?? null;
    const itemCount = items().length;
    for (let i = items().findIndex(e => e.classList.contains("selected")); i < itemCount; i++)
    {
        await push("ArrowDown");
        if (selectedContent() === completion)
        {
            await push(useTab ? "Tab" : "Enter");
            return;
        }
    }
    expect.fail("Could not find item: " + completion);
}
