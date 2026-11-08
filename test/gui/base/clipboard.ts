// Port of the Java GUI tests' ClipboardTrait (tests-gui-base): copies, and returns what was copied.
import { expect } from "vitest";
import { userEvent } from "vitest/browser";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import { sleep } from "./util.js";

/**
 * Runs the copy action (by default F11, which the grid also copies on), and waits for the clipboard to
 * change; the result is guaranteed to be a new clipboard entry.
 */
export async function copyToClipboard(doCopyAction: () => Promise<void> = () => userEvent.keyboard("{F11}")): Promise<string>
{
    const BLANK_CLIPBOARD = "@TEST";
    // Clear clipboard to give a blank slate to compare against:
    await navigator.clipboard.writeText(BLANK_CLIPBOARD);
    await doCopyAction();
    let r = await navigator.clipboard.readText();
    for (let count = 80; r === BLANK_CLIPBOARD && count >= 0; count--)
    {
        await sleep(100);
        r = await navigator.clipboard.readText();
    }
    expect(r).not.toBe(BLANK_CLIPBOARD);
    return r;
}

/** Java: the clipboard's application/records content (written by the page as a "web " format). */
export async function recordsOnClipboard(): Promise<string | null>
{
    for (const item of await navigator.clipboard.read())
    {
        if (item.types.includes("web " + ClipboardUtils.DATA_FORMAT))
            return (await item.getType("web " + ClipboardUtils.DATA_FORMAT)).text();
    }
    return null;
}
