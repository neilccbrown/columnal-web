// The logic of AutoComplete (dialogs-non-expression), as the table picker and the column dialog's name
// field use it: the completions sorted by their text, the keys which move the selection, and choosing.
import { describe, expect, test } from "vitest";
import { AutoComplete } from "../../../src/gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";

const NAMES = ["Table B", "Table A", "Other", "Tab"];

function model(chosen: string[]): AutoComplete.Model<AutoComplete.SimpleCompletion>
{
    return new AutoComplete.Model({
        calculateCompletions: s => NAMES.filter(n => n.includes(s)).map(n => new AutoComplete.SimpleCompletion(n, null)),
    }, {
        doubleClick: (_text, item) =>
        {
            chosen.push("double " + item._test_getContent());
            return item._test_getContent();
        },
        keyboardSelect: (before, after, item, wasTab) =>
        {
            chosen.push((wasTab ? "tab " : "enter ") + (item?._test_getContent() ?? before + after));
            return item?._test_getContent() ?? null;
        },
    }, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM);
}

describe("AutoComplete", () =>
{
    test("completions are sorted by their text, with none selected", () =>
    {
        const m = model([]);
        expect(m.updateCompletions(AutoComplete.Model.completionText("  Tab ")).map(c => c._test_getContent())).toEqual(["Tab", "Table A", "Table B"]);
        expect(m.getSelectedItem()).toBeNull();
    });

    test("Up, Down, Page Up and Page Down", () =>
    {
        const m = model([]);
        m.updateCompletions("");
        expect(m.keyPressed("ArrowDown", "", 0)).toEqual({ consumed: true, newText: null, hide: false });
        expect(m.getSelectedIndex()).toBe(0);
        m.keyPressed("ArrowDown", "", 0);
        m.keyPressed("ArrowDown", "", 0);
        m.keyPressed("ArrowDown", "", 0);
        m.keyPressed("ArrowDown", "", 0);
        // (Stays at the last)
        expect(m.getSelectedIndex()).toBe(3);
        m.keyPressed("ArrowUp", "", 0);
        expect(m.getSelectedIndex()).toBe(2);
        m.keyPressed("PageUp", "", 0);
        expect(m.getSelectedIndex()).toBe(0);
        // Up from the first clears the selection:
        m.keyPressed("ArrowUp", "", 0);
        expect(m.getSelectedIndex()).toBe(-1);
        m.keyPressed("PageDown", "", 0);
        expect(m.getSelectedIndex()).toBe(3);
        expect(m.keyPressed("a", "", 0).consumed).toBe(false);
        expect(m.keyPressed("Escape", "", 0)).toEqual({ consumed: false, newText: null, hide: true });
    });

    test("Enter and Tab choose, with or without a selection; so does a double click", () =>
    {
        const chosen: string[] = [];
        const m = model(chosen);
        m.updateCompletions("Ot");
        expect(m.keyPressed("Enter", "Othe", 2)).toEqual({ consumed: true, newText: null, hide: true });
        m.keyPressed("ArrowDown", "Ot", 2);
        expect(m.keyPressed("Tab", "Ot", 2)).toEqual({ consumed: true, newText: "Other", hide: true });
        m.select(0);
        expect(m.doubleClick("Ot")).toBe("Other");
        expect(chosen).toEqual(["enter Othe", "tab Other", "double Other"]);
    });
});
