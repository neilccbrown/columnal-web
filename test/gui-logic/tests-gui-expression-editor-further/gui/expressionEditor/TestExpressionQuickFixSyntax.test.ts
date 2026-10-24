// TestExpressionQuickFixSyntax (tests-gui-expression-editor-further), checked against the expression
// editor's content (see testFix).
import { describe, test } from "vitest";
import { ExpressionUtil } from "../../../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { cssClassFor, testFix, testSimpleFix } from "../../../lex-editor/ExpressionEditorTestUtil.js";

describe("TestExpressionQuickFixSyntax", () =>
{
    // Test that adding two strings suggests a quick fix to switch to string concatenation
    test("testStringAdditionFix1", () => testFix("\"A\"+\"B\"", "A", "", "\"A\";\"B\""));
    test("testStringAdditionFix2", () => testFix("\"A\"+S1+\"C\"", "C", "", "\"A\" ; column\\\\S1 ; \"C\""));
    test("testUnitLiteralFix1", () => testFix("ACC1+6{1}", "6", "", "column\\\\ACC1 + 6{m/s^2}"));
    test("testUnitLiteralFix1B", () => testFix("6{1}-ACC1", "6", "", "6{m/s^2} - column\\\\ACC1"));
    test("testUnitLiteralFix2", () => testFix("ACC1>6{1}>ACC3", "6", cssClassFor("6{m/s^2}"), "column\\\\ACC1 > 6{m/s^2} > column\\\\ACC3"));
    test("testUnitLiteralFix3", () => testFix("ACC1<>103{m/s}", "103", cssClassFor("103{m/s^2}"), "column\\\\ACC1 <> 103{m/s^2}"));
    test("testUnitLiteralFix3B", () => testFix("ACC1=103{1}", "103", cssClassFor("103{m/s^2}"), "column\\\\ACC1 = 103{m/s^2}"));
    test("testUnitLiteralFix4", () => testFix("@ifACC1=ACC2=32{1}@then2@else7+6@endif", "32", cssClassFor("32{m/s^2}"), "@if (column\\\\ACC1 = column\\\\ACC2 = 32{m/s^2}) @then 2 @else (7 + 6) @endif"));
    test("testUnitLiteralFix5", () => testFix("@matchACC1@case3{1}@then5@endmatch", "3", cssClassFor("3{m/s^2}"), "@match column\\\\ACC1 @case 3{m/s^2} @then 5 @endmatch"));
    test("testUnitLiteralFix6", () => testFix("@matchACC1@case3{1}@then52@case12{1}@orcase14{1}@then63@endmatch", "3{1}", cssClassFor("3{m/s^2}"), "@match column\\\\ACC1 @case 3{m/s^2} @then 52 @case 12{1} @orcase 14{1} @then 63 @endmatch"));
    test("testUnitLiteralFix6B", () => testFix("@matchACC1@case3{1}@then52@case12{1}@orcase14{1}@then63@endmatch", "12", cssClassFor("12{m/s^2}"), "@match column\\\\ACC1 @case 3{1} @then 52 @case 12{m/s^2} @orcase 14{1} @then 63 @endmatch"));
    test("testUnitLiteralFix6C", () => testFix("@matchACC1@case3{1}@then52@case12{1}@orcase14{1}@then63@endmatch", "14", cssClassFor("14{m/s^2}"), "@match column\\\\ACC1 @case 3{1} @then 52 @case 12{1} @orcase 14{m/s^2} @then 63 @endmatch"));
    test("testUnitLiteralFix6D", () => testFix("@matchACC1@case12{1}@orcase14{1}@then63@endmatch", "14", cssClassFor("14{m/s^2}"), "@match column\\\\ACC1 @case 12{1} @orcase 14{m/s^2} @then 63 @endmatch"));
    test("testUnitLiteralFix7", () => testFix("12{metre/s}", "metre", cssClassFor("m"), "12{m/s}"));
    test("testUnitLiteralFix8", () => testFix("type{Number{metre/s}}", "metre", cssClassFor("m"), "type{Number{m/s}}"));
    test("testBracketFix1", () => testSimpleFix("1 + 2 * 3", "*", "1 + (2 * 3)"));
    test("testBracketFix1B", () => testSimpleFix("1+ 2*3", "+", "(1 + 2) * 3"));
    test("testBracketFix2", () => testSimpleFix("1 + 2 = 3", "+", "(1 + 2) = 3"));
    test("testBracketFix3", () => testSimpleFix("1 + 2 = 3 - 4", "-", "@invalidops(1, @unfinished \"+\", 2, @unfinished \"=\", (3 - 4))"));
    test("testBracketFix4", () => testSimpleFix("1 = 2 = 3 + 4 = 5 = 6", "+", "1 = 2 = (3 + 4) = 5 = 6"));
    test("testBracketFix5B", () => testSimpleFix("1 , 2", ",", "[1, 2]"));
    test("testBracketFix6", () => testFix("1 + 2 + (3 * 4 / 5) + 6", "*", cssClassFor("(3 * 4) / 5"), "1 + 2 + ((3 * 4) / 5) + 6"));
    test("testBracketFix6B", () => testFix("1 + 2 + (3 * 4 / 5) + 6", "*", cssClassFor("3 * (4 / 5)"), "1 + 2 + (3 * (4 / 5)) + 6"));
    // Test that inner square brackets are preserved:
    test("testBracketFix7", () => testFix("1 + 2 + [3 * 4 / 5] + 6", "*", cssClassFor("3 * (4 / 5)"), "1 + 2 + [3 * (4 / 5)] + 6"));
    // Test minuses:
    test("testBracketFix8", () => testFix("@if true @then abs(-5 - -6 * -7) @else 8 @endif", "*", cssClassFor("-5 - (-6 * -7)"), "@if true @then @call function\\\\number\\abs(-5 - (-6 * -7)) @else 8 @endif"));
    // @Ignore in Java: "Not sure this is a fix worth suggesting when there is only one argument"
    // If a function takes a list, and the user passes either one item (which is not of list type)
    // or a tuple, offer to switch to list brackets:
    test.skip("testListBracketFix1", () => testFix("sum(2)", "2", "", "@call function\\\\sum([2])"));
    // If a function takes a list, and the user passes either one item (which is not of list type)
    // or a tuple, offer to switch to list brackets:
    test("testListBracketFix2", () => testFix("sum(2, 3, 4)", "2", cssClassFor("@call function\\\\number\\sum([2, 3, 4])"), "@call function\\\\number\\sum([2, 3, 4])"));
    // @Ignore in Java: "Disabled since move to @table references"
    // If user tries to use array index syntax, offer the element function instead:
    test.skip("testListBracketFix3", () => testFix("@entire ACC1[3]+2", "1", ExpressionUtil.makeCssClass("element(@entire ACC1, 3)"), "@call function\\\\element(@entire ACC1,3)+2"));
    // @Ignore in Java: "TODO re-enable this and get it passing"
    // If a column-single-row is used where a list is expected, offer to switch to
    // a whole-column item:
    test.skip("testColumnToListFix1", () => testSimpleFix("sum(ACC1)", "ACC1", "@call function\\\\number\\sum(table\\Table1#ACC1)"));
    // @Ignore in Java: "Not sure if this fix is even worth implementing"
    // If a column-all-rows is used where a non-list is expected, offer to switch to
    // a column-single-row item:
    // Note units aren't right here, but fix should still be offered:
    test.skip("testColumnFromListFix1", () => testFix("@entire ACC1 + 6", "ACC1", cssClassFor("column\\\\ACC1"), "column\\\\ACC1 + 6"));
    test("testUnmatchedBracketFix1", () => testFix("(1+2", "", ExpressionUtil.makeCssClass(")"), "(1 + 2)"));
    test("testUnmatchedBracketFix2", () => testFix("[1+2", "", ExpressionUtil.makeCssClass("]"), "[1 + 2]"));
    test("testUnmatchedBracketFix3", () => testFix("([0];[1)", "", ExpressionUtil.makeCssClass("]"), "([0] ; [1])"));
    // @Ignore in Java: "TODO fix and re-enable"
    test.skip("testUnmatchedIfFix1", () => testFix("@iftrue@then0@else1", "", ExpressionUtil.makeCssClass("@endif"), "@if true @then 0 @else 1 @endif"));
    // @Ignore in Java: "TODO fix and re-enable"
    test.skip("testUnmatchedIfFix2", () => testFix("@iftrue", "", ExpressionUtil.makeCssClass("@then@else@endif"), "@if true @then @invalidops () @else @invalidops () @endif"));
    // @Ignore in Java: "TODO fix and re-enable"
    test.skip("testUnmatchedIfFix3", () => testFix("@iftrue@endif", "", ExpressionUtil.makeCssClass("@then@else"), "@if true @then @invalidops () @else @invalidops () @endif"));
    test("testUnmatchedIfFix4", () => testFix("@if1@else", "1", ExpressionUtil.makeCssClass("@then"), "@invalidops(@unfinished \"^aif\", 1, @unfinished \"^athen\", @invalidops (), @unfinished \"^aelse\", @invalidops ())"));
});
