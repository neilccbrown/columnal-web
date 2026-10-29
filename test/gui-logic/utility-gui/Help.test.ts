// Help: the dialog help, as HelpBox shows it.
import { describe, expect, test } from "vitest";
import { Help } from "../../../src/gui-logic/utility-gui/utility/gui/Help.js";

describe("Help", () =>
{
    test("gives the title, short text and paragraphs", () =>
    {
        const info = Help.getHelpInfo("edit-join/tables")!;
        expect(info.title).toBe("Source tables");
        expect(info.shortText).toBe("Join transformations join two tables together.");
        expect(info.fullParas.length).toBeGreaterThan(1);
        expect(info.fullParas[0]).toMatch(/^The distinction between primary and secondary table/);
        // Spaces collapsed, and no empty paragraph after the last:
        for (const p of info.fullParas)
            expect(p).toMatch(/^\S(.*\S)?$/);
        expect(info.fullParas.some(p => p.includes("  "))).toBe(false);
    });

    test("has every help file", () =>
    {
        for (const key of ["agg-recipe", "edit-check", "edit-column", "edit-join", "edit-r", "edit-settings", "edit-unit", "guess-format", "split-by"])
            expect(() => Help.getHelpInfo(key + "/no-such-item"), key).toThrow("Can't find key no-such-item.full in help bundle " + key);
    });
});
