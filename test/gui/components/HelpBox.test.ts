// HelpBox (docs/gui-spec/help-box.md): hover for the short help, click for the full help, F1 to cycle.
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import HelpBox from "../../../src/gui/components/HelpBox.vue";

const SHORT = "Join transformations join two tables together.";
const FULL_START = /^The distinction between primary and secondary table/;

// A field with its help box, as GUI.helpBox makes them:
const Field = defineComponent({
    setup()
    {
        const help = ref<InstanceType<typeof HelpBox> | null>(null);
        const focused = ref(false);
        return () => h("div", [
            h("input", {
                "data-testid": "field",
                "onFocus": () => { focused.value = true; },
                "onBlur": () => { focused.value = false; },
                "onKeydown": (e: KeyboardEvent) =>
                {
                    if (e.key === "F1")
                    {
                        e.preventDefault();
                        help.value?.cycleStates();
                    }
                },
            }),
            h(HelpBox, { ref: help, helpId: "edit-join/tables", relatedFocused: focused.value }),
        ]);
    },
});

const helpBox = () => page.getByTestId("help-box");
const popup = () => page.getByText(SHORT);
const full = () => page.getByText(FULL_START);

describe("HelpBox", () =>
{
    it("shows the short help on hover, and hides it when the mouse leaves", async () =>
    {
        render(Field);
        await userEvent.hover(helpBox());
        await expect.element(popup()).toBeVisible();
        await expect.element(page.getByText("Source tables")).toBeVisible();
        await expect.element(page.getByText("Click ? icon to show more")).toBeVisible();
        expect(full().query()).toBeNull();
        await userEvent.unhover(helpBox());
        await expect.element(popup()).not.toBeInTheDocument();
    });

    it("shows the full help on click, keeps it when the mouse leaves, and hides it on a second click", async () =>
    {
        render(Field);
        await userEvent.click(helpBox());
        await expect.element(full()).toBeVisible();
        await userEvent.unhover(helpBox());
        await expect.element(full()).toBeVisible();
        await userEvent.click(helpBox());
        await expect.element(popup()).not.toBeInTheDocument();
    });

    it("cycles with F1 in the field, which keeps the focus", async () =>
    {
        render(Field);
        await userEvent.click(page.getByTestId("field"));
        await userEvent.keyboard("{F1}");
        await expect.element(page.getByText("Click ? icon or press F1 to show more")).toBeVisible();
        await userEvent.keyboard("{F1}");
        await expect.element(full()).toBeVisible();
        await expect.element(page.getByTestId("field")).toHaveFocus();
        await userEvent.keyboard("{F1}");
        await expect.element(popup()).not.toBeInTheDocument();
    });

    it("hides on Escape and on a click elsewhere", async () =>
    {
        render(Field);
        await userEvent.click(helpBox());
        await expect.element(full()).toBeVisible();
        await userEvent.keyboard("{Escape}");
        await expect.element(popup()).not.toBeInTheDocument();
        await userEvent.click(helpBox());
        await expect.element(full()).toBeVisible();
        await userEvent.click(page.getByTestId("field"));
        await expect.element(popup()).not.toBeInTheDocument();
    });
});
