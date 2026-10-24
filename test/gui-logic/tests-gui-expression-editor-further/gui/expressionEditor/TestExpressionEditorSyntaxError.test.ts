// The errors from TestExpressionEditorSyntaxError (tests-gui-expression-editor-further), checked
// against the expression lexer.  The GUI test also checks when the error underline and popup show,
// which is left to the GUI tests (Phase 7).
import { describe, test } from "vitest";
import { e } from "../../../lex-editor/EditorTestUtil.js";
import { testExpressionError as testError } from "../../../lex-editor/ExpressionEditorTestUtil.js";

describe("TestExpressionEditorSyntaxError", () =>
{
    // Check basic:
    test("test1", () => testError("1"));
    // Check basic:
    test("test1b", () => testError("1+", e(2, 2, 4, 5, "missing")));
    test("test2", () => testError("foo", e(0, 3, 0, 3, "unknown")));
    test("test2A", () => testError("foo+1", e(0, 3, "unknown")));
    test("test2B", () => testError("foo+", e(4, 4, 6, 7, "missing")));
    // Error once we leave the slot:
    // (and error in the blank operand skipped)
    test("test2C", () => testError("1+/3", e(2, 2, 4, 5, "missing")));
    // Error once we leave the slot:
    test("test2D", () => testError("foo*1", e(0, 3, "unknown")));
    test("test3", () => testError("@iftrue@then3@else5", e(19, 19, 24, 25, "endif")));
    // Display part will be (backslash for newline: "@if %\    @then %\    @else 0\@endif"
    test("test3A", () => testError("@if%@then%@else0@endif", e(3, 4, 4, 5, "%"), e(9, 10, 14, 15, "%")));
    // Type error
    test("test3B", () => testError("@if3@then4@else5@endif", e(3, 4, 4, 5, "boolean")));
    test("testEmptyBracket", () => testError("()", e(1, 1, "missing", ")")));
    test("testEmptyUnit", () => testError("1{}", e(2, 2, "missing")));
    test("testUnknownUnit1", () => testError("1{zzz}", e(2, 5, "unknown")));
    test("testUnknownUnit2", () => testError("1{(m/zzz)}", e(5, 8, "unknown")));
    test("testUnknownUnit3", () => testError("type{Optional({zzz})}", e(15, 18, "unknown")));
    test("testUnknownType1", () => testError("type{zzz}", e(5, 8, "unknown")));
    test("testUnknownType2", () => testError("type{Optional(zzz)}", e(14, 17, "unknown")));
    test("testBlankNestedLiteral", () => testError("from text to(type{},Initial release date)", e(18, 18, 18, 19, "empty")));
    test("testUnclosedUnitBracket", () => testError("1{(}", e(3, 3, "missing", ")", "end")));
    test("testEmptyIf", () => testError("@iftrue@then@else1@endif",
        e(12, 12, 17, 18, "missing", "@else")));
    test("testEmptyIf2", () => testError("@iftrue@then@else@endif",
        e(12, 12, 17, 18, "missing", "@else"),
        e(17, 17, 27, 28, "missing", "@endif")));
    test("testPartialIf", () => testError("@if(true>false)",
        e(15, 15, 18, 19, "missing", "@then")));
    test("testPartialIf2", () => testError("@if(ACC1>ACC1)",
        e(14, 14, 17, 18, "missing", "@then")));
    test("testMissingOperator1", () => testError("1ACC1",
        e(1, 1, "missing operator")));
    test("testMissingOperator2", () => testError("@iftrue@then0@else1@endif@iftrue@then0@else1@endif",
        e(25, 25, 36, 37, "missing operator")));
    test("testMissingOperator3", () => testError("ACC1[1]",
        e(4, 4, "missing operator")));
    test("testMissingOperator3b", () => testError("ACC1[1]+ACC1[2]",
        e(4, 4, 4, 5, "missing operator"), e(12, 12, 15, 16, "missing operator")));
    // Should disappear when OK pressed, and not leave a runtime error (the latter is for the GUI tests):
    test("testSpaceAfterIdent1", () => testError("ACC1 "));
    test("testEmptyTypeLiteral", () => testError("\u0000type{", e(5, 5, 5, 6, "empty")));
    test("testEmptyUnitLiteral", () => testError("\u0000type{Number{", e(12, 12, 12, 13, "")));
    test("testInvalidUnitLiteral", () => testError("convert unit({m/s},100{yard}/2{s})",
        e(13, 14, "{"),
        e(17, 18, 20, 22, "}"),
        e(14, 14, 14, 15, "op"),
        e(17, 17, 20, 21, "op")));
    // @Ignore in Java: "Not sure we can check body without checking condition successfully."
    test.skip("testUnknownIdents", () => testError("@ifopt=~Is(x)@thenx@elsesubstitution@endif",
        e(3, 6, 4, 7, "unknown"),
        e(24, 36, 31, 43, "unknown")));
});
