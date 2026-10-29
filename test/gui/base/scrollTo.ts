// Port of the Java GUI tests' ScrollToTrait (tests-gui-base): scrollTo, which scrolls (with the mouse
// wheel) until an element is entirely in view in its scrolling ancestor.
// PORT-DEFERRED: keyboardMoveTo, which drives the grid, to Phase 8.
import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import { describeElement } from "./util.js";

function enclosingScroll(target: Element): HTMLElement | null
{
    for (let n = target.parentElement; n !== null; n = n.parentElement)
    {
        const style = getComputedStyle(n);
        if (/auto|scroll/.test(style.overflowX + style.overflowY))
            return n;
    }
    return null;
}

/** Scrolls until the entire element is in view (in its scrolling ancestor's visible area). */
export async function scrollTo(target: Element): Promise<void>
{
    const scroll = enclosingScroll(target);
    if (scroll === null)
        expect.fail("Could not find enclosing scroll pane for " + describeElement(target));
    const box = scroll.getBoundingClientRect();
    const view = { left: box.left + scroll.clientLeft, top: box.top + scroll.clientTop, right: 0, bottom: 0 };
    view.right = view.left + scroll.clientWidth;
    view.bottom = view.top + scroll.clientHeight;
    const targetBeforeScroll = target.getBoundingClientRect();
    const t = (): DOMRect => target.getBoundingClientRect();
    const wheel = (x: number, y: number): Promise<void> => userEvent.wheel(page.elementLocator(scroll), { delta: { x, y } });
    // We limit how many times we will scroll, to avoid an infinite loop in case of test failure:
    for (let i = 0; i < 100 && t().right > view.right; i++)
        await wheel(40, 0);
    for (let i = 0; i < 100 && t().left < view.left; i++)
        await wheel(-40, 0);
    for (let i = 0; i < 100 && t().bottom > view.bottom; i++)
        await wheel(0, 40);
    for (let i = 0; i < 100 && t().top < view.top; i++)
        await wheel(0, -40);
    const r = t();
    expect(view.left <= r.left && r.right <= view.right && view.top <= r.top && r.bottom <= view.bottom,
        `View bounds: ${JSON.stringify(view)} target: ${JSON.stringify(r)} target before scroll: ${JSON.stringify(targetBeforeScroll)}`).toBe(true);
}
