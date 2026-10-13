// Port of xyz.columnal.log.Log (utility module).
// PORT-NOTE: Java logs through log4j; here messages go to the console.  "Threads" are the
// Workers queue: storeThreadedCaller records the stack of whoever queued the running task.
import type { InternalException } from "../../utility-error/error/InternalException.js";

export class Log
{
    // This is a bit hacky for this to live in the Log class,
    // but in practical terms it's the easiest thing to do:
    private static internalExceptionHandler: (e: InternalException) => void = () => {};

    // Used to remember which task set off which runnable.
    private static threadCaller: readonly Error[] | null = null;

    // Set to true to show debug messages:
    public static debugEnabled = false;

    public static normal(message: string): void
    {
        console.info(message);
    }

    /** Java: log(String info, Throwable e) and log(Throwable e). */
    public static log(infoOrError: string | unknown, e?: unknown): void
    {
        const info = e === undefined ? "" : String(infoOrError);
        const error = e === undefined ? infoOrError : e;
        console.error(info, error);
        // The cause is printed by the console as part of the error
        const callers = Log.logCallers();
        if (callers !== "")
            console.error(callers);
        if (error instanceof Error && error.name === "InternalException")
        {
            Log.internalExceptionHandler(error as InternalException);
        }
    }

    /**
     * For the current task, store the stack (which comes from another task that
     * queued us) as extra info that will be printed if an exception is logged in this task.
     */
    public static storeThreadedCaller(stack: readonly Error[] | null): void
    {
        Log.threadCaller = stack;
    }

    // Gets the current stack trace, plus any stack trace of our caller, as recorded in storeThreadedCaller
    public static getTotalStack(): readonly Error[]
    {
        const ourStack = new Error("Stack trace");
        const prev = Log.threadCaller;
        return prev === null ? [ourStack] : [ourStack, ...prev];
    }

    public static logStackTrace(s: string): void
    {
        if (Log.debugEnabled)
            Log.debug(s + "\n" + (new Error().stack ?? "") + Log.logCallers());
    }

    public static normalStackTrace(message: string, _maxLevels: number): void
    {
        Log.normal(message + "\n" + (new Error().stack ?? "") + Log.logCallers());
    }

    private static logCallers(): string
    {
        let sb = "";
        if (Log.threadCaller !== null)
        {
            for (const throwable of Log.threadCaller)
            {
                sb += "Called from another task by:\n" + (throwable.stack ?? "") + "\n";
            }
        }
        return sb;
    }

    public static error(s: string): void
    {
        console.error(s);
    }

    // This should only be used temporarily while debugging, and should not be left in:
    public static debug(s: string): void
    {
        if (Log.debugEnabled)
            console.debug(s);
    }

    // This should only be used temporarily while debugging, and should not be left in:
    public static debugTime(s: string): void
    {
        const millis = Date.now() % 100000;
        Log.debug("#" + String(Math.floor(millis / 1000)).padStart(3, "0") + "." + String(millis % 1000).padStart(3, "0") + ": " + s);
    }

    public static debugDuration(prefix: string, runnable: () => void): void
    {
        const start = Date.now();
        runnable();
        const end = Date.now();
        Log.debug(prefix + " took " + (end - start) + " milliseconds");
    }

    /**
     * Sets a handler to be called when we log an InternalException.
     * The handler should not block.
     */
    public static setInternalExceptionHandler(internalExceptionHandler: (e: InternalException) => void): void
    {
        Log.internalExceptionHandler = internalExceptionHandler;
    }
}
