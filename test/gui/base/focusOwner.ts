// Port of the Java GUI tests' FocusOwnerTrait (tests-gui-base): what has the keyboard focus.
// PORT-NOTE: Java asks the target window's scene; here it is the document's active element, and a
// "dialog" is an element with the dialog role (the light dialogs are in the page, not windows).
import { expect } from "vitest";
import { describeElement } from "./util.js";

/** The focused element, or null if nothing (the body) has the focus. */
export function getFocusOwner(): Element | null
{
    const owner = document.activeElement;
    return owner === null || owner === document.body ? null : owner;
}

export function getFocusOwnerAs<C extends Element>(expectedClass: abstract new (...args: never[]) => C): C
{
    const node = getFocusOwner();
    if (!(node instanceof expectedClass))
        throw new Error("Focus owner is " + describeElement(node) + " but expected " + expectedClass.name);
    return node;
}

export function checkDialogFocused(msg: string): void
{
    const owner = getFocusOwner();
    expect(owner?.closest("[role=dialog], [role=alertdialog]") ?? null, msg + " " + describeElement(owner)).not.toBeNull();
}
