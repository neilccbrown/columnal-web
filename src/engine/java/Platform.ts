// Stand-in for javafx.application.Platform, which the engine uses to hand work to the GUI thread.
//
// PORT-NOTE: JavaFX runs a runLater callback on the FX thread at some later point.  There is only
// one thread here, so the callbacks are queued and run, in order, in a later task (a zero-delay
// timer), after the current engine work has finished.  Tests can run them at once with
// _test_runPending().

const pending: (() => void)[] = [];
let scheduled = false;

export const Platform = {
    runLater(runnable: () => void): void
    {
        pending.push(runnable);
        if (!scheduled)
        {
            scheduled = true;
            setTimeout(runPending, 0);
        }
    },

    /** Runs all the queued callbacks now (including any that they queue). */
    _test_runPending(): void
    {
        runPending();
    },
};

function runPending(): void
{
    scheduled = false;
    let next: (() => void) | undefined;
    while ((next = pending.shift()) !== undefined)
    {
        try
        {
            next();
        }
        catch (e)
        {
            // As on the FX thread, an exception in one callback does not stop the others.
            console.error(e);
        }
    }
}
