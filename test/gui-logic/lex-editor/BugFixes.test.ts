// Tests for Java bugs in the editors' logic that the port fixes (each marked with a PORT-NOTE in
// the source).
import { describe, expect, test } from "vitest";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import { ExpressionVersion } from "../../../src/engine/parsers/grammar/Versions.js";
import { TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../src/engine/types/jellytype/JellyTypes.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { ExpressionLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { TopLevelEditor } from "../../../src/gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
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

    // Java recorded a function call's parameter prompt only if the call's function was known as the
    // call was built, but it is only resolved later, when the expression is checked: so there were none.
    test("a function call's parameter prompt", () =>
    {
        const mgr = DummyManager.make();
        const typeManager = mgr.getTypeManager();
        const lexer = new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()), typeManager, FunctionList.getFunctionLookup(mgr.getUnitManager()), () => TFunctionUtil.createTypeState(typeManager), null);
        const prompt = (text: string, caret: number): string | undefined =>
        {
            const ed = makeEditor(text, lexer);
            ed.content.positionCaret(caret, true);
            return ed.content.getDisplayFor(caret, null).get(TopLevelEditor.DisplayType.PROMPT)?.getFirst().toPlain();
        };
        // Between the brackets, and in each argument:
        expect(prompt("abs()", 4)).toBe("abs(original)  show doc");
        expect(prompt("abs(1)", 4)).toBe("abs(original)  show doc");
        expect(prompt("replace(\"a\",\"b\",\"c\")", 13)).toBe("replace(to replace, replacement, source)  show doc");
        // None where the target isn't a function, or past the parameters:
        expect(prompt("x()", 2)).toBeUndefined();
        expect(prompt("abs(1,2)", 6)).toBeUndefined();
    });

    // Java saved invalid types and units (as the editor makes them) in forms its loaders couldn't read:
    // an invalid type's items separated by commas (and its loader dropped them anyway), and an invalid
    // unit's items, unfinished parts, whole numbers and powers, which the unit grammar lacked.  So after
    // saving, a literal with one came back as its saved text.
    test("invalid types and units in literals survive saving and loading", () =>
    {
        const mgr = DummyManager.make();
        const typeManager = mgr.getTypeManager();
        const functionLookup = FunctionList.getFunctionLookup(mgr.getUnitManager());
        const lexer = new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()), typeManager, functionLookup, () => TFunctionUtil.createTypeState(typeManager), null);
        const save = (e: Expression): string => e.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
        for (const src of ["type{Optional(Number{m},Text)}", "type{Text,Text}", "type{(Number,}", "type{[}", "type{(a:Number,b:)}",
            "type{Number{}}", "type{Number{m s}}", "type{Number{m*(s+)}}", "type{Number{(m s)/t}}", "type{Number{m^x}}", "type{Optional(Number{m*})}",
            "unit{}", "unit{m s}", "unit{m^}", "unit{m^2.5}", "unit{\"x}", "unit{2*m}", "unit{2}", "unit{3/s}", "unit{(m*s)^2}", "unit{m^(x*y)}", "unit{m/s/t}"])
        {
            const original = lexer.process(src, 0, NO_INSERT).result;
            const saved = save(original);
            const loaded = ExpressionUtil.parse(null, saved, ExpressionVersion.latest(), typeManager, functionLookup);
            expect(loaded, src + " saved as " + saved).toEqual(original);
            expect(save(loaded)).toBe(saved);
        }
    });

    // Java saved a call with no arguments as f(), which its expression grammars (needing at least one
    // argument) couldn't load.  (The first grammar's change is for files of its version.)
    test("a call with no arguments survives saving and loading", () =>
    {
        const mgr = DummyManager.make();
        const typeManager = mgr.getTypeManager();
        const functionLookup = FunctionList.getFunctionLookup(mgr.getUnitManager());
        const lexer = new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()), typeManager, functionLookup, () => TFunctionUtil.createTypeState(typeManager), null);
        const save = (e: Expression): string => e.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
        for (const src of ["element()", "1+element()", "from text to(type{Number},element())"])
        {
            const original = lexer.process(src, 0, NO_INSERT).result;
            const saved = save(original);
            const loaded = ExpressionUtil.parse(null, saved, ExpressionVersion.latest(), typeManager, functionLookup);
            // (The editor's expression has its function resolved, which loading leaves to checking)
            expect(save(loaded), src + " saved as " + saved).toBe(saved);
        }
    });
});
