// The undo of saves (app's UndoManager).
import { describe, expect, test } from "vitest";
import { UndoManager } from "../../../src/gui-logic/app/gui/UndoManager.js";

describe("UndoManager", () =>
{
    test("undoes saves, newest first, per project", () =>
    {
        const undo = new UndoManager();
        undo.backupForUndo("p", "v1", new Date(1));
        undo.backupForUndo("p", "v2", new Date(2));
        undo.backupForUndo("q", "w1", new Date(3));
        expect(undo.undo("p")).toBe("v2");
        expect(undo.undo("p")).toBe("v1");
        expect(undo.undo("p")).toBeNull();
        expect(undo.undo("q")).toBe("w1");
        expect(undo.undo("r")).toBeNull();
    });

    test("keeps one of the same content in a row, nothing empty, and at most 20", () =>
    {
        const undo = new UndoManager();
        undo.backupForUndo("p", "", new Date(0));
        undo.backupForUndo("p", "v1", new Date(1));
        undo.backupForUndo("p", "v1", new Date(2));
        undo.backupForUndo("p", "v2", new Date(3));
        expect(undo.undo("p")).toBe("v2");
        expect(undo.undo("p")).toBe("v1");
        expect(undo.undo("p")).toBeNull();
        for (let i = 0; i < 25; i++)
            undo.backupForUndo("p", "v" + i, new Date(i));
        const all: string[] = [];
        for (let u = undo.undo("p"); u !== null; u = undo.undo("p"))
            all.push(u);
        expect(all).toEqual(Array.from({ length: 20 }, (_, i) => "v" + (24 - i)));
    });
});
