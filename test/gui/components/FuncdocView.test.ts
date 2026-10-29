// FuncdocView (docs/gui-spec/funcdoc-view.md): shows a documentation page, follows its links, and
// emits the examples that are clicked.
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h, shallowRef } from "vue";
import FuncdocView from "../../../src/gui/components/FuncdocView.vue";

const view = () => page.getByTestId("funcdoc");

describe("FuncdocView", () =>
{
    it("shows a page, and emits an example when it is clicked", async () =>
    {
        const onInsert = vi.fn();
        render(FuncdocView, { props: { page: "function-text-replace.html", onInsert } });
        await expect.element(view().getByText("Replaces all occurrences", { exact: false })).toBeVisible();
        const example = view().getByTitle("Click to insert into editor").first();
        await expect.element(example).toHaveTextContent("replace(\"at\", \"og\", \"The cat in the hat\")");
        await example.click();
        expect(onInsert).toHaveBeenCalledExactlyOnceWith("replace(\"at\", \"og\", \"The cat in the hat\")");
    });

    it("follows links to other pages, and goes back to the page it is given when that changes", async () =>
    {
        const shown = shallowRef("function-text-replace.html");
        render(defineComponent(() => () => h(FuncdocView, { page: shown.value })));
        await view().getByRole("link", { name: "Text" }).first().click();
        await expect.element(view().getByText("Text", { exact: true }).first()).toHaveClass("type-name-header");
        expect(view().getByText("Replaces all occurrences", { exact: false }).query()).toBeNull();
        shown.value = "syntax-if.html";
        await expect.element(view().getByText("Chooses between two expressions", { exact: false })).toBeVisible();
    });

    it("shows a namespace's page, from a namespace link", async () =>
    {
        render(FuncdocView, { props: { page: "type-Date.html" } });
        await view().getByRole("link", { name: "datetime", exact: true }).first().click();
        await expect.element(view().getByText("datetime functions")).toBeVisible();
    });

    it("shows nothing for a page that doesn't exist", async () =>
    {
        render(FuncdocView, { props: { page: "function-text-nothing.html" } });
        await expect.element(view()).toBeEmptyDOMElement();
    });
});
