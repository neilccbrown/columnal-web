// ContextMenu, HoverTooltip and AbbrevLabel (docs/gui-spec/menus-and-tooltips.md).
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h } from "vue";
import AbbrevLabel from "../../../src/gui/components/AbbrevLabel.vue";
import ContextMenu from "../../../src/gui/components/menus/ContextMenu.vue";
import { checkMenuItem, disabled, menu, menuItem, menuItemPos, separator } from "../../../src/gui/components/menus/menus.js";
import HoverTooltip from "../../../src/gui/components/HoverTooltip.vue";
import { isMac } from "../../../src/gui/shortcuts.js";

describe("ContextMenu", () =>
{
    function renderMenu()
    {
        const undo = vi.fn(), find = vi.fn(), units = vi.fn(), types = vi.fn(), check = vi.fn();
        let checked = false;
        render(defineComponent(() => () => h(ContextMenu, {
            items: () => [
                menuItem("menu.edit.undo", undo),
                disabled(menuItem("menu.view.find", find)),
                separator(),
                menu("menu.project.open.recent", menuItemPos("menu.view.units", units), menuItem("menu.view.types", types)),
                checkMenuItem("menu.view.goto.row", checked, c => { checked = c; check(c); }),
            ],
        }, () => h("div", { "data-testid": "target", "style": "width: 200px; height: 100px" }, "Right-click me"))));
        return { undo, find, units, types, check };
    }

    it("shows on a right click, with the items' text, shortcuts and ids, and runs the one clicked", async () =>
    {
        const { undo } = renderMenu();
        await userEvent.click(page.getByTestId("target"), { button: "right" });
        const undoItem = page.getByRole("menuitem", { name: /^Undo/ });
        await expect.element(undoItem).toBeVisible();
        await expect.element(undoItem).toHaveTextContent(isMac() ? "Undo⌘Z" : "UndoCtrl+Z");
        await expect.element(undoItem).toHaveClass("id-menu-edit-undo");
        await userEvent.click(undoItem);
        expect(undo).toHaveBeenCalledOnce();
        await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    });

    it("doesn't run a disabled item, opens submenus, passes the menu's centre, and toggles check items", async () =>
    {
        const { find, units, check } = renderMenu();
        await userEvent.click(page.getByTestId("target"), { button: "right" });
        await userEvent.click(page.getByRole("menuitem", { name: /^Find/ }), { force: true });
        expect(find).not.toHaveBeenCalled();
        await userEvent.click(page.getByRole("menuitem", { name: /Open recent/ }));
        await userEvent.click(page.getByRole("menuitem", { name: "Units..." }));
        expect(units).toHaveBeenCalledOnce();
        const centre = units.mock.calls[0]![0] as { x: number, y: number };
        expect(centre.x).toBeGreaterThan(0);
        expect(centre.y).toBeGreaterThan(0);
        await userEvent.click(page.getByTestId("target"), { button: "right" });
        await userEvent.click(page.getByRole("menuitemcheckbox", { name: /Goto row/ }));
        expect(check).toHaveBeenCalledExactlyOnceWith(true);
    });
});

describe("HoverTooltip", () =>
{
    it("shows its text after the pointer rests on the target", async () =>
    {
        render(defineComponent(() => () => h(HoverTooltip, { text: "The tip" }, () => h("button", "Target"))));
        await userEvent.hover(page.getByRole("button", { name: "Target" }));
        await expect.element(page.getByRole("tooltip")).toHaveTextContent("The tip");
        await userEvent.unhover(page.getByRole("button", { name: "Target" }));
        await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
    });

    it("shows a label's full text only when it is cut short", async () =>
    {
        const long = "A rather long label which won't fit";
        render(defineComponent(() => () => h("div", [
            h("div", { style: "width: 60px" }, [h(AbbrevLabel, { "text": long, "data-testid": "long" })]),
            h("div", { style: "width: 600px" }, [h(AbbrevLabel, { text: "Short" })]),
        ])));
        await userEvent.hover(page.getByText("Short"));
        await new Promise(resolve => setTimeout(resolve, 1300));
        expect(page.getByRole("tooltip").query()).toBeNull();
        await userEvent.hover(page.getByText(long));
        await expect.element(page.getByRole("tooltip")).toHaveTextContent(long);
    });
});
