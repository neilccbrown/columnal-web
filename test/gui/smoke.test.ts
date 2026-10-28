// GUI smoke test: the app's shell mounts and shows engine-derived content.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-vue";
import App from "../../src/gui/App.vue";

test("app loads", async () =>
{
    render(App);
    await expect.element(page.getByRole("heading", { name: "Columnal" })).toBeVisible();
    await expect.element(page.getByText("File format version 3")).toBeVisible();
});
