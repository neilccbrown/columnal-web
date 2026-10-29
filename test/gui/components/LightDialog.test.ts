// LightDialog, ErrorableLightDialog and DoubleOKLightDialog (docs/gui-spec/light-dialog.md).
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Validity } from "../../../src/gui/components/dialogs/dialogs.js";
import DoubleOKLightDialog from "../../../src/gui/components/dialogs/DoubleOKLightDialog.vue";
import ErrorableLightDialog from "../../../src/gui/components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../../../src/gui/components/dialogs/ErrorLabel.vue";
import LightDialog from "../../../src/gui/components/dialogs/LightDialog.vue";

const dialog = () => page.getByRole("dialog");
const ok = () => page.getByRole("button", { name: "OK" });
const field = () => page.getByRole("textbox");

function renderLight(props: Record<string, unknown> = {})
{
    const open = ref(true);
    const onOk = vi.fn(), onCancel = vi.fn();
    render(defineComponent(() => () => h(LightDialog, {
        "open": open.value, "onUpdate:open": (v: boolean) => { open.value = v; },
        "label": "Test dialog", onOk, onCancel, ...props,
    }, () => h("input", { "aria-label": "Field" }))));
    return { open, onOk, onCancel };
}

describe("LightDialog", () =>
{
    it("has Cancel then OK (not on Windows), and closes with OK on Enter in a field", async () =>
    {
        const { open, onOk } = renderLight();
        await expect.element(dialog()).toBeVisible();
        expect(dialog().getByRole("button").elements().map(b => b.textContent?.trim())).toEqual(["Cancel", "OK"]);
        await userEvent.click(field());
        await userEvent.keyboard("abc{Enter}");
        expect(onOk).toHaveBeenCalledOnce();
        expect(open.value).toBe(false);
        await expect.element(dialog()).not.toBeInTheDocument();
    });

    it("cancels on Escape, but not on a click outside", async () =>
    {
        const { onCancel } = renderLight();
        await expect.element(dialog()).toBeVisible();
        await userEvent.click(document.body, { position: { x: 5, y: 5 } });
        await expect.element(dialog()).toBeVisible();
        await userEvent.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledOnce();
        await expect.element(dialog()).not.toBeInTheDocument();
    });

    it("focuses OK when the background is clicked", async () =>
    {
        renderLight();
        await userEvent.click(field());
        await expect.element(field()).toHaveFocus();
        const box = dialog().element().getBoundingClientRect();
        await userEvent.click(dialog(), { position: { x: 4, y: box.height / 2 } });
        await expect.element(ok()).toHaveFocus();
    });

    it("moves when its background is dragged, and resizes by its edges if resizable", async () =>
    {
        renderLight({ resizable: true });
        await expect.element(dialog()).toBeVisible();
        const el = dialog().element() as HTMLElement;
        const drag = (fromX: number, fromY: number, dx: number, dy: number): void =>
        {
            const init = { bubbles: true, pointerId: 1, button: 0, buttons: 1 };
            el.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: fromX, clientY: fromY }));
            el.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: fromX + dx, clientY: fromY + dy }));
            el.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, clientX: fromX + dx, clientY: fromY + dy }));
        };
        const before = el.getBoundingClientRect();
        drag(before.left + 20, before.top + 20, 30, 40);
        await vi.waitUntil(() => el.getBoundingClientRect().left !== before.left);
        const moved = el.getBoundingClientRect();
        expect([moved.left - before.left, moved.top - before.top, moved.width]).toEqual([30, 40, before.width]);
        drag(moved.right - 1, moved.top + 30, 50, 0);
        await vi.waitUntil(() => el.getBoundingClientRect().width !== moved.width);
        expect(el.getBoundingClientRect().width).toBe(moved.width + 50);
        expect(el.getBoundingClientRect().left).toBe(moved.left);
    });

    it("is centred on a point, inside the window", async () =>
    {
        renderLight({ centreOn: { x: 10, y: 400 } });
        await vi.waitUntil(() => dialog().query()?.getBoundingClientRect().left === 20);
        const box = dialog().element().getBoundingClientRect();
        expect(box.top + box.height / 2).toBeCloseTo(400, 0);
    });
});

describe("ErrorableLightDialog", () =>
{
    it("shows the error and stays open, until there is a result", async () =>
    {
        const onOk = vi.fn();
        const value = ref("");
        render(defineComponent(() => () => h(ErrorableLightDialog<number>, {
            open: true, label: "Number", onOk,
            calculateResult: () => /^\d+$/.test(value.value) ? Either.right<string, number>(Number(value.value)) : Either.left<string, number>("Not a number"),
        }, {
            default: ({ error, clearError }: { error: string, clearError: () => void }) => [
                h("input", { "aria-label": "Field", "onInput": (e: Event) => { value.value = (e.target as HTMLInputElement).value; clearError(); } }),
                h(ErrorLabel, { error }),
            ],
        })));
        await userEvent.click(ok());
        await expect.element(page.getByRole("alert")).toHaveTextContent("Error: Not a number");
        expect(onOk).not.toHaveBeenCalled();
        await userEvent.type(field(), "42");
        await expect.element(page.getByRole("alert")).toHaveTextContent("");
        await userEvent.click(ok());
        expect(onOk).toHaveBeenCalledExactlyOnceWith(42);
        await expect.element(dialog()).not.toBeInTheDocument();
    });
});

describe("DoubleOKLightDialog", () =>
{
    function renderDoubleOK(validity: { value: Validity })
    {
        const onOk = vi.fn(), showAllErrors = vi.fn();
        const screen = render(defineComponent(() => () => h(DoubleOKLightDialog<string>, {
            open: true, label: "Double", onOk, showAllErrors,
            checkValidity: () => validity.value,
            calculateResult: () => "result",
        }, () => h("input", { "aria-label": "Field" }))));
        return { onOk, showAllErrors, screen };
    }
    const prompt = () => page.getByText("Errors found. Click OK", { exact: false });

    it("stays open while it can't be saved", async () =>
    {
        const { onOk, showAllErrors } = renderDoubleOK({ value: "IMPOSSIBLE_TO_SAVE" });
        await userEvent.click(ok());
        await userEvent.click(ok());
        expect(showAllErrors).toHaveBeenCalledTimes(2);
        expect(onOk).not.toHaveBeenCalled();
        expect(prompt().query()).toBeNull();
    });

    it("asks for a second OK when there are errors, and saves on it", async () =>
    {
        const { onOk, showAllErrors } = renderDoubleOK({ value: "ERROR_BUT_CAN_SAVE" });
        await userEvent.click(ok());
        await expect.element(prompt()).toBeVisible();
        expect(showAllErrors).toHaveBeenCalledOnce();
        expect(onOk).not.toHaveBeenCalled();
        // (Not a double-click)
        await new Promise(resolve => setTimeout(resolve, 350));
        await userEvent.click(ok());
        expect(onOk).toHaveBeenCalledExactlyOnceWith("result");
        await expect.element(dialog()).not.toBeInTheDocument();
        await expect.element(prompt()).not.toBeInTheDocument();
    });

    it("saves on the first OK without errors", async () =>
    {
        const { onOk, showAllErrors } = renderDoubleOK({ value: "NO_ERRORS" });
        await userEvent.click(ok());
        expect(onOk).toHaveBeenCalledExactlyOnceWith("result");
        expect(showAllErrors).not.toHaveBeenCalled();
    });
});
