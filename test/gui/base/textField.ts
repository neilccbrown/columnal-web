// Port of the Java GUI tests' TextFieldTrait (tests-gui-base).
import { expect } from "vitest";
import { userEvent } from "vitest/browser";
import { isMac } from "../../../src/gui/shortcuts.js";
import { getFocusOwner } from "./focusOwner.js";
import { describeElement } from "./util.js";

/** Selects all the text in the focused text field (which must be editable), and returns it. */
export async function selectAllCurrentTextField(): Promise<HTMLInputElement | HTMLTextAreaElement>
{
    const focusOwner = getFocusOwner();
    if (!(focusOwner instanceof HTMLInputElement || focusOwner instanceof HTMLTextAreaElement))
        throw new Error("Focus owner is " + describeElement(focusOwner));
    expect(focusOwner.readOnly).toBe(false);
    expect(focusOwner.disabled).toBe(false);
    // (Java called selectAll() on macOS, where Cmd-A didn't work in TestFX)
    await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
    return focusOwner;
}
