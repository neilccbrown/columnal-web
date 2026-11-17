// The View menu's Task Manager (Java: TaskManagerWindow, untested in Java): the engine's tasks, refreshed
// while it shows (docs/gui-spec/projects.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";
import { clickMenu } from "../fixtures/app.js";
import { closeStarted, start } from "../transformations/fixtures.js";

afterEach(closeStarted);

const rows = (): string[][] => [...document.querySelectorAll(".task-list tbody tr")].map(r => [...r.querySelectorAll("td")].map(c => c.textContent.trim()));

test("the Task Manager lists the engine's tasks, with their priorities, refreshed while it shows; it isn't modal, and OK closes it", async () =>
{
    await start();
    // (A task that waits, so that it is listed; the engine's own have all run)
    const task = (): void => {};
    Workers.onWorkerThread("Test task", Workers.Priority.FETCH, task, 600_000);
    try
    {
        await clickMenu("id-menu-view", "id-menu-view-tasks");
        await vi.waitUntil(() => rows().length > 0 && rows()[0]!.length === 2, { timeout: 5000 });
        expect([...document.querySelectorAll(".task-list th")].map(h => h.textContent.trim())).toEqual(["Task Name", "Priority"]);
        expect(rows()).toEqual([["Test task", "FETCH"]]);
        expect(document.querySelector(".light-dialog-overlay")).toBeNull();
        Workers.cancel(task);
        // (Refreshed every 3 seconds)
        await vi.waitUntil(() => rows().length === 1 && rows()[0]!.length === 1, { timeout: 5000 });
        expect(rows()).toEqual([["No content in table"]]);
    }
    finally
    {
        Workers.cancel(task);
    }
    await userEvent.click(document.querySelector(".task-list")!.closest("[role=dialog]")!.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".task-list") === null);
});
