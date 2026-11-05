// Port of test.expressions.TestExpressionExplanation (tests-gui-central), which doesn't use the GUI, so it
// is a Vitest engine test here.
//
// PORT-NOTE: Java's expected values were Integers and Booleans as well as values (compared by
// Utility.compareValues); numbers are Decimals here, so the helpers convert JavaScript numbers.
import { beforeEach, describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import type { EditableColumn } from "../../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../../src/engine/data/data/EditableRecordSet.js";
import { ImmediateDataSource } from "../../../../src/engine/data/data/DataSources.js";
import { MemoryBooleanColumn } from "../../../../src/engine/data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../../src/engine/data/data/TableManager.js";
import { ErrorAndTypeRecorderStorer } from "../../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { EvaluationException } from "../../../../src/engine/expressions/transformations/expression/EvaluationException.js";
import { BooleanLiteral, type Expression, MatchExpression } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { Explanation } from "../../../../src/engine/expressions/transformations/expression/explanation/Explanation.js";
import { ExplanationLocation } from "../../../../src/engine/expressions/transformations/expression/explanation/ExplanationLocation.js";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { DataItemPosition } from "../../../../src/engine/identifiers/id/DataItemPosition.js";
import { TableId } from "../../../../src/engine/identifiers/id/TableId.js";
import { Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import { Check } from "../../../../src/engine/transformations/transformations/Check.js";
import { MultipleTableLookup } from "../../../../src/engine/transformations/transformations/MultipleTableLookup.js";
import { NumberInfo } from "../../../../src/engine/types/data/datatype/NumberInfo.js";
import { Unit } from "../../../../src/engine/types/data/unit/Unit.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../../src/engine/utility-error/styled/StyledString.js";
import { ListExList, Utility } from "../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import { assertEquals, assertNotNull } from "../../../support/junit.js";
import { DummyManager } from "../../tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { TTableUtil } from "../../tests-tables/fixtures/TTableUtil.js";

const ExecutionType = Explanation.ExecutionType;
type ExecutionType = Explanation.ExecutionType;
const CheckType = Check.CheckType;
type CheckType = Check.CheckType;
const Pattern = MatchExpression.Pattern;
type Pattern = MatchExpression.Pattern;

// Java: Pair<OptionalInt, ImmutableMap<String, @Value Object>>, with an empty OptionalInt as null
type RowIndexAndVars = Pair<number | null, ReadonlyMap<string, Value>>;
// Java's expected values: Integers, Booleans, Strings and values
type Expected = number | Value;

const id = (s: string): ExpressionIdentifier => s as ExpressionIdentifier;

// A JavaScript number as a value (Java's Integer)
function val(value: Expected): Value
{
    return typeof value === "number" ? new Decimal(value) : value;
}

function bools(name: string, ...values: boolean[]): (rs: RecordSet) => EditableColumn
{
    return rs => new MemoryBooleanColumn(rs, new ColumnId(id(name)), values.map(v => Either.right<string, boolean>(v)), false);
}

function nums(name: string, ...values: number[]): (rs: RecordSet) => EditableColumn
{
    return rs => new MemoryNumericColumn(rs, new ColumnId(id(name)), new NumberInfo(Unit.SCALAR), values.map(v => Either.right<string, Decimal>(new Decimal(v))), new Decimal(0));
}

function text(name: string, ...values: string[]): (rs: RecordSet) => EditableColumn
{
    return rs => new MemoryStringColumn(rs, new ColumnId(id(name)), values.map(v => Either.right<string, string>(v)), "");
}

// Java: the anonymous Explanation subclasses, with fixed children
class TestExplanation extends Explanation
{
    public constructor(source: Explanation.ExplanationSource, executionType: ExecutionType, evaluateState: EvaluateState, result: Value | null, directlyUsedLocations: readonly ExplanationLocation[], resultIsLocation: ExplanationLocation | null, private readonly children: readonly Explanation[])
    {
        super(source, executionType, evaluateState, result, directlyUsedLocations, resultIsLocation);
    }

    public describe(): StyledString
    {
        return StyledString.s("No description in TestExpressionExplanation");
    }

    public getDirectSubExplanations(): readonly Explanation[]
    {
        return this.children;
    }
}

describe("TestExpressionExplanation", () =>
{
    let tableManager: TableManager;

    beforeEach(() =>
    {
        tableManager = DummyManager.make();
        const columns: ((rs: RecordSet) => EditableColumn)[] = [];
        columns.push(bools("all true", true, true, true, true));
        columns.push(bools("half false", false, true, false, true));
        columns.push(bools("all false", false, false, false, false));
        tableManager.record(new ImmediateDataSource(tableManager, new Table.InitialLoadDetails(new TableId(id("T1")), null, null, null), new EditableRecordSet(columns, () => 4)));

        columns.length = 0;
        columns.push(nums("asc", 1, 2, 3, 4));
        columns.push(text("alphabet animals", "Aardvark", "Bear", "Cat", "Deer"));
        tableManager.record(new ImmediateDataSource(tableManager, new Table.InitialLoadDetails(new TableId(id("T2")), null, null, null), new EditableRecordSet(columns, () => 4)));
    });

    const parse = (src: string): Expression =>
    {
        const typeManager = tableManager.getTypeManager();
        return TFunctionUtil.parseExpression(src, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    };

    test("testException", () =>
    {
        testExplanation("(1 / 2) + 3",
            e("(1 / 2) + 3", null, null, null,
                e("1 / 2", null, null, null,
                    lit(1), lit(2)),
                lit(3),
            ));
        testExplanation("(1 / 0) + 3",
            e("(1 / 0) + 3", null, null, null,
                e("1 / 0", null, null, null,
                    lit(1), lit(0)),
                // Should not have lit(3) child because of the exception
            ));
    });

    test("testLiterals", () =>
    {
        testExplanation("1", e("1", null, 1, null));
        testExplanation("true", e("true", null, true, null));
    });

    test("testExplainedElement", () =>
    {
        testExplanation("@call function\\\\list\\element(table\\\\T1#all true, 3)", e("@call function\\\\list\\element(table\\\\T1#all true, 3)", null, true, l("T1", "all true", 2), entire("T1", "all true"), lit(3)));
        testExplanation("@call function\\\\list\\element(table\\\\T2#asc, 2) > 5", e("@call function\\\\list\\element(table\\\\T2#asc, 2) > 5", null, false, null, e("@call function\\\\list\\element(table\\\\T2#asc, 2)", null, 2, l("T2", "asc", 1), entire("T2", "asc"), lit(2)), lit(5)));
        testExplanation("(@call function\\\\list\\element(table\\\\T2#asc, 1) < 5) & (@call function\\\\list\\element(table\\\\T2#asc, 2) = 5)",
            e("(@call function\\\\list\\element(table\\\\T2#asc, 1) < 5) & (@call function\\\\list\\element(table\\\\T2#asc, 2) = 5)", null, false, null,
                e("@call function\\\\list\\element(table\\\\T2#asc, 1) < 5", null, true, null,
                    e("@call function\\\\list\\element(table\\\\T2#asc, 1)", null, 1, l("T2", "asc", 0), entire("T2", "asc"), lit(1)),
                    lit(5)),
                e("@call function\\\\list\\element(table\\\\T2#asc, 2) = 5", null, false, null,
                    e("@call function\\\\list\\element(table\\\\T2#asc, 2)", null, 2, l("T2", "asc", 1), entire("T2", "asc"), lit(2)),
                    lit(5)),
            ),
        );
    });

    function entire(table: string, column: string): Explanation
    {
        return e("table\\\\" + table + "#" + column, null, new ListExList([...TTableUtil.streamFlattened(tableManager.getSingleTableOrThrow(new TableId(id(table))).getData().getColumn(new ColumnId(id(column))))]), l(table, column), e("table\\\\" + table, null, null, new ExplanationLocation(new TableId(id(table)))));
    }

    test("testExplainedAll", () =>
    {
        testExplanation("@call function\\\\listprocess\\all(table\\\\T1#all false, (? = true))",
            explanation("@call function\\\\listprocess\\all(table\\\\T1#all false, (? = true))", ExecutionType.VALUE, null, false, l("T1", "all false", 0), false,
                entire("T1", "all false"),
                // Once for the function, once for the function call:
                e("? = true", null, null, null),
                explanation("? = true", ExecutionType.CALL_IMPLICIT, q(false), false, null, false, e("?", q(false), false, null), lit(true))));
        testExplanation("@call function\\\\listprocess\\all(table\\\\T1#half false, function\\\\boolean\\not)",
            explanation("@call function\\\\listprocess\\all(table\\\\T1#half false, function\\\\boolean\\not)", ExecutionType.VALUE, null, false, l("T1", "half false", 1), false, entire("T1", "half false"), e("function\\\\boolean\\not", null, null, null)));
        testExplanation("@call function\\\\listprocess\\all(table\\\\T2#asc, (? < 3))",
            explanation("@call function\\\\listprocess\\all(table\\\\T2#asc, (? < 3))", ExecutionType.VALUE, null, false, l("T2", "asc", 2), false, entire("T2", "asc"),
                // Once for function, once for function call:
                e("? < 3", null, null, null),
                explanation("? < 3", ExecutionType.CALL_IMPLICIT, q(3), false, null, false, e("?", q(3), 3, null), lit(3))));
        testExplanation("@call function\\\\listprocess\\all(table\\\\T2#asc, (? =~ (1.8 \u00B1 1.2)))",
            explanation("@call function\\\\listprocess\\all(table\\\\T2#asc, (? =~ (1.8 \u00B1 1.2)))", ExecutionType.VALUE, null, false, l("T2", "asc", 3), false, entire("T2", "asc"),
                // Once for function, once for call:
                e("? =~ (1.8 \u00B1 1.2)", null, null, null),
                explanation("? =~ (1.8 \u00B1 1.2)", ExecutionType.CALL_IMPLICIT, q(4), false, null, false,
                    e("?", q(4), 4, null),
                    m("1.8 \u00B1 1.2", null, false, null, lit(new Decimal("1.8")), lit(new Decimal("1.2"))),
                )));
        testExplanation("@call function\\\\listprocess\\none(table\\\\T2#asc, @function(var\\\\x) @then @call function\\\\boolean\\not(var\\\\x =~ (1.8 \u00B1 0.9)) @endfunction)",
            explanation("@call function\\\\listprocess\\none(table\\\\T2#asc, @function(var\\\\x) @then @call function\\\\boolean\\not(var\\\\x =~ (1.8 \u00B1 0.9)) @endfunction)", ExecutionType.VALUE, null, false, l("T2", "asc", 2), false, entire("T2", "asc"),
                // Once for function, once for call:
                e("@function(var\\\\x) @then @call function\\\\boolean\\not(var\\\\x =~ (1.8 \u00B1 0.9)) @endfunction", null, null, null),
                e("@call function\\\\boolean\\not(var\\\\x =~ (1.8 \u00B1 0.9))", vv("x", 3), null, null,
                    explanation("var\\\\x =~ (1.8 \u00B1 0.9)", ExecutionType.VALUE, vv("x", 3), false, null, false,
                        e("var\\\\x", vv("x", 3), 3, null),
                        m("1.8 \u00B1 0.9", null, false, null, lit(new Decimal("1.8")), lit(new Decimal("0.9"))),
                    ))));

        testCheckExplanation("T1", "column\\\\half false", CheckType.ALL_ROWS, e("column\\\\T1\\half false", r(0), false, l("T1", "half false", 0)));
        testCheckExplanation("T1", "@if column\\\\half false @then column\\\\all false @else column\\\\all true @endif", CheckType.ALL_ROWS, e("@if column\\\\T1\\half false @then column\\\\T1\\all false @else column\\\\T1\\all true @endif", r(1), false, null,
            e("column\\\\T1\\half false", r(1), true, l("T1", "half false", 1)),
            e("column\\\\T1\\all false", r(1), false, l("T1", "all false", 1)),
        ));
        testCheckExplanation("T1", "@match column\\\\half false @case true @then column\\\\all false @case false @then column\\\\all true @endmatch", CheckType.ALL_ROWS, e("@match column\\\\T1\\half false @case true @then column\\\\T1\\all false @case false @then column\\\\T1\\all true @endmatch", r(1), false, null,
            e("column\\\\T1\\half false", r(1), true, l("T1", "half false", 1)),
            clause([new Pattern(new BooleanLiteral(true), null)], "column\\\\T1\\all false", r(1), true,
                // Bit confusing; outer true is result of pattern match,
                // inner true is the literal that it was matched against
                m("true", r(1), true, null, e("true", r(1), true, null))),
            e("column\\\\T1\\all false", r(1), false, l("T1", "all false", 1))),
        );

        // This is a mega-match clause with multiple clauses that won't match.
        // The matching row is the third row (index 2).
        // The value being matched against is (asc, alphabet animals)

        // First clause is (n, a) @given n > text length(a)
        const _megaClause1Expl = clause([pattern("(a: var\\\\n, b: var\\\\a)", "var\\\\n > @call function\\\\text\\text length(var\\\\a)")], "true", r(2), false,
            m("(a: var\\\\n, b: var\\\\a)", r(2, v("n", 3), v("a", "Cat")), true, null,
                m("var\\\\n", r(2, v("n", 3)), true, null),
                m("var\\\\a", r(2, v("a", "Cat")), true, null)),
            e("var\\\\n > @call function\\\\text\\text length(var\\\\a)", r(2, v("n", 3), v("a", "Cat")), false, null,
                e("var\\\\n", r(2, v("n", 3)), 3, null),
                e("@call function\\\\text\\text length(var\\\\a)", r(2, v("a", "Cat")), 3, null, e("a", r(2, v("a", "Cat")), "Cat", null)),
            ),
        );
        // Second clause is (3,  _ ; "t") @given false @then 1 > 0
        const _megaClause2Expl = clause([pattern("(a: 3, b: (_ ; \"t\"))", "false")], "1 > 0", r(2), false,
            m("(a:3, b:(_ ; \"t\"))", r(2), true, null,
                m("3", r(2), true, null,
                    e("3", r(2), 3, null)),
                m("_ ; \"t\"", r(2), true, null,
                    e("\"t\"", r(2), "t", null),
                    m("_", r(2), true, null)),
            ),
            e("false", r(2), false, null),
        );

        // Third clause is @case (_n, "Cat") @then n > 2
        const _megaClause3Expl = clause([pattern("(a: var\\\\n, b: \"Cat\")", null)], "n > 2", r(2, v("n", 3)), true,
            m("(a: var\\\\n, b: \"Cat\")", r(2, v("n", 3)), true, null,
                m("var\\\\n", r(2, v("n", 3)), true, null),
                m("\"Cat\"", r(2), true, null, e("\"Cat\"", r(2), "Cat", null))),
        );
        const _outcome = e("var\\\\n > 2", r(2, v("n", 3)), true, null, e("n", r(2, v("n", 3)), 3, null), e("2", r(2), 2, null));

        /* TODO put this back
        String fullMega = "@match (a:column\\\\T2\\asc, b:column\\\\T2\\alphabet animals) @case (a:n, b:a) @given n > @call function\\\\text length(a) @then true @case (a:3,  b:(_ ; \"t\")) @given false @then 1 > 0 @case (a:n, b:\"Cat\") @then n > 2 @case _ @then false @endmatch";
        testCheckExplanation("T2", fullMega, CheckType.NO_ROWS, e(fullMega, r(2), true, null,
            e("(a:column\\\\T2\\asc, b:column\\\\T2\\alphabet animals)", r(2), new RecordMap(ImmutableMap.<@ExpressionIdentifier String, @Value Object>of("a", DataTypeUtility.value(3), "b", DataTypeUtility.value("Cat"))), null,
                e("column\\\\T2\\asc", r(2), 3, l("T2", "asc", 2)),
                e("column\\\\T2\\alphabet animals", r(2), "Cat", l("T2", "alphabet animals", 2))
                ),
            megaClause1Expl, megaClause2Expl, megaClause3Expl, outcome));
         */
    });

    function pattern(patternSrc: string, guardSrc: string | null): Pattern
    {
        return new Pattern(parse(patternSrc), guardSrc === null ? null : parse(guardSrc));
    }

    // No row index, and a mapping from a single implicit lambda arg param to the given value
    function q(value: Expected): RowIndexAndVars
    {
        return new Pair(null, new Map([["?1", val(value)]]));
    }

    // No row index, and a mapping from a single name to the given value
    function vv(name: string, value: Expected): RowIndexAndVars
    {
        return new Pair(null, new Map([[name, val(value)]]));
    }

    interface VarValue
    {
        readonly name: string;
        readonly value: Value;
    }

    function v(name: string, value: Expected): VarValue
    {
        return { name, value: val(value) };
    }

    // Just a row index, no variables
    function r(rowIndex: number, ...varValues: VarValue[]): RowIndexAndVars
    {
        return new Pair(rowIndex, new Map(varValues.map(varValue => [varValue.name, varValue.value])));
    }

    function clause(patterns: readonly Pattern[], outcomeSrc: string, rowIndexAndVars: RowIndexAndVars | null, result: boolean, ...children: Explanation[]): Explanation
    {
        const typeManager = tableManager.getTypeManager();
        const outcomeExpression = parse(outcomeSrc);
        return new TestExplanation(MatchExpression.MatchClause.unrecorded(patterns, outcomeExpression), ExecutionType.MATCH, makeEvaluateState(rowIndexAndVars, typeManager), result, [], null, children);
    }

    function m(expressionSrc: string, rowIndexAndVars: RowIndexAndVars | null, result: Expected | null, location: ExplanationLocation | null, ...children: Explanation[]): Explanation
    {
        return explanation(expressionSrc, ExecutionType.MATCH, rowIndexAndVars, result, location, false, ...children);
    }

    function e(expressionSrc: string, rowIndexAndVars: RowIndexAndVars | null, result: Expected | null, location: ExplanationLocation | null, ...children: Explanation[]): Explanation
    {
        return explanation(expressionSrc, ExecutionType.VALUE, rowIndexAndVars, result, location, true, ...children);
    }

    function explanation(expressionSrc: string, executionType: ExecutionType, rowIndexAndVars: RowIndexAndVars | null, result: Expected | null, location: ExplanationLocation | null, locationIsResult: boolean, ...children: Explanation[]): Explanation
    {
        const typeManager = tableManager.getTypeManager();
        const expression = parse(expressionSrc);
        const evaluateState = makeEvaluateState(rowIndexAndVars, typeManager);
        return new TestExplanation(expression, executionType, evaluateState, result === null ? null : val(result), location === null ? [] : [location], locationIsResult ? location : null, children);
    }

    function makeEvaluateState(rowIndexAndVars: RowIndexAndVars | null, typeManager: ReturnType<TableManager["getTypeManager"]>): EvaluateState
    {
        let evaluateState = new EvaluateState(typeManager, rowIndexAndVars === null ? null : rowIndexAndVars.getFirst());
        if (rowIndexAndVars !== null)
        {
            for (const [name, value] of rowIndexAndVars.getSecond())
            {
                evaluateState = evaluateState.add(name, value);
            }
        }
        return evaluateState;
    }

    function lit(value: number | boolean | Decimal): Explanation
    {
        return e(value.toString(), null, value, null);
    }

    // Java: l(tableName, columnName) and l(tableName, columnName, rowIndex)
    function l(tableName: string, columnName: string, rowIndex?: number): ExplanationLocation
    {
        return new ExplanationLocation(new TableId(id(tableName)), new ColumnId(id(columnName)), rowIndex === undefined ? null : DataItemPosition.row(rowIndex));
    }

    function testExplanation(src: string, expectedExplanation: Explanation): void
    {
        const typeManager = tableManager.getTypeManager();
        const expression = parse(src);
        const errorAndTypeRecorderStorer = new ErrorAndTypeRecorderStorer();
        const typeCheck = expression.checkExpression(new MultipleTableLookup(null, tableManager, null, null), TFunctionUtil.createTypeState(typeManager), errorAndTypeRecorderStorer);
        assertNotNull(errorAndTypeRecorderStorer.getAllErrors().map(s => s.toPlain()).join("\n"), typeCheck);
        let actual: Explanation;
        try
        {
            actual = expression.calculateValue(new EvaluateState(typeManager, null, true)).makeExplanation(null);
        }
        catch (ex)
        {
            if (!(ex instanceof EvaluationException))
                throw ex;
            actual = ex.makeExplanation();
        }
        assertEquals(expectedExplanation, actual);
    }

    function testCheckExplanation(srcTable: string, src: string, checkType: CheckType, expectedExplanation: Explanation | null): void
    {
        const expression = parse(src);

        const check = new Check(tableManager, TFunctionUtil.ILD, new TableId(id(srcTable)), checkType, expression);
        const result = Utility.cast(check.getData().getColumns()[0]!.getType().getCollapsed(0), Boolean);
        // null explanation means we expect a pass:
        assertEquals(expectedExplanation === null, result);
        assertEquals(expectedExplanation, check.getExplanation());
    }
});
