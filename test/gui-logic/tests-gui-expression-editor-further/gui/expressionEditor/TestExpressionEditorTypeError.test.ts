// The errors from TestExpressionEditorTypeError (tests-gui-expression-editor-further), checked
// against the expression lexer, as ExpressionEditorSyntaxError.test.ts does.
import { describe, test } from "vitest";
import { e } from "../../../lex-editor/EditorTestUtil.js";
import { testExpressionError as testError } from "../../../lex-editor/ExpressionEditorTestUtil.js";

describe("TestExpressionEditorTypeError", () =>
{
    // Should be no error:
    test("testEmptyList", () => testError("[]", e(0, 2, "ambig")));
    // Should be no error:
    test("testLengthEmptyList", () => testError("list length([])"));
    test("testTypeError1", () => testError("2+true", e(2, 6, 4, 8, "number")));
    test("testTypeError1b", () => testError("2+true+3", e(2, 6, 4, 8, "number")));
    test("testTypeError2", () => testError("[2,true]", e(0, 8, 0, 9, "type")));
    test("testTypeError3", () => testError("@if0@then1@else2@endif", e(3, 4, 4, 5, "boolean")));
    test("testTypeErrorThenElse", () => testError("@iftrue@then100{m}@else13@endif", e(23, 25, 32, 34, "mismatch")));
    test("testFunctionError1", () => testError("element([1],false)", e(12, 17, 13, 18, "type")));
    test("testFunctionError2", () => testError("date from ymd(2016{year},1,1{day})", e(25, 26, 26, 27, "type")));
    test("testFunctionError3", () => testError("element(false)", e(0, 14, "parameters")));
    test("testFunctionError3b", () => testError("element()", e(0, 9, "parameters")));
    test("testFunctionError3c", () => testError("element(false,false,false)", e(0, 26, 0, 28, "parameters")));
    test("testUnitError1", () => testError("2{s}+3{m}", e(5, 9, 7, 11, "number")));
    test("testUnitError1b", () => testError("2{s}+3{m}+4{s}", e(5, 9, 7, 11, "number")));
    test("testAmbiguousTypeError1", () => testError("from text(\"\")", e(0, 13, "type")));
    test("testAmbiguousTypeError1b", () => testError("[from text(\"\")]", e(0, 15, "type")));
    test("testAmbiguousTypeError1c", () => testError("@iftrue@thenfrom text(\"\")@else[]@endif", e(0, 38, 0, 49, "type")));
    test("testAmbiguousTypeError2", () => testError("element([],1)", e(0, 13, 0, 14, "type")));
    test("testVarNoError", () => testError("@ifOptional\\None=~Optional\\Is(x)@thenget single(x)@else@ifOptional\\None=~Optional\\Is(x)@thenx+1{m/s}@else0{m/s}@endif@endif"));
    test("testUnknownVar", () => testError("1+y", e(2, 3, 4, 5, "unknown")));
    test("testUnknownVar2", () => testError("1+Is(y)", e(5, 6, 7, 8, "unknown")));
});
