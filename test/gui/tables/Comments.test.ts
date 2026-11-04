// Comments on the grid (docs/gui-spec/comments.md), and a hat's source table highlighted while its
// name is hovered (docs/gui-spec/tables.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { copyToClipboard } from "../base/clipboard.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, renderApp, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const pos = (row: number, column: number): CellPosition => new CellPosition(CellPosition.row(row), CellPosition.col(column));

async function start(): Promise<RenderedApp>
{
    const a = app = await renderApp([{ name: "P", content: GRID_FIXTURE.replace("POSITION 4 1", "POSITION 4 5") }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

function grid(a: RenderedApp): VirtualGrid
{
    return a.mainWindow()!.grid()!.grid;
}

// The comments, as the engine has them (from its events)
function comments(a: RenderedApp): { getContent(): string, getPosition(): CellPosition, getBottomRight(): CellPosition }[]
{
    return a.mainWindow()!.grid()!.comments().map(c => ({ getContent: () => c.info.content, getPosition: () => c.getPosition(), getBottomRight: () => c.getBottomRight() }));
}

// The new-table dialog's Comment, at the empty cell
async function addComment(a: RenderedApp, at: CellPosition): Promise<HTMLElement>
{
    await keyboardMoveTo(grid(a), at);
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".create-table-grid-button")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-comment")));
    return vi.waitUntil(() => document.querySelector<HTMLElement>(".grid-comment"));
}

test("a comment: made from the new-table dialog, two by two, saved, selected as a whole, and deleted", async () =>
{
    const a = await start();
    const element = await addComment(a, pos(12, 2));
    expect(comments(a).map(c => [c.getPosition().toString(), c.getBottomRight().toString()])).toEqual([[pos(12, 2).toString(), pos(13, 3).toString()]]);
    const box = element.getBoundingClientRect();
    expect([box.width, box.height]).toEqual([200, 48]);
    // Saved (Java: the table manager's listener, View.modified):
    await vi.waitUntil(async () => (await a.store.get(shownProject()!))?.content.includes("COMMENT") === true);

    // Moving into it selects all of it; Enter edits it:
    await keyboardMoveTo(grid(a), pos(11, 3));
    await push("ArrowDown");
    const r = grid(a).getSelection()!.getSelectionDisplayRectangle();
    expect([r.topLeftIncl.toString(), r.bottomRightIncl.toString()]).toEqual([pos(12, 2).toString(), pos(13, 3).toString()]);
    // Leaving it downwards goes from its bottom, in the column it was entered from:
    await push("ArrowDown");
    expect(grid(a).getSelection()?.isExactly(pos(14, 3))).toBe(true);
    await push("ArrowUp");
    await push("Enter");
    await vi.waitUntil(() => document.activeElement?.closest(".grid-comment") !== null && document.activeElement?.closest(".grid-comment") !== undefined);
    await write("Hello");
    expect((document.activeElement as HTMLTextAreaElement).value).toBe("Hello");
    // Typing changes only the field until it is left; then the comment has the text, and is saved (Java
    // did neither: docs/gui-spec/comments.md):
    expect(comments(a)[0]!.getContent()).toBe("");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await vi.waitUntil(() => comments(a)[0]?.getContent() === "Hello");
    await vi.waitUntil(async () => (await a.store.get(shownProject()!))?.content.includes("Hello") === true);
    expect(element.querySelector("textarea")?.value).toBe("Hello");

    // Delete removes it, and selects the cell where it was:
    await keyboardMoveTo(grid(a), pos(12, 2));
    await push("Delete");
    await vi.waitUntil(() => document.querySelector(".grid-comment") === null);
    expect(comments(a)).toEqual([]);
    await vi.waitUntil(() => document.querySelector(".create-table-grid-button") !== null);
});

test("a comment is resized by dragging its bottom right corner; pasted into, and copied", async () =>
{
    const a = await start();
    const element = await addComment(a, pos(12, 2));
    const box = element.getBoundingClientRect();
    // From the corner, to near the corner of the cell two columns right and a row down:
    const from = { x: box.right - 3, y: box.bottom - 3 };
    const to = { x: from.x + 2 * VirtualGrid.DEFAULT_COLUMN_WIDTH, y: from.y + VirtualGrid.rowHeight };
    const init = { bubbles: true, pointerId: 1, button: 0, buttons: 1 };
    element.dispatchEvent(new PointerEvent("pointermove", { ...init, buttons: 0, clientX: from.x, clientY: from.y }));
    await vi.waitUntil(() => element.style.cursor === "se-resize");
    element.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: from.x, clientY: from.y }));
    element.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: to.x, clientY: to.y }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, clientX: to.x, clientY: to.y }));
    await vi.waitUntil(() => comments(a)[0]?.getBottomRight().equals(pos(14, 5)) === true);
    await vi.waitUntil(() => element.getBoundingClientRect().width === 400);
    // Saved (Java didn't save it until the next change):
    await vi.waitUntil(async () => (await a.store.get(shownProject()!))?.content.includes("POSITION 2 12 4 3") === true);

    // Pasting into a selected comment sets its text (Java: CommentSelection.doPaste), which shows, and
    // copying it copies the text:
    await navigator.clipboard.writeText("Pasted note");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(grid(a), pos(12, 2));
    await userEvent.keyboard(isMac() ? "{Meta>}v{/Meta}" : "{Control>}v{/Control}");
    await vi.waitUntil(() => comments(a)[0]?.getContent() === "Pasted note");
    await vi.waitUntil(() => element.querySelector("textarea")?.value === "Pasted note");
    expect(await copyToClipboard()).toBe("Pasted note");
});

test("hovering over a hat's source table highlights it, with an arrow", async () =>
{
    const a = await start();
    const hat = await vi.waitUntil(() => document.querySelector<HTMLElement>('.table-hat[data-table="C"]'));
    const source = [...hat.querySelectorAll<HTMLElement>("span")].find(s => s.textContent === "T")!;
    await userEvent.hover(source);
    const overlay = await vi.waitUntil(() => document.querySelector<HTMLElement>(".pick-table-overlay.pick-source"), { timeout: 2000 });
    const t = a.mainWindow()!.grid()!.displays().find(d => d.info.id === "T")!;
    const tableBox = document.querySelector('[data-table="T"].table')!.getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    expect([box.left, box.top]).toEqual([tableBox.left, tableBox.top]);
    expect(box.bottom).toBe(tableBox.top + (t.getBottomRightIncl().rowIndex - t.getPosition().rowIndex + 1) * VirtualGrid.rowHeight);
    expect(document.querySelector(".table-highlight-arrow.pick-source")).not.toBeNull();
    // Moving off stops it:
    await userEvent.hover(document.querySelector('[data-table="C"] .table-title')!);
    await vi.waitUntil(() => document.querySelector(".pick-table-overlay") === null);
});
