// Port of xyz.columnal.gui.UndoManager (app module): the earlier saves of each project, for undo.
//
// PORT-NOTE: Java copied the file being replaced to a backup file in its undo directory (deleted on
// exit, except the newest), keeping the list of them in memory, keyed by the file; here the content
// itself is kept in memory, keyed by the project's id.  Java compared the backups by a hash of
// their content; here by the content.
export class UndoManager
{
    private static readonly MAX_DETAILS = 20;

    private readonly backups = new Map<string, UndoManager.SaveDetails[]>();

    /** Records the content being replaced by a save at saveTime (Java: the file's content). */
    public backupForUndo(key: string, content: string, saveTime: Date): void
    {
        if (content.length === 0)
            return;
        let details = this.backups.get(key);
        if (details === undefined)
        {
            details = [];
            this.backups.set(key, details);
        }
        const newSave = new UndoManager.SaveDetails(content, saveTime);
        if (details.length > 0 && details[details.length - 1]!.content === content)
        {
            details[details.length - 1] = newSave;
        }
        else
        {
            details.push(newSave);
        }
        while (details.length > UndoManager.MAX_DETAILS)
        {
            details.shift();
        }
    }

    /**
     * Undoes last change and returns the content as a String.
     */
    public undo(key: string): string | null
    {
        const details = this.backups.get(key);
        return details?.pop()?.content ?? null;
    }
}

export namespace UndoManager
{
    export class SaveDetails
    {
        public constructor(public readonly content: string, public readonly instant: Date)
        {
        }
    }
}
