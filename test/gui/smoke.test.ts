// GUI smoke test: the app's shell mounts, with its engine, and shows engine-derived content.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-vue";
import App from "../../src/gui/App.vue";
import { InPageTransport } from "../../src/gui/engine/transports.js";

test("app loads", async () =>
{
    render(App, { props: { transport: new InPageTransport() } });
    await expect.element(page.getByRole("heading", { name: "Columnal" })).toBeVisible();
    await expect.element(page.getByText("File format version 3")).toBeVisible();
});

test("app loads with the engine worker", async () =>
{
    render(App);
    await expect.element(page.getByRole("heading", { name: "Columnal" })).toBeVisible();
});
