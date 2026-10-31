// Projects in the browser's storage (docs/gui-spec/projects.md): autosaving, reopening, undo, Save as,
// Save a copy, a project open in another tab, column widths, and the Open dialog and recent projects.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { EngineHost } from "../../../src/gui/engine/EngineHost.js";
import { EngineClient } from "../../../src/gui/engine/EngineClient.js";
import { InPageTransport } from "../../../src/gui/engine/transports.js";
import { acquireProjectLock } from "../../../src/gui/project/projectLock.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { clickMenu, closeApp, renderApp, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// The value of T's column N, row 0, as the engine has it
function firstN(host: EngineHost): string
{
    return host.tableManager.getSingleTableOrNull(host.tableManager.getAllTables().find(t => t.getId().getRaw() === "T")!.getId())!.getData().getColumns()[0]!.getType().getCollapsed(0).toString();
}

// Edits T's column N, row 0, as the cell editor does
async function editFirstN(host: EngineHost, text: string): Promise<void>
{
    // (The host's table versions are its own)
    const version = (host as unknown as { tables: Map<string, { version: number }> }).tables.get("T")!.version;
    host.edit("T", version, 0, 0, text);
}

async function content(a: RenderedApp, id: string): Promise<string>
{
    return (await a.store.get(id))?.content ?? "";
}

describe("Projects", () =>
{
    test("a project saves after each change, and opens again as saved", async () =>
    {
        const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE }], 0);
        await waitForLoaded();
        const id = shownProject()!;
        await editFirstN(a.transports[0]!.host, "7");
        await vi.waitUntil(async () => (await content(a, id)).includes("7 , \"a\""));
        // Reopened (as reloading the tab does), it has the change:
        a.rerender(id);
        await waitForLoaded();
        await vi.waitUntil(() => a.transports[1]!.host.tableManager.getAllTables().length === 2);
        expect(firstN(a.transports[1]!.host)).toBe("7");
        expect(document.title).toBe("P");
    });

    test("undo goes back to the save before", async () =>
    {
        const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE }], 0);
        await waitForLoaded();
        const id = shownProject()!;
        const host = a.transports[0]!.host;
        await editFirstN(host, "7");
        await vi.waitUntil(async () => (await content(a, id)).includes("7 , \"a\""));
        await editFirstN(host, "8");
        await vi.waitUntil(async () => (await content(a, id)).includes("8 , \"a\""));
        await clickMenu("id-menu-edit", "id-menu-edit-undo");
        await vi.waitUntil(async () => (await content(a, id)).includes("7 , \"a\""));
        expect(firstN(host)).toBe("7");
        await clickMenu("id-menu-edit", "id-menu-edit-undo");
        await vi.waitUntil(async () => (await content(a, id)).includes("1 , \"a\""));
        expect(firstN(host)).toBe("1");
        // Nothing more to undo: nothing happens, and changes are still saved (Java bug, fixed: Java
        // stopped saving)
        await clickMenu("id-menu-edit", "id-menu-edit-undo");
        await new Promise(r => setTimeout(r, 200));
        expect(firstN(host)).toBe("1");
        await editFirstN(host, "5");
        await vi.waitUntil(async () => (await content(a, id)).includes("5 , \"a\""));
    });

    test("Save as makes a new project, which is then the one open", async () =>
    {
        const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE }], 0);
        await waitForLoaded();
        const oldId = shownProject()!;
        await clickMenu("id-menu-project", "id-menu-project-saveAs");
        const field = await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".save-as-name"));
        expect(field.value).toBe("P");
        await userEvent.fill(field, "Renamed");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => shownProject() !== oldId);
        const newId = shownProject()!;
        expect(document.title).toBe("Renamed");
        expect(await content(a, newId)).toContain("CALCULATE Double");
        expect((await a.store.recent()).map(p => p.name)).toEqual(["Renamed"]);
        // Later changes go to the new project:
        await editFirstN(a.transports[0]!.host, "9");
        await vi.waitUntil(async () => (await content(a, newId)).includes("9 , \"a\""));
        expect(await content(a, oldId)).not.toContain("9 , \"a\"");
    });

    test("Save a copy downloads the file", async () =>
    {
        app = await renderApp([{ name: "P", content: GRID_FIXTURE }], 0);
        await waitForLoaded();
        const downloads: { name: string, href: string }[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement)
        {
            downloads.push({ name: this.download, href: this.href });
        });
        try
        {
            await clickMenu("id-menu-project", "id-menu-project-saveCopy");
            await vi.waitUntil(() => downloads.length === 1);
            expect(downloads[0]!.name).toBe("P.clmnl");
            expect(await (await fetch(downloads[0]!.href)).text()).toContain("CALCULATE Double");
        }
        finally
        {
            click.mockRestore();
        }
    });

    test("a project open in another tab opens for reading only", async () =>
    {
        const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE }]);
        const lock = await acquireProjectLock(a.ids[0]!);
        try
        {
            a.rerender(a.ids[0]!);
            await waitForLoaded();
            expect(document.querySelector(".banner-message.error")?.textContent).toContain("open in another tab");
            await editFirstN(a.transports[0]!.host, "7");
            await new Promise(r => setTimeout(r, 200));
            expect(await content(a, a.ids[0]!)).toBe(GRID_FIXTURE);
        }
        finally
        {
            lock?.release();
        }
    });

    test("column widths are saved, and loaded", async () =>
    {
        // A file with a column width, as the engine saves it:
        const client = new EngineClient(new InPageTransport());
        await client.request("load", GRID_FIXTURE);
        const withWidth = await client.request("save", ["COLUMNWIDTH 2 150"]);
        client.close();
        const a = app = await renderApp([{ name: "P", content: withWidth }], 0);
        await waitForLoaded();
        const id = shownProject()!;
        await editFirstN(a.transports[0]!.host, "7");
        await vi.waitUntil(async () => (await content(a, id)).includes("7 , \"a\""));
        expect(await content(a, id)).toContain("COLUMNWIDTH 2 150");
    });

    test("Open: choosing, uploading and deleting projects", async () =>
    {
        const a = app = await renderApp([{ name: "First", content: GRID_FIXTURE }, { name: "Second", content: GRID_FIXTURE }]);
        await vi.waitUntil(() => document.querySelector(".initial-window") !== null);
        await userEvent.click(document.querySelector(".id-initial-open")!);
        await vi.waitUntil(() => document.querySelectorAll(".project-item").length === 2);
        // Deleting one:
        const second = [...document.querySelectorAll(".project-item")].find(e => e.textContent?.includes("Second"))!;
        await userEvent.click(second);
        await userEvent.click(document.querySelector(".delete-button")!);
        await vi.waitUntil(() => document.querySelectorAll("[role=dialog]").length === 2);
        await userEvent.click(document.querySelectorAll<HTMLElement>("[role=dialog]")[1]!.querySelector(".ok-button")!);
        await vi.waitUntil(() => document.querySelectorAll(".project-item").length === 1);
        expect(await a.store.get(a.ids[1]!)).toBeNull();
        // Uploading a file opens it:
        await userEvent.upload(document.querySelector<HTMLInputElement>(".upload-input")!, new File([GRID_FIXTURE], "Uploaded.clmnl"));
        await waitForLoaded();
        const id = shownProject()!;
        expect((await a.store.get(id))?.name).toBe("Uploaded");
        await vi.waitUntil(() => a.transports[0]!.host.tableManager.getAllTables().length === 2);
        // The open project can't be deleted:
        await clickMenu("id-menu-project", "id-menu-project-open");
        await vi.waitUntil(() => document.querySelectorAll(".project-item").length === 2);
        await userEvent.click([...document.querySelectorAll(".project-item")].find(e => e.textContent?.includes("Uploaded"))!);
        expect(document.querySelector<HTMLButtonElement>(".delete-button")!.disabled).toBe(true);
        // Opening one from a project's window opens it in another tab:
        await userEvent.dblClick([...document.querySelectorAll(".project-item")].find(e => e.textContent?.includes("First"))!);
        await vi.waitUntil(() => a.openedInNewTab.length === 1);
        expect(a.openedInNewTab).toEqual([a.ids[0]]);
    });

    test("recent projects, on the initial window and the menu", async () =>
    {
        const a = app = await renderApp([{ name: "First", content: GRID_FIXTURE }, { name: "Second", content: GRID_FIXTURE }, { name: "Never", content: "" }]);
        await a.store.usedProject(a.ids[0]!);
        await new Promise(r => setTimeout(r, 5));
        await a.store.usedProject(a.ids[1]!);
        a.rerender(null);
        // The most recently opened first; never opened ones aren't there (as in Java):
        await vi.waitUntil(() => document.querySelectorAll(".recent-item").length === 2);
        expect([...document.querySelectorAll(".recent-item")].map(e => e.textContent?.trim())).toEqual(["Second", "First"]);
        await userEvent.dblClick(document.querySelectorAll(".recent-item")[1]!);
        await waitForLoaded();
        expect(shownProject()).toBe(a.ids[0]);
        // Now at the top, as the project menu's recent list shows:
        await userEvent.click(document.querySelector(".menu-bar .id-menu-project")!);
        // (By the keyboard: Playwright never finds the submenu's item still enough to point at)
        (await vi.waitUntil(() => document.querySelector<HTMLElement>(".id-menu-project-open-recent"))).focus();
        await userEvent.keyboard("{ArrowRight}");
        await vi.waitUntil(() => document.querySelectorAll(".recent-project").length === 2);
        expect([...document.querySelectorAll(".recent-project")].map(e => e.textContent?.trim())).toEqual(["First", "Second"]);
    });

    test("menu shortcuts, but not while a dialog is open", async () =>
    {
        const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE }], 0);
        await waitForLoaded();
        const shortcut = (key: string): string => isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`;
        document.querySelector<HTMLElement>(".main-grid")!.focus();
        await userEvent.keyboard(shortcut("o"));
        await vi.waitUntil(() => document.querySelector(".project-list") !== null);
        // In the dialog, Alt+Shift+N (New project) does nothing:
        await userEvent.keyboard("{Alt>}{Shift>}N{/Shift}{/Alt}");
        await new Promise(r => setTimeout(r, 200));
        expect(a.openedInNewTab).toEqual([]);
        await userEvent.keyboard("{Escape}");
        await vi.waitUntil(() => document.querySelector(".project-list") === null);
        await userEvent.keyboard("{Alt>}{Shift>}N{/Shift}{/Alt}");
        await vi.waitUntil(() => a.openedInNewTab.length === 1);
    });

    test("a project that no longer exists", async () =>
    {
        app = await renderApp();
        app.rerender("no-such-project");
        await vi.waitUntil(() => document.querySelector(".initial-window") !== null);
        expect(document.querySelector("[role=dialog]")?.textContent).toContain("no longer exists");
        expect(shownProject()).toBeNull();
    });
});
