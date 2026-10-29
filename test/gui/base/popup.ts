// Port of the Java GUI tests' PopupTrait (tests-gui-base): popups that may be in the way are
// dismissed with a middle click, which the app's popups (e.g. ErrorableTextField's) hide on.
// PORT-NOTE: popups are elements here (Reka's popper content, tooltips, menus, listboxes), not windows.
import { page, userEvent } from "vitest/browser";
import { sleep } from "./util.js";

const POPUPS = "[data-reka-popper-content-wrapper], [role=tooltip], [role=menu], [role=listbox]";

function popupAt(p: { x: number, y: number }): boolean
{
    return [...document.querySelectorAll(POPUPS)].some(popup =>
    {
        const r = popup.getBoundingClientRect();
        return r.left - 1 <= p.x && p.x <= r.right + 1 && r.top - 1 <= p.y && p.y <= r.bottom + 1;
    });
}

async function middleClickAt(p: { x: number, y: number }): Promise<void>
{
    const element = document.elementFromPoint(p.x, p.y);
    if (element === null)
        return;
    const box = element.getBoundingClientRect();
    await userEvent.click(page.elementLocator(element), { button: "middle", position: { x: p.x - box.left, y: p.y - box.top }, force: true });
}

/** Moves to the point (client coordinates), and middle-clicks until no popup is there (at most 10 times). */
export async function moveAndDismissPopupsAtPos(p: { x: number, y: number }): Promise<void>
{
    // (Java always middle-clicked once, as popup windows' positions weren't reliable)
    await middleClickAt(p);
    for (let attempts = 1; popupAt(p) && attempts < 10; attempts++)
    {
        await middleClickAt(p);
        await sleep(50);
    }
}
