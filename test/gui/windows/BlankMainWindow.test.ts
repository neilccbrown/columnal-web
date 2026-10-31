// Port of TestBlankMainWindow (tests-gui-central): the tests of a new project's window that don't make
// tables (the rest come with making tables, Phase 9 step 4).
import { afterEach, expect, test, vi } from "vitest";
import { clickMenu, closeApp, renderApp, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java: start(), a MainWindow on a new file
async function start(): Promise<RenderedApp>
{
    const rendered = await renderApp([{ name: "blank", content: "" }], 0);
    await waitForLoaded();
    return rendered;
}

// Both a test, and used as utility method.
async function testStartState(a: RenderedApp): Promise<void>
{
    expect(document.querySelector(".main-window")).not.toBeNull();
    expect(a.transports.length).toBe(1);
    expect(a.transports[0]!.host.tableManager.getAllTables()).toEqual([]);
    // No dialogs or other windows:
    expect(document.querySelectorAll("[role=dialog]").length).toBe(0);
}

test("testStartState", async () =>
{
    app = await start();
    await testStartState(app);
});

test("testNewClick", async () =>
{
    app = await start();
    await testStartState(app);
    await clickMenu("id-menu-project", "id-menu-project-new");
    // A second project, in a window of its own (here, another tab):
    await vi.waitUntil(() => app!.openedInNewTab.length === 1);
    const [newId] = app.openedInNewTab;
    expect(newId).not.toBe(shownProject());
    expect((await app.store.get(newId!))?.name).toBe("Untitled-1");
    expect(document.querySelector(".main-window")).not.toBeNull();
});

test("testCloseMenu", async () =>
{
    app = await start();
    await testStartState(app);
    await clickMenu("id-menu-project", "id-menu-project-close");
    // No project window (Java: none left); the tab shows the initial window
    await vi.waitUntil(() => document.querySelector(".initial-window") !== null);
    expect(document.querySelector(".main-window")).toBeNull();
    expect(shownProject()).toBeNull();
});
