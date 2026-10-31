// GUI smoke test: the app mounts, showing the initial window, and a new project's window starts its
// engine (in the page, and in the worker).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import App from "../../src/gui/App.vue";
import { InPageTransport } from "../../src/gui/engine/transports.js";
import { closeApp, renderApp, waitForLoaded, type RenderedApp } from "./fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

test("app loads", async () =>
{
    app = await renderApp();
    await expect.element(page.getByRole("heading", { name: "New project" })).toBeVisible();
    await userEvent.click(document.querySelector(".id-initial-new")!);
    await waitForLoaded();
    expect(app.transports[0]).toBeInstanceOf(InPageTransport);
});

test("app loads with the engine worker", async () =>
{
    const storeName = "columnal-test-" + crypto.randomUUID();
    render(App, { props: { storeName } });
    await expect.element(page.getByRole("heading", { name: "New project" })).toBeVisible();
    await userEvent.click(document.querySelector(".id-initial-new")!);
    await waitForLoaded();
    // The new project was saved, through the worker's engine:
    await vi.waitUntil(() => document.querySelector(".banner-message") === null);
    cleanup();
    history.replaceState(null, "", location.pathname + location.search);
    indexedDB.deleteDatabase(storeName);
});
