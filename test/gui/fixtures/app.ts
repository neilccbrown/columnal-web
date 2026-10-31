// Renders the whole app (App.vue), with its own project storage, each project's engine in the page,
// and opening in another tab recorded rather than done.
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import App from "../../../src/gui/App.vue";
import { InPageTransport } from "../../../src/gui/engine/transports.js";
import { projectHash } from "../../../src/gui/project/appContext.js";
import { ProjectStore } from "../../../src/gui/project/ProjectStore.js";

export interface RenderedApp
{
    // A second connection to the app's storage, for the test:
    readonly store: ProjectStore;
    readonly storeName: string;
    // Each project window's engine, in order:
    readonly transports: InPageTransport[];
    // The projects opened in another tab:
    readonly openedInNewTab: string[];
    // Renders the app again (as reloading the tab does), showing the given project, if any:
    rerender(projectId: string | null): void;
}

/** Shows the app, with a new storage (and the projects given, made first), and the project given. */
export async function renderApp(projects: readonly { name: string, content: string }[] = [], show: number | null = null): Promise<RenderedApp & { readonly ids: readonly string[] }>
{
    const storeName = "columnal-test-" + crypto.randomUUID();
    const store = await ProjectStore.open(storeName);
    const ids: string[] = [];
    for (const p of projects)
        ids.push(await store.create(p.name, p.content));
    const app: RenderedApp = {
        store,
        storeName,
        transports: [],
        openedInNewTab: [],
        rerender: projectId =>
        {
            cleanup();
            history.replaceState(null, "", location.pathname + location.search + (projectId === null ? "" : projectHash(projectId)));
            render(App, {
                props: {
                    storeName,
                    makeTransport: () =>
                    {
                        const t = new InPageTransport();
                        app.transports.push(t);
                        return t;
                    },
                    openInNewTab: (id: string) => app.openedInNewTab.push(id),
                },
            });
        },
    };
    app.rerender(show === null ? null : ids[show]!);
    return { ...app, ids };
}

/** The id of the project this tab shows, from the URL. */
export function shownProject(): string | null
{
    const m = /^#project=(.+)$/.exec(location.hash);
    return m === null ? null : decodeURIComponent(m[1]!);
}

/** Waits for the project window to have loaded its project (its banner gone, or read-only). */
export async function waitForLoaded(): Promise<void>
{
    await vi.waitUntil(() => document.querySelector(".main-window") !== null && document.querySelector(".banner-message")?.textContent?.includes("Loading") !== true, { timeout: 5000 });
}

/**
 * Clicks a menu bar's menu, then its item (Java: clickOn("#id-menu-x").moveTo(".id-menu-x-y").clickOn()).
 * The menu has its id as a class (Reka gives it its own id).
 */
export async function clickMenu(menuClass: string, itemClass: string): Promise<void>
{
    await userEvent.click(document.querySelector(".menu-bar ." + menuClass)!);
    await vi.waitUntil(() => document.querySelector("." + itemClass) !== null);
    await userEvent.click(document.querySelector("." + itemClass)!);
}

export async function closeApp(app: RenderedApp): Promise<void>
{
    cleanup();
    app.store.close();
    history.replaceState(null, "", location.pathname + location.search);
    // (The app's own connection closes as it unmounts)
    await new Promise<void>(resolve =>
    {
        const request = indexedDB.deleteDatabase(app.storeName);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
}
