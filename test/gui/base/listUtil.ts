// Port of the Java GUI tests' ListUtilTrait (tests-gui-base): selects a list item with the keyboard.
// PORT-NOTE: a ListView is an element with the listbox role, whose options (role option) show their
// selection with aria-selected, and where the arrow keys move the selection (as in a JavaFX ListView).
import { expect } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { sleep } from "./util.js";

export async function selectGivenListViewItem(list: Locator, findItem: (option: Element) => boolean): Promise<void>
{
    const options = (): Element[] => [...list.element().querySelectorAll("[role=option]")];
    const index = options().findIndex(findItem);
    expect(index, "Not found item satisfying predicate").toBeGreaterThanOrEqual(0);
    await userEvent.click(list);
    await userEvent.keyboard("{ }");
    await sleep(100);
    // If nothing selected, selection will begin when you hit a key:
    const cur = (): number => options().findIndex(o => o.getAttribute("aria-selected") === "true");
    for (let i = 0; cur() < index && i < options().length; i++)
        await userEvent.keyboard("{ArrowDown}");
    for (let i = 0; cur() > index && i < options().length; i++)
        await userEvent.keyboard("{ArrowUp}");
    expect(cur()).toBe(index);
}
