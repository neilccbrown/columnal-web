import { afterEach, describe, expect, test } from "vitest";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";

describe("Workers", () =>
{
    afterEach(() => Workers._test_yield());

    test("runs tasks in priority order, then in the order queued", async () =>
    {
        const ran: string[] = [];
        Workers.onWorkerThread("a", Workers.Priority.FETCH, () => ran.push("fetch1"));
        Workers.onWorkerThread("b", Workers.Priority.LOAD_FROM_DISK, () => ran.push("load"));
        Workers.onWorkerThread("c", Workers.Priority.FETCH, () => ran.push("fetch2"));
        Workers.onWorkerThread("d", Workers.Priority.SAVE, () => ran.push("save"));
        await Workers._test_yieldAsync();
        expect(ran).toEqual(["save", "load", "fetch1", "fetch2"]);
    });

    test("runs asynchronously, one task at a time, reporting the current task", async () =>
    {
        const ran: string[] = [];
        Workers.onWorkerThread("first", Workers.Priority.FETCH, () =>
        {
            ran.push(Workers._test_getCurrentTaskName() + ":" + Workers._test_isOnWorkerThread());
        });
        expect(ran).toEqual([]); // Not run synchronously
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(ran).toEqual(["first:true"]);
        expect(Workers._test_isOnWorkerThread()).toBe(false);
        expect(Workers._test_getCurrentTaskName()).toBe("<NONE>");
    });

    test("delays and cancellation", async () =>
    {
        const ran: string[] = [];
        const delayed = () => ran.push("delayed");
        Workers.onWorkerThread("delayed", Workers.Priority.SAVE, delayed, 30);
        Workers.onWorkerThread("now", Workers.Priority.FETCH, () => ran.push("now"));
        await new Promise(resolve => setTimeout(resolve, 10));
        // As in Java, the queue waits for its highest priority task to be ready, even though a
        // lower priority task is ready now:
        expect(ran).toEqual([]);
        Workers.cancel(delayed);
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(ran).toEqual(["now"]);
    });

    test("an exception in one task does not stop the others", async () =>
    {
        const ran: string[] = [];
        const originalError = console.error;
        console.error = () => {};
        try
        {
            Workers.onWorkerThread("fails", Workers.Priority.FETCH, () => { throw new Error("boom"); });
            Workers.onWorkerThread("works", Workers.Priority.FETCH, () => ran.push("works"));
            await Workers._test_yieldAsync();
        }
        finally
        {
            console.error = originalError;
        }
        expect(ran).toEqual(["works"]);
    });
});
