// A project is only written by one tab at once: the tab that has it open holds its lock (a Web Lock,
// shared by the browser's tabs) until it closes it, and another tab opening it has it for reading only.

export interface ProjectLock
{
    release(): void;
}

/** Takes the project's lock, or gives null if another tab has it. */
export function acquireProjectLock(id: string): Promise<ProjectLock | null>
{
    return new Promise(resolve =>
    {
        void navigator.locks.request("columnal-project-" + id, { ifAvailable: true }, lock =>
        {
            if (lock === null)
            {
                resolve(null);
                return;
            }
            // Held until released:
            return new Promise<void>(release => resolve({ release: () => release() }));
        });
    });
}
