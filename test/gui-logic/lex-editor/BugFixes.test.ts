// Tests for Java bugs in the editors' logic that the port fixes (each marked with a PORT-NOTE in
// the source).
import { describe, expect, test } from "vitest";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import { TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../src/engine/types/jellytype/JellyTypes.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { ExpressionLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { TypeLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { makeEditor, NO_MODIFIERS } from "./EditorHarness.js";
import { NO_INSERT } from "./EditorTestUtil.js";

describe("Java bug fixes", () =>
{
    // Java's editor UndoManager kept the undone states after a new edit (so redo brought back
    // undone text), and counted undo and redo as edits themselves.
    test("undo and redo in the editors", () =>
    {
        const ed = makeEditor("", new TypeLexer(new TypeManager(new UnitManager()), false, true));
        const undo = (): string => { ed.display.keyPressed("Z", { ...NO_MODIFIERS, shortcut: true }); return ed.content.getText(); };
        const redo = (): string => { ed.display.keyPressed("Y", { ...NO_MODIFIERS, shortcut: true }); return ed.content.getText(); };
        ed.write("Te");
        expect(ed.content.getText()).toBe("Te");
        expect(undo()).toBe("T");
        expect(redo()).toBe("Te");
        expect(undo()).toBe("T");
        ed.write("x");
        // The undone "Te" is gone:
        expect(redo()).toBe("Tx");
        expect(undo()).toBe("T");
        expect(undo()).toBe("");
        expect(undo()).toBe("");
        expect(redo()).toBe("T");
        expect(redo()).toBe("Tx");
        expect(redo()).toBe("Tx");
    });

    // Java's expression completions offered a tag name shared by two types without its type name
    // (where it is ambiguous); with three types they didn't, and with four they did again.
    test("completions of tags shared by types", () =>
    {
        for (const typeCount of [1, 2, 3, 4])
        {
            const mgr = DummyManager.make();
            const typeManager = mgr.getTypeManager();
            for (let i = 0; i < typeCount; i++)
                typeManager.registerTaggedType("T" + i, [], [new TagType<JellyType>("Shared", null), new TagType<JellyType>("Own" + i, null)]);
            const lexer = new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()), typeManager, FunctionList.getFunctionLookup(mgr.getUnitManager()), () => TFunctionUtil.createTypeState(typeManager), null);
            const completions = lexer.process("S", 1, NO_INSERT).getCompletionsFor(1).flatMap(g => g.completions.map(c => c.content));
            expect(completions.includes("Shared"), typeCount + " types").toBe(typeCount === 1);
            for (let i = 0; i < typeCount; i++)
                expect(completions, typeCount + " types").toContain("T" + i + "\\Shared");
        }
    });
});
