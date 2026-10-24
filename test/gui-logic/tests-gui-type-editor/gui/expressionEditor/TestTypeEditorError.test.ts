// The errors from TestTypeEditorError (tests-gui-type-editor), checked against the type lexer: the
// test types each type into the type editor of a new data table's column (which requires a concrete
// type, and doesn't allow it to be empty), and checks the errors shown.
import { describe, test } from "vitest";
import { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import { TypeLexer } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import { TFunctionUtil } from "../../../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { checkErrors, e, type ExpectedError } from "../../../lex-editor/EditorTestUtil.js";

function testError(expression: string, ...errors: ExpectedError[]): void
{
    const typeManager = TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager();
    checkErrors(new TypeLexer(typeManager, true, false), expression, ...errors);
}

describe("TestTypeEditorError", () =>
{
    test("testFine1", () => testError("Text"));
    test("testFine2", () => testError(TypeManager.MAYBE_NAME + "(Text)"));
    test("testFine3", () => testError("[" + TypeManager.MAYBE_NAME + "(Number{m})]"));
    test("testExtraOp", () => testError("Text,", e(5, 5, "missing")));
    test("testInvalidChar", () => testError("Text#", e(4, 4, "missing", "operator"), e(4, 5, "not allowed")));
    test("testInvalidBracket1", () => testError("Number()", e(6, 6, "missing"), e(7, 7, "empty")));
    test("testInvalidEmptyBracket", () => testError("()", e(1, 1, "empty")));
    test("testUnclosedRound", () => testError("(", e(1, 1, "missing")));
    test("testUnclosedCurly", () => testError("Number{", e(6, 7, "missing")));
    test("testEmptyUnit", () => testError("Number{}", e(7, 7, "missing")));
    test("testOnlyUnit", () => testError("{m}", e(0, 3, "unit")));
    test("testUnknownUnit", () => testError("Number{zzz}", e(7, 10, "unknown")));
    test("testUnknownUnit2", () => testError("(a:Number{zzz}, b:Text)", e(10, 13, "unknown")));
    test("testUnitInvalidOp", () => testError("Number{m**m}", e(9, 9, "missing")));
    test("testUnitInvalidOp2", () => testError("Number{m^m}", e(7, 10, "raise")));
    test("testUnknown0", () => testError("NumbeX", e(0, 6, "unknown")));
    test("testUnknown1", () => testError("NumberX", e(0, 7, "unknown")));
    test("testUnknown2", () => testError("Number X", e(0, 8, "unknown")));
    test("testRecord", () => testError("(a: Text, b: Number)"));
    test("testRecord2", () => testError("(Number: Text, Text: Number, Boolean: [Date], DateYM : Boolean)"));
    test("testBadTuple1", () => testError("Text,Number", e(0, 11, "bracket")));
    test("testBadTuple2", () => testError("[Text,Number]", e(1, 12, "invalid")));
});
