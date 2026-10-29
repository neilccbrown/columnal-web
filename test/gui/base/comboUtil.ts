// Port of the Java GUI tests' ComboUtilTrait (tests-gui-base): selects a combo box item with the keyboard.
// PORT-NOTE: a ComboBox is an element with the combobox role; clicking it shows its listbox (the
// element its aria-controls names), whose options' text are the items, and aria-selected the selection.
import { expect } from "vitest";
import { type Locator, userEvent } from "vitest/browser";

export async function selectGivenComboBoxItem(combo: Locator, item: string): Promise<void>
{
    // (Found first: while the list shows, the rest of the page is hidden from the accessibility tree,
    // which locators use)
    const comboElement = combo.element();
    await userEvent.click(combo);
    await expect.poll(() => comboElement.getAttribute("aria-expanded")).toBe("true");
    const listId = comboElement.getAttribute("aria-controls");
    const list = listId !== null ? document.getElementById(listId) : null;
    expect(list, "The combo box's list").not.toBeNull();
    const options = [...list!.querySelectorAll("[role=option]")];
    const items = options.map(o => o.textContent?.trim() ?? "");
    const index = items.indexOf(item);
    const indexSel = options.findIndex(o => o.getAttribute("aria-selected") === "true");
    if (index === -1)
        expect.fail(`The item ${item} is not in the combo box; its items are [${items.join(", ")}]`);
    if (indexSel !== -1)
    {
        for (let i = indexSel; i < index; i++)
            await userEvent.keyboard("{ArrowDown}");
        for (let i = indexSel; i > index; i--)
            await userEvent.keyboard("{ArrowUp}");
    }
    else
    {
        // (A JavaFX ComboBox with nothing selected starts on the first item)
        for (let i = 0; i < index; i++)
            await userEvent.keyboard("{ArrowDown}");
    }
    await userEvent.keyboard("{Enter}");
}
