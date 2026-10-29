// FancyList (docs/gui-spec/fancy-list.md): select, delete (cross or keyboard), reorder by dragging, add.
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import FancyList from "../../../src/gui/components/FancyList.vue";

function renderList(initial: string[])
{
    const items = ref(initial);
    render(defineComponent(() => () => h(FancyList<string>, {
        "items": items.value, "onUpdate:items": (v: string[]) => { items.value = v; },
        "newItem": () => "new",
        "style": "height: 300px; width: 300px",
    }, {
        cell: ({ item, setItem }: { item: string, setItem: (s: string) => void }) => h("div", { style: "padding: 4px 10px" }, [
            h("span", { "data-testid": "label" }, item),
            h("input", { "aria-label": "Edit " + item, "value": item, "onChange": (e: Event) => setItem((e.target as HTMLInputElement).value) }),
        ]),
    })));
    return items;
}

const cell = (text: string) => page.getByText(text, { exact: true });
const labels = () => page.getByTestId("label").elements().map(e => e.textContent);

describe("FancyList", () =>
{
    it("adds an item with Add, and changes an item from its cell", async () =>
    {
        const items = renderList(["a", "b"]);
        await userEvent.click(page.getByRole("button", { name: "Add" }));
        expect(items.value).toEqual(["a", "b", "new"]);
        await userEvent.fill(page.getByRole("textbox", { name: "Edit b" }), "bee");
        await userEvent.keyboard("{Tab}");
        expect(items.value).toEqual(["a", "bee", "new"]);
    });

    it("deletes an item with its cross", async () =>
    {
        const items = renderList(["a", "b", "c"]);
        await userEvent.click(page.getByRole("button", { name: "Delete" }).nth(1));
        await expect.poll(() => items.value).toEqual(["a", "c"]);
        expect(labels()).toEqual(["a", "c"]);
    });

    it("selects with a click and a shift-click, and deletes the selection with Delete", async () =>
    {
        const items = renderList(["a", "b", "c", "d"]);
        await userEvent.click(cell("b"));
        await userEvent.click(cell("c"), { modifiers: ["Shift"] });
        expect(document.querySelectorAll(".fancy-list-cell.selected").length).toBe(2);
        await userEvent.keyboard("{Delete}");
        await expect.poll(() => items.value).toEqual(["a", "d"]);
    });

    it("keeps the selection on the same cells after a delete", async () =>
    {
        const items = renderList(["a", "b", "c", "d"]);
        await userEvent.click(cell("c"));
        await userEvent.click(page.getByRole("button", { name: "Delete" }).first());
        await expect.poll(() => items.value).toEqual(["b", "c", "d"]);
        expect([...document.querySelectorAll(".fancy-list-cell.selected [data-testid=label]")].map(e => e.textContent)).toEqual(["c"]);
        await userEvent.keyboard("{Delete}");
        await expect.poll(() => items.value).toEqual(["b", "d"]);
        expect(document.querySelectorAll(".fancy-list-cell.selected").length).toBe(0);
        await userEvent.keyboard("{Delete}");
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(items.value).toEqual(["b", "d"]);
    });

    it("doesn't delete the selection on Backspace in a field", async () =>
    {
        const items = renderList(["a", "b"]);
        await userEvent.click(cell("a"));
        await userEvent.click(page.getByRole("textbox", { name: "Edit b" }));
        await userEvent.keyboard("{Backspace}");
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(items.value).toEqual(["a", "b"]);
    });

    it("moves the selection by dragging", async () =>
    {
        const items = renderList(["a", "b", "c"]);
        await userEvent.dragAndDrop(cell("a"), page.getByRole("button", { name: "Add" }));
        expect(items.value).toEqual(["b", "c", "a"]);
        await userEvent.dragAndDrop(cell("c"), cell("b"), { targetPosition: { x: 2, y: 2 } });
        expect(items.value).toEqual(["c", "b", "a"]);
    });
});
