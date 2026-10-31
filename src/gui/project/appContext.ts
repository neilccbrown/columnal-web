// What the windows share (Java: the static parts of InitialWindow and MainWindow): the project store,
// making each project's engine, and which window this tab shows.  A tab shows the initial window
// or one project (docs/gui-spec/projects.md).
import { inject, provide, type InjectionKey } from "vue";
import type { EngineTransport } from "../engine/transports.js";
import type { ProjectStore } from "./ProjectStore.js";

export interface AppContext
{
    readonly store: ProjectStore;
    // A new engine, for a project's window:
    makeTransport(): EngineTransport;
    // Shows the project in this tab (Java: InitialWindow hiding itself and showing a MainWindow):
    showProject(id: string): void;
    // Opens the project in another tab (Java: a MainWindow opening another MainWindow):
    openProjectInNewTab(id: string): void;
    // Shows the initial window in this tab (Java: closing a MainWindow)
    showInitial(): void;
    // The project shown in this tab is now this one (after Save As), without showing it again:
    setProjectInUrl(id: string): void;
}

const APP_CONTEXT: InjectionKey<AppContext> = Symbol("appContext");

export function provideAppContext(context: AppContext): void
{
    provide(APP_CONTEXT, context);
}

export function useAppContext(): AppContext
{
    const context = inject(APP_CONTEXT);
    if (context === undefined)
        throw new Error("useAppContext() outside App");
    return context;
}

/** The URL fragment for a project: the tab shows it, and reloading the tab opens it again. */
export function projectHash(id: string): string
{
    return "#project=" + encodeURIComponent(id);
}

/** The project in the URL's fragment, if any. */
export function projectInHash(hash: string): string | null
{
    const m = /^#project=(.+)$/.exec(hash);
    return m === null ? null : decodeURIComponent(m[1]!);
}
