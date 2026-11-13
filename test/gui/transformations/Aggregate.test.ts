// Aggregate (docs/gui-spec/transformations.md), beyond the port of TestColumnRecipes: a new Aggregate's
// column dialog (its split to the side, its recipe buttons and their column dialog), cancelling it,
// editing the split from the hat, and adding and editing columns from the table.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeState } from "../../../src/engine/expressions/transformations/expression/TypeState.js";
import { IdentExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { sleep } from "../base/util.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { at, centre, closeStarted, columnHeader, columnId, hatPart, pickAt, settled, start, table, tableId } from "./fixtures.js";

afterEach(closeStarted);

const save = (e: Expression): string => e.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
const aggregates = (a: RenderedApp): Aggregate[] => engineHost(a).tableManager.getAllTables().filter((t): t is Aggregate => t instanceof Aggregate);
const columns = (agg: Aggregate): [string, string][] => agg.getColumnExpressions().map(p => [p.getFirst().getRaw(), save(p.getSecond())]);
const editorText = (): string => document.querySelector(".edit-column-expression-content .cm-content")?.textContent ?? "";

// The new-table dialog's Transform, Aggregate, of T
async function newAggregate(a: RenderedApp): Promise<void>
{
    a.mainWindow()!.grid()!.grid._test_keyboardMoveTo(new CellPosition(CellPosition.row(8), CellPosition.col(1)));
    await sleep(300);
    await userEvent.keyboard("{Enter}");
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-aggregate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true, { timeout: 5000 });
    await write("T");
    await push("Enter");
    await vi.waitUntil(() => document.querySelector(".split-by-pane") !== null, { timeout: 5000 });
    await vi.waitUntil(() => document.activeElement?.closest(".column-name-text-field") !== null);
}

describe("A new Aggregate", () =>
{
    test("its column dialog has the split to the side and the recipes; Count makes the group count", async () =>
    {
        const a = await start();
        await newAggregate(a);
        expect(document.querySelector(".edit-column-top-message")?.textContent.trim()).toBe("Expression to calculate:");
        expect(document.querySelector<HTMLInputElement>(".split-by-whole-table")!.checked).toBe(true);
        expect(getComputedStyle(document.querySelector(".split-list")!).visibility).toBe("hidden");
        expect([...document.querySelectorAll(".recipe-button")].map(b => b.textContent.trim())).toEqual(["Count", "Sum…", "Lowest…", "Highest…"]);
        await write("N");
        await userEvent.click([...document.querySelectorAll<HTMLElement>(".recipe-button")].find(b => b.textContent.trim() === "Count")!);
        await vi.waitUntil(() => editorText().includes("group count"));
        // (Hidden while the expression isn't empty)
        await vi.waitUntil(() => getComputedStyle(document.querySelector(".recipe-bar")!).visibility === "hidden");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        const agg = await vi.waitUntil(() => aggregates(a).find(agg => agg.getColumnExpressions().length === 1), { timeout: 5000 });
        expect(columns(agg)).toEqual([["N", "var\\\\group count"]]);
        expect(agg.getSplitBy()).toEqual([]);
        // (Renamed to its suggested name)
        expect(agg.getId().getRaw()).toBe(Aggregate.suggestedName([], agg.getColumnExpressions()).getRaw());
    });

    test("cancelled, it's removed", async () =>
    {
        const a = await start();
        await newAggregate(a);
        expect(aggregates(a).length).toBe(1);
        await userEvent.click(document.querySelector(".cancel-button")!);
        await vi.waitUntil(() => aggregates(a).length === 0, { timeout: 5000 });
    });

    test("split by each value of a column, typed or clicked in the grid", async () =>
    {
        const a = await start();
        await newAggregate(a);
        await write("N");
        await userEvent.click(document.querySelector(".split-by-columns")!);
        // (One to edit, focused)
        const fields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".split-by-column-field input, input.split-by-column-field")];
        await vi.waitUntil(() => fields().length === 1 && document.activeElement === fields()[0]);
        expect(getComputedStyle(document.querySelector(".split-list")!).visibility).toBe("visible");
        // Clicked in the grid, into the field being edited:
        await pickAt(columnHeader("T", "B"));
        await vi.waitUntil(() => fields()[0]?.value === "B");
        await userEvent.click(document.querySelector(".recipe-button")!);
        await vi.waitUntil(() => editorText().includes("group count"));
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        const agg = await vi.waitUntil(() => aggregates(a).find(agg => agg.getColumnExpressions().length === 1), { timeout: 5000 });
        expect(agg.getSplitBy().map(c => c.getRaw())).toEqual(["B"]);
        expect(agg.getId().getRaw()).toBe(Aggregate.suggestedName(agg.getSplitBy(), agg.getColumnExpressions()).getRaw());
    });

    test("Sum asks for a number column; Lowest for the column to compare, copied as the result's, which can differ", async () =>
    {
        const a = await start();
        await newAggregate(a);
        await write("S");
        const recipe = (title: string): HTMLElement => [...document.querySelectorAll<HTMLElement>(".recipe-button")].find(b => b.textContent.trim() === title)!;
        const selectFields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".select-column-field")];
        const completions = (): string[] => [...document.querySelectorAll(".autocomplete .completion-cell-text")].map(e => e.textContent.trim());

        await userEvent.click(recipe("Sum…"));
        await vi.waitUntil(() => selectFields().length === 1 && document.activeElement === selectFields()[0]);
        // (Only the number column)
        await write("");
        await vi.waitUntil(() => completions().length > 0);
        expect(completions()).toEqual(["A"]);
        // A column clicked in the grid goes into it:
        await pickAt(columnHeader("T", "A"));
        await vi.waitUntil(() => selectFields()[0]?.value === "A");
        await moveAndDismissPopupsAtPos(centre(".select-column-dialog"));
        await userEvent.click(document.querySelector(".select-column-dialog")!.closest(".light-dialog")!.querySelector(".ok-button")!);
        await vi.waitUntil(() => editorText() === "sum(A)");

        // Lowest: its result column is copied from the compared one
        await userEvent.click(document.querySelector(".edit-column-expression-content .cm-content")!);
        await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}{Backspace}");
        await vi.waitUntil(() => getComputedStyle(document.querySelector(".recipe-bar")!).visibility === "visible");
        await userEvent.click(recipe("Lowest…"));
        await vi.waitUntil(() => selectFields().length === 2 && document.activeElement === selectFields()[0]);
        await write("A");
        // (Choosing the completion)
        await vi.waitUntil(() => completions().length > 0);
        await push("ArrowDown");
        await push("Enter");
        await vi.waitUntil(() => selectFields()[1]?.value === "A" && document.activeElement === selectFields()[1]);
        await write("B");
        await moveAndDismissPopupsAtPos(centre(".select-column-dialog"));
        await userEvent.click(document.querySelector(".select-column-dialog")!.closest(".light-dialog")!.querySelector(".ok-button")!);
        await vi.waitUntil(() => editorText().startsWith("element("));
        expect(editorText()).toBe("element(B, minimum index(A))");
    });
});

describe("An Aggregate's split and columns", () =>
{
    const withAggregate = (): Promise<RenderedApp> => start(mgr => mgr.record(new Aggregate(mgr, at("G", 1, 10), tableId("T"), [new Pair(columnId("N"), IdentExpression.load(TypeState.GROUP_COUNT))], [])));

    test("the hat's split edits it, renaming the Aggregate if its name was automatic", async () =>
    {
        const a = await withAggregate();
        await userEvent.click(await vi.waitUntil(() => hatPart("G", " across whole table")));
        await vi.waitUntil(() => document.querySelector(".split-by-dialog") !== null, { timeout: 5000 });
        await userEvent.click(document.querySelector(".split-by-columns")!);
        await vi.waitUntil(() => document.activeElement?.closest(".split-by-dialog") !== null && document.activeElement?.tagName === "INPUT");
        await write("B");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<Aggregate>(a, "G").getSplitBy().map(c => c.getRaw()).join() === "B", { timeout: 5000 });
        // ("G" isn't an automatic name)
        expect(table<Aggregate>(a, "G").getId().getRaw()).toBe("G");
    });

    test("a column's header edits it, with the split; the column menu adds one at the end", async () =>
    {
        const a = await withAggregate();
        await settled(a);
        await userEvent.click(await vi.waitUntil(() => [...document.querySelectorAll<HTMLElement>('[data-table="G"] .column-name')].find(e => e.textContent.trim() === "N")));
        await vi.waitUntil(() => editorText() === "group count", { timeout: 5000 });
        expect(document.querySelector<HTMLInputElement>(".column-name-text-field input, input.column-name-text-field")?.value).toBe("N");
        expect(document.querySelector<HTMLInputElement>(".split-by-whole-table")!.checked).toBe(true);
        await userEvent.click(document.querySelector(".split-by-columns")!);
        await vi.waitUntil(() => document.activeElement?.closest(".split-by-pane") !== null && document.activeElement?.tagName === "INPUT");
        await write("B");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<Aggregate>(a, "G").getSplitBy().length === 1, { timeout: 5000 });
        expect(columns(table<Aggregate>(a, "G"))).toEqual([["N", "var\\\\group count"]]);

        await settled(a);
        await userEvent.click([...document.querySelectorAll<HTMLElement>('[data-table="G"] .column-name')].find(e => e.textContent.trim() === "N")!, { button: "right" });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-column-addBefore")));
        await vi.waitUntil(() => document.querySelector(".split-by-pane") !== null, { timeout: 5000 });
        // (The split as it is)
        expect([...document.querySelectorAll<HTMLInputElement>(".split-by-pane input[type=text], .split-by-pane input:not([type])")].map(i => i.value)).toEqual(["B"]);
        await vi.waitUntil(() => document.activeElement?.closest(".column-name-text-field") !== null);
        await write("M");
        await userEvent.click(document.querySelector(".recipe-button")!);
        await vi.waitUntil(() => editorText() === "group count");
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<Aggregate>(a, "G").getColumnExpressions().length === 2, { timeout: 5000 });
        expect(columns(table<Aggregate>(a, "G")).map(c => c[0])).toEqual(["N", "M"]);
    });
});
