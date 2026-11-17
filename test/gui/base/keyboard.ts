// Typing, as TestFX's write and push did.
import { userEvent } from "vitest/browser";

const focusEditable = (): boolean =>
{
    const focused = document.activeElement;
    return focused instanceof HTMLElement && (focused.isContentEditable || focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement);
};

/**
 * Types text into the focused element (userEvent's keyboard reads "{" and "[" as the start of a key
 * name).  Its keyboard turns characters outside the BMP into U+FFFD, so those are inserted as typing
 * would (an input event) through execCommand.  A character not on a US keyboard is typed by it as an
 * input event alone, as is one inserted, which does nothing where the focus isn't editable (the grid,
 * where typing a character starts an edit), losing the character: there it is sent as the key pressed.
 */
export async function write(text: string): Promise<void>
{
    for (const run of text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]+/g) ?? [])
    {
        let rest = run;
        const first = String.fromCodePoint(run.codePointAt(0)!);
        if (first.codePointAt(0)! > 0x7E && !focusEditable())
        {
            document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: first, bubbles: true, cancelable: true }));
            // (As userEvent's keyboard waits for the page after a key)
            await new Promise(resolve => setTimeout(resolve, 50));
            rest = run.slice(first.length);
        }
        if (rest === "")
            continue;
        if (/^[\uD800-\uDBFF]/.test(rest))
            document.execCommand("insertText", false, rest);
        else
            await userEvent.keyboard(rest.replace(/[{[]/g, c => c + c));
    }
}

/** Presses a key, by its KeyboardEvent.key name (e.g. "Delete", "Tab"). */
export async function push(key: string): Promise<void>
{
    await userEvent.keyboard(`{${key}}`);
}
