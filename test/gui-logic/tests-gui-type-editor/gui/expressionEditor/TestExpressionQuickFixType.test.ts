// TestExpressionQuickFixType (tests-gui-type-editor), checked against the expression editor's
// content (see testFix).
import { describe, test } from "vitest";
import { cssClassFor, testFix, testSimpleFix } from "../../../lex-editor/ExpressionEditorTestUtil.js";

describe("TestExpressionQuickFixType", () =>
{
    // Test that adding two strings suggests a quick fix to switch to string concatenation
    test("testStringAdditionFix1", () => testFix("\"A\"+\"B\"", "A", "", "\"A\";\"B\""));
    test("testStringAdditionFix2", () => testFix("\"A\"+S1+\"C\"", "C", "", "\"A\" ; column\\\\S1 ; \"C\""));
    test("testDateSubtractionFix1", () => testFix("date from ymd(2019{year}, 1{month}, 1{day}) - date{2018-12-31}", "2019", "", "@call function\\\\datetime\\days between(@call function\\\\datetime\\date from ymd(2019{year}, 1{month}, 1{day}), date{2018-12-31})"));
    test("testTimeSubtractionFix1", () => testFix("time from hms(12{hour}, 34{minute}, 56{s}) - time{9:00AM}", "56", "", "@call function\\\\datetime\\seconds between(@call function\\\\datetime\\time from hms(12{hour}, 34{minute}, 56{s}), time{9:00AM})"));
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
    test("testUnitLiteralFix9", () => testFix("type{Number{new/s}}", "new", "quick-fix-action", "type{Number{new/s}}"));
    // @Ignore in Java: "TODO fix the scoping issue"
    test.skip("testAsType1", () => testSimpleFix("minimum([])", "minimum", "@call function\\\\core\\as type(type{@invalidtypeops()},@call function\\\\comparison\\minimum([]))"));
    test("testAsType1b", () => testSimpleFix("from text(\"\")", "from", "@call function\\\\conversion\\from text to(type{@invalidtypeops()}, \"\")"));
    test("testAsType2", () => testSimpleFix("[]", "[", "@call function\\\\core\\as type(type{@invalidtypeops()},[])"));
});
