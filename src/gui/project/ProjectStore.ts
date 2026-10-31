// The projects, kept in the browser's storage (IndexedDB), as Java kept them in files
// (docs/gui-spec/projects.md): each project's name and saved content, when it was saved, and when it
// was last opened (Java's recent files list: Utility.usedFile and readRecentFilesList).

export interface ProjectSummary
{
    readonly id: string;
    readonly name: string;
    // When it was last saved, and last opened (or saved as), in ms since the epoch; null if not opened
    readonly saved: number;
    readonly lastOpened: number | null;
}

export interface ProjectRecord extends ProjectSummary
{
    readonly content: string;
}

const STORE = "projects";
// Java: MRU_FILE_NAME's list is cut to 12
const MAX_RECENT = 12;

export class ProjectStore
{
    private constructor(private readonly db: IDBDatabase)
    {
    }

    /** Opens (or makes) the storage; tests give their own name. */
    public static open(name: string = "columnal"): Promise<ProjectStore>
    {
        return new Promise((resolve, reject) =>
        {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
            request.onsuccess = () => resolve(new ProjectStore(request.result));
            request.onerror = () => reject(request.error ?? new Error("Could not open the project storage"));
        });
    }

    /** All the projects, the most recently saved first. */
    public async list(): Promise<ProjectSummary[]>
    {
        const all = await this.request<ProjectRecord[]>("readonly", s => s.getAll());
        return all.map(({ content: _content, ...summary }) => summary).sort((a, b) => b.saved - a.saved);
    }

    /** The most recently opened projects (Java: readRecentFilesList), the latest first. */
    public async recent(): Promise<ProjectSummary[]>
    {
        return (await this.list()).filter(p => p.lastOpened !== null).sort((a, b) => b.lastOpened! - a.lastOpened!).slice(0, MAX_RECENT);
    }

    public async get(id: string): Promise<ProjectRecord | null>
    {
        return (await this.request<ProjectRecord | undefined>("readonly", s => s.get(id))) ?? null;
    }

    /** Makes a project, returning its id. */
    public async create(name: string, content: string): Promise<string>
    {
        const id = crypto.randomUUID();
        await this.put({ id, name, content, saved: Date.now(), lastOpened: null });
        return id;
    }

    /** Java: Utility.getNewAutoSaveFile, "Untitled-N" for the lowest N not used. */
    public async createUntitled(): Promise<string>
    {
        const names = new Set((await this.list()).map(p => p.name));
        let i = 1;
        while (names.has("Untitled-" + i))
            i += 1;
        return this.create("Untitled-" + i, "");
    }

    public async saveContent(id: string, content: string): Promise<void>
    {
        const project = await this.get(id);
        if (project === null)
            throw new Error("No such project: " + id);
        await this.put({ ...project, content, saved: Date.now() });
    }

    /** Java: Utility.usedFile, which puts the file at the top of the recent list. */
    public async usedProject(id: string): Promise<void>
    {
        const project = await this.get(id);
        if (project !== null)
            await this.put({ ...project, lastOpened: Date.now() });
    }

    public async delete(id: string): Promise<void>
    {
        await this.request("readwrite", s => s.delete(id));
    }

    public close(): void
    {
        this.db.close();
    }

    private async put(project: ProjectRecord): Promise<void>
    {
        await this.request("readwrite", s => s.put(project));
    }

    private request<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest): Promise<T>
    {
        return new Promise((resolve, reject) =>
        {
            const transaction = this.db.transaction(STORE, mode);
            const request = make(transaction.objectStore(STORE));
            transaction.oncomplete = () => resolve(request.result as T);
            transaction.onerror = () => reject(transaction.error ?? new Error("Project storage failed"));
        });
    }
}
