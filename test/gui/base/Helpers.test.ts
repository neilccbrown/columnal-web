// The test helpers (ports of the Java GUI tests' generic traits), each against a small component.
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { SelectContent, SelectItem, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from "reka-ui";
import { defineComponent, h, ref } from "vue";
import LightDialog from "../../../src/gui/components/dialogs/LightDialog.vue";
import ErrorableTextField from "../../../src/gui/components/ErrorableTextField.vue";
import { ErrorableTextField as Conversion } from "../../../src/gui-logic/utility-gui/utility/gui/ErrorableTextField.js";
import { copyToClipboard } from "./clipboard.js";
import { selectGivenComboBoxItem } from "./comboUtil.js";
import { checkDialogFocused, getFocusOwner, getFocusOwnerAs } from "./focusOwner.js";
import { selectGivenListViewItem } from "./listUtil.js";
import { moveAndDismissPopupsAtPos } from "./popup.js";
import { scrollTo } from "./scrollTo.js";
import { selectAllCurrentTextField } from "./textField.js";

describe("focusOwner", () =>
{
    it("finds the focused element, and whether it is in a dialog", async () =>
    {
        render(defineComponent(() => () => h("div", [
            h("button", "Outside"),
            h(LightDialog, { open: true, label: "Dialog" }, () => h("input", { "aria-label": "Inside" })),
        ])));
        await userEvent.click(page.getByRole("textbox", { name: "Inside" }));
        expect(getFocusOwnerAs(HTMLInputElement).getAttribute("aria-label")).toBe("Inside");
        expect(() => getFocusOwnerAs(HTMLButtonElement)).toThrow(/^Focus owner is input but expected HTMLButtonElement$/);
        checkDialogFocused("Should be in the dialog");
        (document.activeElement as HTMLElement).blur();
        expect(getFocusOwner()).toBeNull();
        expect(() => checkDialogFocused("Not in a dialog")).toThrow(/Not in a dialog null/);
    });
});

describe("textField", () =>
{
    it("selects all of the focused field's text", async () =>
    {
        render(defineComponent(() => () => h("input", { "aria-label": "Field", "value": "old text" })));
        await userEvent.click(page.getByRole("textbox"));
        const field = await selectAllCurrentTextField();
        expect([field.selectionStart, field.selectionEnd]).toEqual([0, 8]);
        await userEvent.keyboard("new");
        expect(field.value).toBe("new");
    });
});

describe("popup", () =>
{
    it("dismisses the popup at a point with a middle click", async () =>
    {
        render(defineComponent(() => () => h(ErrorableTextField<string>, {
            "converter": (s: string) => Conversion.checkAlphabet(s, c => c !== 0x31, x => x), "aria-label": "Field",
        })));
        await userEvent.click(page.getByRole("textbox"));
        await userEvent.keyboard("a1");
        const message = page.getByText("Character not allowed: 1");
        await expect.element(message).toBeVisible();
        const box = message.element().getBoundingClientRect();
        await moveAndDismissPopupsAtPos({ x: box.left + 2, y: box.top + 2 });
        await expect.element(message).not.toBeInTheDocument();
    });
});

// A list as a JavaFX ListView behaves: the arrow keys (and Space, if nothing is selected) select.
const ListView = defineComponent({
    props: { items: { type: Array<string>, required: true } },
    setup(props)
    {
        const selected = ref(-1);
        const move = (by: number) => { selected.value = Math.max(0, Math.min(props.items.length - 1, selected.value + by)); };
        return () => h("ul", {
            "role": "listbox", "tabindex": 0, "aria-label": "List",
            "onKeydown": (e: KeyboardEvent) =>
            {
                if (e.key === "ArrowDown") move(1);
                else if (e.key === "ArrowUp") move(-1);
                else if (e.key === " " && selected.value === -1) move(1);
            },
        }, props.items.map((item, i) => h("li", { "role": "option", "aria-selected": i === selected.value }, item)));
    },
});

describe("listUtil", () =>
{
    it("selects the item with the keyboard", async () =>
    {
        render(ListView, { props: { items: ["one", "two", "three", "four"] } });
        await selectGivenListViewItem(page.getByRole("listbox"), o => o.textContent === "three");
        await expect.element(page.getByRole("option", { name: "three" })).toHaveAttribute("aria-selected", "true");
    });
});

describe("comboUtil", () =>
{
    it("selects the item with the keyboard", async () =>
    {
        const value = ref("two");
        render(defineComponent(() => () => h(SelectRoot, {
            "modelValue": value.value, "onUpdate:modelValue": (v: unknown) => { value.value = v as string; },
        }, () => [
            h(SelectTrigger, { "aria-label": "Combo" }, () => h(SelectValue)),
            h(SelectPortal, () => h(SelectContent, { position: "popper" }, () => h(SelectViewport, () =>
                ["one", "two", "three", "four"].map(item => h(SelectItem, { value: item }, () => h(SelectItemText, () => item)))))),
        ])));
        await selectGivenComboBoxItem(page.getByRole("combobox"), "four");
        await expect.poll(() => value.value).toBe("four");
        await selectGivenComboBoxItem(page.getByRole("combobox"), "one");
        await expect.poll(() => value.value).toBe("one");
    });
});

describe("clipboard", () =>
{
    it("returns what is copied, by F11 or another action", async () =>
    {
        render(defineComponent(() => () => h("button", {
            onClick: () => void navigator.clipboard.writeText("from the button"),
            onKeydown: (e: KeyboardEvent) => { if (e.key === "F11") void navigator.clipboard.writeText("from F11"); },
        }, "Copy")));
        await userEvent.click(page.getByRole("button"));
        expect(await copyToClipboard()).toBe("from F11");
        expect(await copyToClipboard(() => userEvent.click(page.getByRole("button")))).toBe("from the button");
    });
});

describe("scrollTo", () =>
{
    it("scrolls until the element is entirely in view", async () =>
    {
        render(defineComponent(() => () => h("div", { style: "width: 200px; height: 150px; overflow: auto" },
            h("div", { style: "position: relative; width: 1000px; height: 2000px" },
                h("span", { "data-testid": "target", "style": "position: absolute; left: 700px; top: 1500px; width: 50px; height: 20px" }, "Here")))));
        const target = page.getByTestId("target").element();
        await scrollTo(target);
        const scroller = target.parentElement!.parentElement!;
        expect(scroller.scrollTop).toBeGreaterThan(1000);
        expect(scroller.scrollLeft).toBeGreaterThan(400);
    });
});
