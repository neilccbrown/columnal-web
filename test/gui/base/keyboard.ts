// Typing, as TestFX's write and push did.
import { userEvent } from "vitest/browser";

/**
 * Types text into the focused element (userEvent's keyboard reads "{" and "[" as the start of a key
 * name).  Its keyboard turns characters outside the BMP into U+FFFD, so those are inserted as typing
 * would (an input event) through execCommand.
 */
export async function write(text: string): Promise<void>
{
    for (const run of text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]+/g) ?? [])
    {
        if (run.length === 2 && /^[\uD800-\uDBFF]/.test(run))
            document.execCommand("insertText", false, run);
        else
            await userEvent.keyboard(run.replace(/[{[]/g, c => c + c));
    }
}

/** Presses a key, by its KeyboardEvent.key name (e.g. "Delete", "Tab"). */
export async function push(key: string): Promise<void>
{
    await userEvent.keyboard(`{${key}}`);
}
