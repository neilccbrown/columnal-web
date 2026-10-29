// ErrorableTextField (docs/gui-spec/errorable-text-field.md): errors and warnings outline the field and
// show in a popup while it has the focus; quick fixes change the text.
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import ErrorableTextField from "../../../src/gui/components/ErrorableTextField.vue";
import { ErrorableTextField as Conversion } from "../../../src/gui-logic/utility-gui/utility/gui/ErrorableTextField.js";

const isLetter = (c: number, first: boolean) => /\p{L}/u.test(String.fromCodePoint(c)) || (!first && c === 0x20);

function renderField(converter: (s: string) => Conversion.ConversionResult<string>)
{
    const values: (string | null)[] = [];
    const text = ref("");
    render(defineComponent(() => () => h("div", [
        h(ErrorableTextField<string>, {
            "text": text.value, "onUpdate:text": (v: string) => { text.value = v; },
            converter, "onUpdate:value": (v: string | null) => { values.push(v); },
            "aria-label": "Name",
        }),
        h("button", "Elsewhere"),
    ])));
    return { values, text };
}

const field = () => page.getByRole("textbox", { name: "Name" });

describe("ErrorableTextField", () =>
{
    it("shows an error with a fix while focused, and the fix changes the text", async () =>
    {
        const { values, text } = renderField(s => Conversion.checkAlphabet(s, isLetter, x => x));
        await userEvent.click(field());
        await expect.element(field()).not.toHaveClass("has-error");
        await userEvent.keyboard("ab1c");
        await expect.element(field()).toHaveClass("has-error");
        await expect.element(page.getByText("Character not allowed: 1")).toBeVisible();
        await expect.element(page.getByText("Character code: \\u31")).toBeVisible();
        await userEvent.click(page.getByRole("button", { name: "Remove character" }));
        expect(text.value).toBe("abc");
        await expect.element(field()).not.toHaveClass("has-error");
        await expect.element(page.getByText("Character not allowed: 1")).not.toBeInTheDocument();
        await expect.element(field()).toHaveFocus();
        expect(values.at(-1)).toBe("abc");
        expect(values).toContain(null);
    });

    it("hides the popup when the focus leaves, but keeps the outline", async () =>
    {
        renderField(s => Conversion.checkAlphabet(s, isLetter, x => x));
        await userEvent.click(field());
        await userEvent.keyboard(" a");
        await expect.element(page.getByText("Character not allowed at start:", { exact: false })).toBeVisible();
        await userEvent.click(page.getByRole("button", { name: "Elsewhere" }));
        await expect.element(page.getByText("Character not allowed at start:", { exact: false })).not.toBeInTheDocument();
        await expect.element(field()).toHaveClass("has-error");
    });

    it("shows warnings", async () =>
    {
        renderField(s => Conversion.ConversionResult.success(s, ...(s.length > 3 ? ["That's long"] : [])));
        await userEvent.click(field());
        await userEvent.keyboard("abcd");
        await expect.element(field()).toHaveClass("has-warnings");
        await expect.element(page.getByText("That's long")).toBeVisible();
        await userEvent.keyboard("{Backspace}");
        await expect.element(field()).not.toHaveClass("has-warnings");
    });

    it("converts again when what the converter uses changes", async () =>
    {
        const allowDigits = ref(false);
        const { values } = renderField(s => Conversion.checkAlphabet(s, (c, first) => isLetter(c, first) || (allowDigits.value && c >= 0x30 && c <= 0x39), x => x));
        await userEvent.click(field());
        await userEvent.keyboard("a1");
        await expect.element(field()).toHaveClass("has-error");
        allowDigits.value = true;
        await expect.element(field()).not.toHaveClass("has-error");
        expect(values.at(-1)).toBe("a1");
    });
});
