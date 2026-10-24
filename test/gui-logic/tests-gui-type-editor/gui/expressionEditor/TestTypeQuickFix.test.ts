// TestTypeQuickFix (tests-gui-type-editor): the quick fixes in the type editor of a new column
// of a new table, checked against the type editor's content and display (see typeAndApplyFix).
import { describe, expect, test } from "vitest";
import { ExpressionUtil } from "../../../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { TypeLexer } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import { TFunctionUtil } from "../../../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { makeEditor, typeAndApplyFix } from "../../../lex-editor/EditorHarness.js";

function testSimpleFix(original: string, fixFieldContent: string, dataType: DataType): void
{
    testFix(original, fixFieldContent, cssClassFor(dataType.toDisplay(false)), dataType);
}

// Java: dotCssClassFor, without the dot
function cssClassFor(type: string): string
{
    return ExpressionUtil.makeCssClass(type);
}

/**
 * The GUI test creates a new table (in a manager with the test types), types the original into the
 * type editor for its column (in EditImmediateColumnDialog: a concrete type, not empty), applies
 * the fix, and checks the type of the column made.
 */
function testFix(original: string, fixFieldContent: string, fixCssClass: string, expectedResult: DataType): void
{
    const typeManager = TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager();
    const ed = makeEditor("", new TypeLexer(typeManager, true, false));
    expect(typeAndApplyFix(ed, original, fixFieldContent, fixCssClass), "Fix applied").toBe(true);
    // As EditImmediateColumnDialog makes the column's type:
    const actual = ed.finish().toDataType(typeManager);
    expect(actual !== null && actual.equals(expectedResult), "Got " + ed.content.getText() + ", i.e. " + String(actual) + ", expected " + String(expectedResult)).toBe(true);
}

describe("TestTypeQuickFix", () =>
{
    test("testTypo1", () => testSimpleFix("Numbre", "Numbre", DataType.NUMBER));
    test("testTypo2", () => testSimpleFix("DateYN", "DateYN", DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH))));
    test("testTypo3", () => testSimpleFix("Booleen", "Booleen", DataType.BOOLEAN));
    test("testTypo4", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        testSimpleFix("Optionl(Text)", "Optionl", dummyManager.getTypeManager().getMaybeType().instantiate([Either.right(DataType.TEXT)], dummyManager.getTypeManager()));
    });
    test("testTypeNameMixup", () => testSimpleFix("double", "double", DataType.NUMBER));
    test("testTypeNameMixup2", () => testSimpleFix("bool", "bool", DataType.BOOLEAN));
    test("testTypeNameMixup3", () => testSimpleFix("string", "string", DataType.TEXT));
    test("testTypeNameMixup4", () => testSimpleFix("int", "int", DataType.NUMBER));
    test("testUnitNameMixup", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        testFix("Number{second}", "second", cssClassFor("s"), DataType.number(new NumberInfo(dummyManager.getUnitManager().loadUse("s"))));
    });
    test("testUnitNameMixup2", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        testFix("EitherNumUnit({second})({m})", "second", cssClassFor("s"), dummyManager.getTypeManager().lookupType(new TypeId("EitherNumUnit"), [Either.left(dummyManager.getUnitManager().loadUse("s")), Either.left(dummyManager.getUnitManager().loadUse("m"))])!);
    });
    test("testUnitNameMixup3", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        const um = dummyManager.getUnitManager();
        testFix("Number{(s^6*meter)/kg}", "meter", cssClassFor("m"), DataType.number(new NumberInfo(um.loadUse("s").raisedTo(6).times(um.loadUse("m").divideBy(um.loadUse("kg"))))));
    });
    test("testMissingTupleBrackets", () => testSimpleFix("a:Number,b:Text", ",", DataType.record([["a", DataType.NUMBER], ["b", DataType.TEXT]])));
});
