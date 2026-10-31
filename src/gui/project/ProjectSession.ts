// An open project's saving (Java: View's file handling, and MainWindow's loading): it loads the
// project into the engine, then saves it after each change, keeping the saves it replaces for undo
// (docs/gui-spec/projects.md).
import { shallowRef, type ShallowRef } from "vue";
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { UndoManager } from "../../gui-logic/app/gui/UndoManager.js";
import type { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import type { EngineClient } from "../engine/EngineClient.js";
import { t } from "../i18n.js";
import { acquireProjectLock, type ProjectLock } from "./projectLock.js";
import type { ProjectStore } from "./ProjectStore.js";

export type Banner = "loading" | "readOnly" | "openElsewhere" | null;

export class ProjectSession
{
    public readonly name: ShallowRef<string> = shallowRef("");
    // Java: MainWindow.updateBanner: "Loading...", or read-only after a loading error; here also
    // read-only when another tab has the project open
    public readonly banner: ShallowRef<Banner> = shallowRef("loading");
    // Java: View.lastSaveTime, null while saving after a change (SaveMenuItem's "Saving")
    public readonly lastSaveTime: ShallowRef<Date | null> = shallowRef(new Date());
    private id: string;
    // Java: View.readOnly: until loaded, while undoing, and after a loading error
    private readOnly = true;
    private saveCount = 0;
    // The content last saved (Java: the file's content)
    private savedContent: string | null = null;
    private lock: ProjectLock | null = null;
    private readonly undoManager = new UndoManager();
    // Saves are made one after another:
    private saving: Promise<void> = Promise.resolve();

    public constructor(
        private readonly store: ProjectStore,
        id: string,
        private readonly client: EngineClient,
        private readonly grid: VirtualGrid,
        // Shows an error (Java: FXUtility.logAndShowError, alertOnError_)
        private readonly showError: (title: string, message: string) => void)
    {
        this.id = id;
    }

    public getId(): string
    {
        return this.id;
    }

    public isReadOnly(): boolean
    {
        return this.readOnly;
    }

    public _test_getSaveCount(): number
    {
        return this.saveCount;
    }

    /**
     * Java: MainWindow's constructor, loading the file then enabling writing.  Returns false if there
     * is no such project.
     */
    public async load(): Promise<boolean>
    {
        const project = await this.store.get(this.id);
        if (project === null)
            return false;
        this.name.value = project.name;
        this.lock = await acquireProjectLock(this.id);
        if (project.content !== "")
        {
            try
            {
                const loaded = await this.client.request("load", project.content);
                this.loadColumnWidths(loaded.columnWidths);
            }
            catch (e)
            {
                this.showError(t("error.loading", project.name), t("error.loading.file", project.name, e instanceof Error ? e.message : String(e)));
                this.banner.value = "readOnly";
                return true;
            }
        }
        this.savedContent = project.content;
        if (this.lock === null)
        {
            this.banner.value = "openElsewhere";
            return true;
        }
        this.enableWriting();
        this.banner.value = null;
        return true;
    }

    /** Java: View.enableWriting */
    private enableWriting(): void
    {
        this.readOnly = false;
        if (this.savedContent === null || this.savedContent === "")
            this.save(true);
        else
            this.undoManager.backupForUndo(this.id, this.savedContent, new Date());
    }

    /** Java: View.modified */
    public modified(): void
    {
        this.lastSaveTime.value = null;
        this.save(true);
    }

    /** Java: View.save */
    public save(keepPrevForUndo: boolean): Promise<void>
    {
        if (this.readOnly)
            return this.saving;
        this.saveCount += 1;
        this.saving = this.saving.then(() => this.doSave(keepPrevForUndo)).catch((e: unknown) =>
        {
            this.showError(t("save.error"), e instanceof Error ? e.message : String(e));
        });
        return this.saving;
    }

    // Java: View.doSaveTo, to the project's storage
    private async doSave(keepPrevForUndo: boolean): Promise<void>
    {
        const content = await this.saveContent();
        const now = new Date();
        // This will do backup for undo:
        if (this.savedContent !== null && keepPrevForUndo)
            this.undoManager.backupForUndo(this.id, this.savedContent, now);
        await this.store.saveContent(this.id, content);
        this.savedContent = content;
        this.lastSaveTime.value = now;
    }

    // The file's content, with the customised column widths (Java: View.doSaveTo's display details)
    private saveContent(): Promise<string>
    {
        const widths = [...this.grid.getCustomisedColumnWidths()].sort((a, b) => a[0] - b[0]);
        return this.client.request("save", widths.map(([column, width]) => `COLUMNWIDTH ${column} ${Math.round(width)}`));
    }

    /** Java: View.loadColumnWidths */
    private loadColumnWidths(columnWidths: readonly (readonly [number, number])[]): void
    {
        for (const [column, width] of columnWidths)
            this.grid.setColumnWidth(CellPosition.col(column), width, false);
    }

    /**
     * Java: View.undo: goes back to the save before the last (skipping any with the same content).
     * (Java bug, fixed: with nothing to undo, Java returned without enabling writing again, so nothing
     * more was saved.)  Here nothing happens while read-only (Java's would then enable writing, even
     * after a loading error), as a tab with the project open in another mustn't write it.
     */
    public async undo(): Promise<void>
    {
        if (this.readOnly)
            return;
        this.readOnly = true;
        await this.saving;
        const current = this.savedContent;
        let prev = this.undoManager.undo(this.id);
        while (current !== null && current === prev)
            prev = this.undoManager.undo(this.id);

        if (prev === null)
        {
            // Nothing to undo
            this.readOnly = false;
            return;
        }

        try
        {
            const loaded = await this.client.request("load", prev);
            this.loadColumnWidths(loaded.columnWidths);
        }
        catch (e)
        {
            // Java wrote the content to an "emergency" file in the home directory, or else copied it to
            // the clipboard; here it goes to a new project
            const name = "emergency" + Date.now();
            await this.store.create(name, prev);
            this.showError(t("problem.undoing.content.saved.to", name), e instanceof Error ? e.message : String(e));
        }
        this.readOnly = false;
        await this.save(false);
    }

    /**
     * Java: View.setDiskFileAndSave, from Save As: the project is saved under the new name (a new
     * project), which is then the one open (and at the top of the recent list).
     */
    public async saveAs(name: string): Promise<string>
    {
        const newId = await this.store.create(name, "");
        const newLock = await acquireProjectLock(newId);
        this.lock?.release();
        this.lock = newLock;
        this.id = newId;
        this.name.value = name;
        // (A new file, so nothing to back up)
        this.savedContent = null;
        await this.save(true);
        await this.store.usedProject(newId);
        return newId;
    }

    /** Java: View.doSaveTo(false, dest), from Save a Copy: here the copy is downloaded. */
    public async saveCopy(): Promise<void>
    {
        const content = await this.saveContent();
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = this.name.value + ".clmnl";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Closing the project: the last save finishes, and the project is free for other tabs. */
    public async close(): Promise<void>
    {
        await this.saving;
        this.readOnly = true;
        this.lock?.release();
        this.lock = null;
    }
}
