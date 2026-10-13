// Port of xyz.columnal.utility.Workers (utility module).
//
// PORT-NOTE: Java runs work on a dedicated "Workers Thread" that waits on a priority queue.
// JavaScript is single-threaded, so here the queue is drained by timer callbacks, one task
// per callback, so that the UI can update between tasks.  Tasks still run one at a time in
// priority order, then ready-time order; tasks with equal priority and ready time run in the
// order they were queued (Java's PriorityQueue does not guarantee any order for those).
import { Log } from "../log/Log.js";

/**
 * Created by neil on 23/10/2016.
 */
export class Workers
{
    private static readonly currentlyRunning: Workers.WorkChunk[] = [];

    // Kept sorted: by priority, then timeReady, then sequence number.
    private static readonly workQueue: Workers.WorkChunk[] = [];
    private static nextSequence = 0;
    private static finished = 0;
    private static lastQueueUpdate = Date.now();
    private static timer: ReturnType<typeof setTimeout> | null = null;
    private static timerDue = 0;

    public static onWorkerThread(title: string, priority: Workers.Priority, runnable: Workers.Worker | (() => void), delay: number = 0): void
    {
        // We ask for current time.  If we just used 0, then all immediates
        // would queue-jump all timed ones.  Giving new immediates a larger
        // ready time than old delayed ones makes sure the delayed ones aren't starved.
        const chunk = new Workers.WorkChunk(title, priority, runnable, Date.now() + delay, Log.getTotalStack(), Workers.nextSequence++);
        const index = Workers.workQueue.findIndex(c => Workers.WorkChunk.compare(chunk, c) < 0);
        if (index === -1)
            Workers.workQueue.push(chunk);
        else
            Workers.workQueue.splice(index, 0, chunk);
        // TODO this isn't right if we actually use the delay feature:
        if (typeof runnable === "object")
            runnable.addedToQueue?.(Workers.finished, Workers.finished + Workers.workQueue.length);
        Workers.schedule();
    }

    public static cancel(worker: Workers.Worker | (() => void)): void
    {
        const index = Workers.workQueue.findIndex(c => c.work === worker);
        if (index !== -1)
            Workers.workQueue.splice(index, 1);
    }

    // Arranges for the next task to run when it is ready.
    private static schedule(): void
    {
        const next = Workers.workQueue[0];
        if (next === undefined)
            return;
        const due = Math.max(next.timeReady, Date.now());
        if (Workers.timer !== null)
        {
            if (Workers.timerDue <= due)
                return; // Already scheduled soon enough
            clearTimeout(Workers.timer);
        }
        Workers.timerDue = due;
        Workers.timer = setTimeout(() =>
        {
            Workers.timer = null;
            Workers.runNextIfReady();
            Workers.schedule();
        }, due - Date.now());
    }

    private static runNextIfReady(): void
    {
        const work = Workers.workQueue[0];
        if (work === undefined)
            return;
        const now = Date.now();
        if (now > Workers.lastQueueUpdate + 1000)
        {
            for (const w of Workers.workQueue)
            {
                if (typeof w.work === "object")
                    w.work.queueMoved?.(Workers.finished, Workers.finished + Workers.workQueue.length);
            }
            Workers.lastQueueUpdate = now;
        }
        if (now < work.timeReady)
            return;
        Workers.workQueue.shift();
        Workers.run(work);
        Workers.finished += 1;
    }

    private static run(work: Workers.WorkChunk): void
    {
        Workers.currentlyRunning.push(work);
        try
        {
            Log.storeThreadedCaller(work.caller);
            if (typeof work.work === "function")
                work.work();
            else
                work.work.run();
            Log.storeThreadedCaller(null);
        }
        catch (t)
        {
            console.error(t);
        }
        finally
        {
            Workers.currentlyRunning.pop();
        }
    }

    public static getTaskList(): Workers.WorkInfo[]
    {
        return [...Workers.currentlyRunning, ...Workers.workQueue].map(c => new Workers.WorkInfo(c));
    }

    public static _test_getCurrentTaskName(): string
    {
        const current = Workers.currentlyRunning.at(-1);
        return current !== undefined ? current.title : "<NONE>";
    }

    public static _test_isOnWorkerThread(): boolean
    {
        return Workers.currentlyRunning.length > 0;
    }

    /**
     * Runs work until the work queue is empty.
     * PORT-NOTE: Java waits for delayed tasks to become ready; this cannot block, so it runs
     * delayed tasks immediately (in queue order).  Use _test_yieldAsync to respect delays.
     */
    public static _test_yield(): void
    {
        let next: Workers.WorkChunk | undefined;
        while ((next = Workers.workQueue.shift()) !== undefined)
        {
            Workers.run(next);
            Workers.finished += 1;
        }
    }

    /** Runs work until the work queue is empty, waiting for delayed tasks to become ready. */
    public static async _test_yieldAsync(): Promise<void>
    {
        while (Workers.workQueue.length > 0)
        {
            const wait = Workers.workQueue[0]!.timeReady - Date.now();
            if (wait > 0)
                await new Promise(resolve => setTimeout(resolve, wait));
            Workers.runNextIfReady();
        }
    }
}

export namespace Workers
{
    /**
     * Task priorities.  Tasks are executed in priority order (earliest is highest priority).
     * It is useful that saves "jump the queue" ahead of loads,
     * in the case that the user has a lot of loading going on,
     * but wants to save the document.  There used to be
     * two save priorities: save-entry and save-to-disk,
     * with the latter being higher.  But this meant that
     * when you edited a column value followed by an auto-save,
     * the save could jump the queue ahead of saving the value,
     * which ruins the whole system.
     */
    export enum Priority
    {
        // Highest to lowest:
        SAVE, LOAD_FROM_DISK, FETCH
    }

    /** Java: a functional interface (so a plain function can be passed instead) with optional progress callbacks. */
    export interface Worker
    {
        run(): void;

        // Optional methods to get updates on your place in the queue:
        // addedToQueue is guaranteed to be called and return
        // before queueMoved is called.
        queueMoved?(finished: number, lastQueued: number): void;

        addedToQueue?(finished: number, us: number): void;
    }

    export class WorkChunk
    {
        public constructor(
            public readonly title: string,
            public readonly priority: Priority,
            public readonly work: Worker | (() => void),
            public readonly timeReady: number,
            public readonly caller: readonly Error[],
            public readonly sequence: number)
        {
        }

        public static compare(a: WorkChunk, b: WorkChunk): number
        {
            return (a.priority - b.priority) || (a.timeReady - b.timeReady) || (a.sequence - b.sequence);
        }
    }

    // The publicly viewable details by the user
    export class WorkInfo
    {
        public readonly taskName: string;
        public readonly priority: Priority;
        // Both a point in time using Date.now():
        public readonly startedTime: number | null;
        public readonly queuedTime: number;

        public constructor(chunk: WorkChunk)
        {
            this.taskName = chunk.title;
            this.priority = chunk.priority;
            this.queuedTime = chunk.timeReady;
            this.startedTime = null;
        }
    }
}
