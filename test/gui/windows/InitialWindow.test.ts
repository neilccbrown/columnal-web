// Port of TestInitialWindow (tests-gui-central): the initial window's New.
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { closeApp, renderApp, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

test("testNew", async () =>
{
    app = await renderApp();
    await vi.waitUntil(() => document.querySelector(".initial-window") !== null);
    // No project window yet:
    expect(document.querySelector(".main-window")).toBeNull();
    await userEvent.click(document.querySelector(".id-initial-new")!);
    // The initial window is replaced by the new project's window (Java: hides itself, shows a MainWindow):
    await waitForLoaded();
    expect(document.querySelector(".initial-window")).toBeNull();
    const id = shownProject();
    expect(id).not.toBeNull();
    expect((await app.store.get(id!))?.name).toBe("Untitled-1");
});
