// The port of TestExpressionEditor (tests-gui-expression-editor): expressions typed into a new Calculate
// column's expression editor (BaseTestExpressionEditorEntry's testEntry_Impl), or typed plainly, give the
// expected expression.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { KnownLengthRecordSet } from "../../../src/engine/data/data/KnownLengthRecordSet.js";
import { MemoryBooleanColumn } from "../../../src/engine/data/data/MemoryBooleanColumn.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { ExpressionValue } from "../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { doubleOk } from "../base/doubleOk.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { testEntryImpl } from "../base/expressionEditorEntry.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java: plainEntry: the expression typed as text into a new Calculate of an empty table
async function plainEntry(expressionSrc: string, typeManager: TypeManager): Promise<Expression | null>
{
    // Java: TAppUtil.openDataAsTable, with its default table name
    const content = savedFile(manager =>
    {
        manager.getTypeManager()._test_copyTaggedTypesFrom(typeManager);
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(new KnownLengthRecordSet([], 0))));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    const grid = a.mainWindow()!.grid()!.grid;
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const targetPos = new CellPosition(CellPosition.row(3), CellPosition.col(5));
    await keyboardMoveTo(grid, targetPos);
    // Only need to click once as already selected by keyboard:
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("text-field") === true);
    await write("Table1");
    await push("Enter");
    await sleep(200);
    // (The dialog shows once the engine has made the Calculate)
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("DestCol");
    // Focus expression editor:
    await push("Tab");
    await enterAndDeleteSmartBrackets(expressionSrc);

    // Close dialog, ignoring errors:
    await doubleOk();
    // Now close dialog, and check for equality;
    expect(document.querySelector(".ok-button"), "OK button").toBeNull();
    await engineHost(a).idle();
    const calculate = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate);
    if (calculate === undefined)
        throw new Error("No transformation found");
    // Check expressions match:
    return [...calculate.getCalculatedColumns().values()][0] ?? null;
}

async function testSimpleQ(expressionSrc: string, ...qualifiedIdentsToEnterInFull: string[]): Promise<void>
{
    const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
    const expression = TFunctionUtil.parseExpression(expressionSrc, dummyManager.getTypeManager(), FunctionList.getFunctionLookup(dummyManager.getUnitManager()));

    // Check once using structured entry:
    await testEntryImpl(new ExpressionValue(
        DataType.BOOLEAN, // Type is unused here
        [],
        dummyManager.getTypeManager(),
        new TableId("TEE"),
        new KnownLengthRecordSet([rs => new MemoryBooleanColumn(rs, new ColumnId("Col1"), [], true)], 0),
        expression,
        null,
    ), new JavaRandom(0), a => { app = a; }, ...qualifiedIdentsToEnterInFull);
}

function testSimple(expressionSrc: string, plain?: string): Promise<void>
{
    if (plain === undefined)
        return testSimpleQ(expressionSrc);
    return (async () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        const expression = TFunctionUtil.parseExpression(expressionSrc, dummyManager.getTypeManager(), FunctionList.getFunctionLookup(dummyManager.getUnitManager()));
        const entered = await plainEntry(plain, dummyManager.getTypeManager());
        expect(entered?.toString()).toBe(expression.toString());
        expect(entered?.equals(expression)).toBe(true);
    })();
}

describe("TestExpressionEditor", () =>
{
    test("testGreaterMinus", () => testSimple("2>-1"));
    test("testTuple", () => testSimple("(k:1, v:2)"));
    test("testCall", () => testSimple("@call function\\\\list\\get single([1])"));
    test("testCall2", () => testSimple("@call function\\\\number\\abs(3{m})"));
    test("testCall3", () => testSimple("@call function\\\\list\\element([1, 2], 1)"));
    test("testCall4", () => testSimple("@call function\\\\number\\abs(2/3)"));
    test("testCall5", () => testSimple("@call tag\\\\Optional\\Is(1)"));
    test("testCall6", () => testSimple("@call tag\\\\A\\Single(1)"));
    test("testCall7", () => testSimple("1 + @call tag\\\\Optional\\Is(@call tag\\\\A\\Single(1))"));
    test("testUnit", () => testSimple("35{m/s}"));
    test("testUnit2", () => testSimple("35{m/(s*s)}"));
    test("testMinus", () => testSimple("-2"));
    test("testMinus2", () => testSimple("1-2"));
    test("testMinus2b", () => testSimple("1 - 2"));
    test("testMinus3", () => testSimple("1*-2"));
    test("testMinus4", () => testSimple("1--2"));
    test("testMinus5", () => testSimple("1*(-2+3)"));
    test("testInvalidMinus", () => testSimple("@invalidops(-1, @unfinished \"+\", -2, @unfinished \"*\", -3, @unfinished \"-\", -4)", "-1 + -2 * -3 - -4"));
    test("testInvalidPlus", () => testSimple("@invalidops(2, @unfinished \"+\")", "2+"));
    test("testPlus", () => testSimple("+2"));
    test("testPlus2", () => testSimple("1+2"));
    test("testPlus2b", () => testSimple("1 + 2"));
    test("testPlus2c", () => testSimple("\"a\"+2"));
    test("testPlus3", () => testSimple("1*+2"));
    test("testPlus4", () => testSimple("1++2"));
    test("testPlus5", () => testSimple("1*(+2/3)"));
    test("testBracket", () => testSimple("1+(2/(3*4))+5"));
    test("testBracket2", () => testSimple("1+(2/@call function\\\\number\\abs(3*4))+5"));
    test("testBracket3", () => testSimple("1+(1.5+@call function\\\\number\\abs(2+(3*4)+6))-7"));
    test("testDateLiteral", () => testSimple("date{2001-04-05}"));
    test("testDateYMLiteral", () => testSimple("dateym{2001-04}"));
    test("testTimeLiteral", () => testSimple("time{12:00}"));
    test("testTimeLiteral2", () => testSimple("time{12:00:01.325252666}"));
    test("testDateTimeLiteral", () => testSimple("datetime{2001-04-06 22:44:45}"));
    test("testDateTimeZonedLiteral", () => testSimple("datetimezoned{2001-04-06 22:44:45.667 Europe/London}"));
    test("testEmpties", () => testSimple("(\"\"=\"\") & ([] <> [])"));
    test("testTagNames", () => testSimple("tag\\\\A\\Single = tag\\\\A\\Single"));
    test("testOverlappingTagNames", () => testSimple("@match (@if (tag\\\\A\\Single = tag\\\\A\\Single) @then @call function\\\\conversion\\from text to(type{B}, \"Single\") @else tag\\\\B\\Single @endif) @case tag\\\\B\\Single @given @call function\\\\conversion\\from text to(type{Boolean}, \"true\") @then @call function\\\\conversion\\from text to(type{(a: Nested, b: Number {cm})}, \"(a: A(Single), b:-2147483648)\") @endmatch"));
    test("testTupleType", () => testSimple("@call function\\\\core\\as type(type{(t 0:Number, t 1:Boolean)}, @call function\\\\conversion\\from text(\"(1, true)\"))"));
    test("testNestedTupleType", () => testSimple("@call function\\\\core\\as type(type{(a 0: (a 0: Number, b 1: Boolean), b 1: Text)}, @call function\\\\conversion\\from text(\"((1, true), ^qhi^q)\"))"));
    test("testMaybeType", () => testSimple("@call function\\\\core\\as type(type{[(k:(k:Text, v:@apply Optional(Boolean)), v:@apply Optional(@apply Optional(Date)))]}, @call function\\\\conversion\\from text(\"[]\"))"));
    test("testTupleAndListType", () => testSimple("@call function\\\\core\\as type(type{[[(k k:Number, v v:[Boolean])]]}, @call function\\\\conversion\\from text(\"[]\"))"));
    test("testNumberType", () => testSimple("@call function\\\\core\\as type(type{Number{1}}, @call function\\\\conversion\\from text(\"3\"))"));
    test("testNumberType2", () => testSimple("@call function\\\\core\\as type(type{Number{m/s}}, @call function\\\\conversion\\from text(\"3\"))"));
    test("testList", () => testSimple("[1, 2, 3]"));
    test("testList2", () => testSimple("1 + 2 + [3 * 4] + 5"));
    test("testList3", () => testSimple("1 + 2 + [@invalidops(3, @unfinished \"*\", 4, @unfinished \"/\", 5)] + 6", "1 + 2 + [3 * 4 / 5] + 6"));
    test("testList4", () => testSimple("[] ; [[[]]] ; [[], [[]], [[4],[],[1,2,3]]]"));
    test("testSingletonList", () => testSimple("[1]"));
    test("testSingletonList2", () => testSimple("[1 / 2]"));
    test("testSingletonList2b", () => testSimple("[1 * 2]"));
    test("testSingletonList3", () => testSimple("[(k:1, v:2)]"));
    test("testMatch", () => testSimple("@match @call function\\\\conversion\\from text to(type{DateTime}, \"2047-12-23 10:50:09.094335028\") @case @call function\\\\conversion\\from text to(type{DateTime}, \"2024-06-09 13:26:01.165156525\") @given true @orcase @call function\\\\datetime\\datetime from dt(date{8848-10-02}, time{14:57:00}) @given (true = @call function\\\\conversion\\from text to(type{Boolean}, \"true\") = true = @call function\\\\conversion\\from text to(type{Boolean}, \"true\")) @then @call function\\\\conversion\\from text to(type{(a: Number, b: Number)}, \"(a: 7, b: 242784)\") @case _ @given true @orcase @call function\\\\conversion\\from text to(type{DateTime}, @call function\\\\conversion\\from text to(type{Text}, \"^q2914-03-04 09:00:00.753695607^q\")) @orcase @call function\\\\conversion\\from text to(type{DateTime}, \"\") @given true @orcase var\\\\var11 @given var\\\\var11 = ((@call function\\\\conversion\\from text to(type{(a: Number {(USD*m)/s^2}, b:(c: DateTime, d: DateTime), e:[Text], f:Number)}, \"(-2147483649,(2047-09-04 22:11:00,2047-12-23 10:50:09.094335028),[^qUNITS^q,^qknr90rr9rra^q,^qX^q],1609257947333)\")#b)#d) @then (a:3, b:4) @endmatch"));
    test("testMatchAny", () => testSimple("@match \"\" @case var\\\\prefix ; \"mid\" ; _ @then \"Y\" ; var\\\\prefix @case _ @then \"\" @endmatch"));
    test("testConcat", () => testSimple("\"\";(\"A\";\"B\")"));
    test("testTableReference", () => testSimple("table\\\\TEE"));
    test("testDefine", () => testSimple("@define var\\\\x = 3, var\\\\y = var\\\\x @then var\\\\x / var\\\\y @enddefine"));
    test("testDefine2", () => testSimple("@define var\\\\x :: type{Number}, var\\\\x = 3, var\\\\y = var\\\\x @then var\\\\x / var\\\\y @enddefine"));
    test("testFieldAccess", () => testSimple("@define var\\\\x 1 = (a 0: 5, b 3: 6) @then (var\\\\x 1#a 0) + ( var\\\\x 1 # b 3 ) @enddefine"));
    test("testRecordList", () => testSimpleQ("@call function\\\\conversion\\from text(@call function\\\\text\\replace many([(find:\"nw\",replace:\"0\"),(find:\"~\",replace:\"-\")],column\\\\Wind m s))", "column\\\\Wind m s"));
    test("testLambda", () => testSimple("@define var\\\\f = @function(var\\\\x) @then var\\\\x + 3 @endfunction @then @call var\\\\f(1) @enddefine"));
    test("testLambda2", () => testSimple("@define var\\\\f = @function(var\\\\x, _, 3 \u00B1 4) @then var\\\\x + 3 @endfunction @then true @enddefine"));
    test("testLambda3", () => testSimple("@define var\\\\f = @function(var\\\\x, _, 3 \u00B1 4) @then var\\\\x + 3 @endfunction @then @call var\\\\f(2, [3], 5) @enddefine"));
    test("testUnclosedInternal1", () => testSimple("[@invalidops(@unfinished \"(\", (1+2))]", "[(1+2]"));
    test("testUnclosedInternal2", () => testSimple("@invalidops(@unfinished \"(\", (0 + (1+2)))", "(0+(1+2)"));
    test("testUnclosedInternal2b", () => testSimple("0 + @invalidops(@unfinished \"[\", (1+2))", "(0+[1+2)"));
    test("testUnclosedInternal3", () => testSimple("@if @invalidops(function\\\\number\\abs, @unfinished \"(\", 5) @then @invalidops(@unfinished \"[\", 0) @else 1 @endif", "@if abs(5 @then [0 @else 1 @endif"));
    // Java: @Ignore // TODO
    test.skip("testUnclosedInternal3b", () => testSimple("@if @invalidops(function\\\\number\\abs, @unfinished \"(\", 5) @then @invalidops(@unfinished \"[\", 0) @else @invalidops(1, @unfinished \"]\") @endif", "@if abs(5 @then [0 @else 1] @endif"));
});
