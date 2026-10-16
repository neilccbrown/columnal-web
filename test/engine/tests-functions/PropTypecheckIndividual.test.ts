// Port of test.PropTypecheckIndividual (tests-functions).
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { KnownLengthRecordSet } from "../../../src/engine/data/data/KnownLengthRecordSet.js";
import type { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { CanonicalSpan } from "../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import type { ErrorAndTypeRecorder } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorder.js";
import { ErrorAndTypeRecorderStorer } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import type { EvaluateState } from "../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { AndExpression, ArrayExpression, ComparisonExpression, DivideExpression, EqualExpression, Expression, MatchExpression, NonOperatorExpression, NotEqualExpression, OrExpression, RaiseExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { TypeState } from "../../../src/engine/expressions/transformations/expression/TypeState.js";
import type { ExpressionVisitor } from "../../../src/engine/expressions/transformations/expression/visitor/ExpressionVisitor.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import type { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Rational } from "../../../src/engine/java/Rational.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeId } from "../../../src/engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import type { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { NumTypeExp, TypeExp } from "../../../src/engine/types/typeExp/TypeExps.js";
import { UnitExp } from "../../../src/engine/types/typeExp/units/UnitExp.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../src/engine/utility-error/error/InternalException.js";
import { StyledString } from "../../../src/engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import { assertEquals, assertNull, assumeFalse } from "../../support/junit.js";
import { propertyTest } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenUnit } from "../tests-basic/fixtures/gen/GenUnit.js";
import { DummyManager } from "./fixtures/DummyManager.js";
import { TFunctionUtil } from "./fixtures/functions/TFunctionUtil.js";
import { GenDataType } from "./fixtures/gen/type/GenDataType.js";
import { GenDataTypeMaker } from "./fixtures/gen/type/GenDataTypeMaker.js";

const ComparisonOperator = ComparisonExpression.ComparisonOperator;
const id = (s: string): ExpressionIdentifier => s as ExpressionIdentifier;
const zeroSpan = (): CanonicalSpan => new CanonicalSpan(0, 0);

// A shell expression that exists just to resolve its type checking to a given type.
class DummyExpression extends Expression
{
    private readonly type: DataType;

    public constructor(type: DataType)
    {
        super();
        this.type = type;
    }

    public override check(_dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return onError.recordType(this, state, TypeExp.fromDataType(this, this.type));
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Testing");
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "Testing";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, _expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return StyledString.s("Testing");
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(o: unknown): boolean
    {
        return this === o;
    }

    public override hashCode(): number
    {
        // Java: System.identityHashCode(this)
        return 0;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(_visitor: ExpressionVisitor<T>): T
    {
        // Hack -- we know we should only be called with Stream visitors (which return arrays here):
        return [] as T;
    }
}

class DummyConstExpression extends DummyExpression
{
    private readonly value: Rational;

    public constructor(type: DataType, value: Rational)
    {
        super(type);
        this.value = value;
    }

    public override constantFold(): Rational | null
    {
        return this.value;
    }
}

// Java: private static class DummyRecordSet (unused)
export class DummyRecordSet extends KnownLengthRecordSet
{
    public constructor()
    {
        super([], 0);
    }
}

class DummyPatternMatch extends NonOperatorExpression
{
    private readonly expected: DataType;

    public constructor(expected: DataType)
    {
        super();
        this.expected = expected;
    }

    public override check(_dataLookup: Expression.ColumnLookup, state: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return onError.recordTypeAndError(this, Either.right<TypeExp.TypeError | null, TypeExp>(TypeExp.fromDataType(this, this.expected)), state);
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        throw new InternalException("Should not be called");
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "Testing";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, _expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return StyledString.s("Testing");
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(_o: unknown): boolean
    {
        return false;
    }

    public override hashCode(): number
    {
        return 0;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(_visitor: ExpressionVisitor<T>): T
    {
        // Hack -- we know we should only be called with Stream visitors (which return arrays here):
        return [] as T;
    }
}

function check(e: Expression): TypeExp | null
{
    return e.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer());
}

// Java: checkConcrete(e) and checkConcrete(typeManager, e)
function checkConcrete(typeManagerOrE: TypeManager | Expression, e?: Expression): DataType | null
{
    const typeManager = e === undefined ? DummyManager.make().getTypeManager() : typeManagerOrE as TypeManager;
    const expression = e === undefined ? typeManagerOrE as Expression : e;
    const typeExp = expression.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.createTypeState(typeManager), new ErrorAndTypeRecorderStorer());
    if (typeExp === null)
        return null;
    else
        return typeExp.toConcreteType(typeManager).either<DataType | null>(_err => null, t => t);
}

// Java: checkConcreteType(DataType, String) and checkConcreteType(ExFunction<TypeManager, DataType>, String)
function checkConcreteType(dataType: DataType | null | ((m: TypeManager) => DataType), expression: string): void
{
    const typeManager = TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager();
    const expected = typeof dataType === "function" ? dataType(typeManager) : dataType;
    assertEquals(expression, expected, checkConcrete(typeManager, TFunctionUtil.parseExpression(expression, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()))));
}

const record = (...fields: [string, DataType][]): DataType => DataType.record(new Map(fields.map(([k, v]) => [id(k), v] as const)));

/**
 * Created by neil on 24/01/2017.
 */
describe("PropTypecheckIndividual", () =>
{
    propertyTest("propEquals", [new GenDataType(), new GenDataType()], (a: DataType, b: DataType) =>
    {
        const same = a.equals(b);
        assumeFalse(same);

        const columnLookup = TFunctionUtil.dummyColumnLookup();
        assertEquals(null, new EqualExpression([new DummyExpression(a), new DummyExpression(b)], false).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertEquals(TypeExp.bool(null), new EqualExpression([new DummyExpression(a), new DummyExpression(a)], false).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertEquals(TypeExp.bool(null), new EqualExpression([new DummyExpression(b), new DummyExpression(b)], false).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertEquals(null, new NotEqualExpression(new DummyExpression(a), new DummyExpression(b)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertEquals(TypeExp.bool(null), new NotEqualExpression(new DummyExpression(a), new DummyExpression(a)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertEquals(TypeExp.bool(null), new NotEqualExpression(new DummyExpression(b), new DummyExpression(b)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
    });

    propertyTest("propDivide", [new GenDataType(), new GenDataType()], (a: DataType, b: DataType) =>
    {
        const columnLookup = TFunctionUtil.dummyColumnLookup();
        if (DataTypeUtility.isNumber(a) && DataTypeUtility.isNumber(b))
        {
            // Will actually type-check
            const aOverB = TFunctionUtil.getUnit(a).divideBy(TFunctionUtil.getUnit(b));
            const bOverA = TFunctionUtil.getUnit(b).divideBy(TFunctionUtil.getUnit(a));
            assertEquals(new NumTypeExp(null, UnitExp.fromConcrete(aOverB)), new DivideExpression(new DummyExpression(a), new DummyExpression(b)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
            assertEquals(new NumTypeExp(null, UnitExp.fromConcrete(bOverA)), new DivideExpression(new DummyExpression(b), new DummyExpression(a)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        }
        else
        {
            assertEquals(null, new DivideExpression(new DummyExpression(a), new DummyExpression(b)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
            assertEquals(null, new DivideExpression(new DummyExpression(b), new DummyExpression(a)).checkExpression(columnLookup, TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        }
    });

    propertyTest("testArray", [new GenDataTypeMaker()], (typeMaker: GenDataTypeMaker.DataTypeMaker) =>
    {
        const a = typeMaker.makeType().getDataType();
        const b = typeMaker.makeType().getDataType();
        const same = a.equals(b);
        assumeFalse(same);

        const types: DataType[] = [];
        for (let length = 1; length < 10; length++)
        {
            // Add once more as length increases:
            types.push(a);
            // All a should type check:
            assertEquals(DataType.array(a), checkConcrete(typeMaker.getTypeManager(), new ArrayExpression(Utility.mapListExI(types, t => new DummyExpression(t)))));

            for (let i = 0; i <= length; i++)
            {
                // Once we add b in, should fail to type check:
                const badTypes: DataType[] = [...types];
                badTypes.splice(i, 0, b);
                assertEquals(null, checkConcrete(typeMaker.getTypeManager(), new ArrayExpression(Utility.mapListExI(badTypes, t => new DummyExpression(t)))));
            }
        }
    });

    // Tests non-numeric types in raise expressions
    propertyTest("propRaiseNonNumeric", [new GenDataType()], (a: DataType) =>
    {
        assumeFalse(DataTypeUtility.isNumber(a));
        assertNull(new RaiseExpression(new DummyExpression(a), new DummyExpression(DataType.NUMBER)).checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
        assertNull(new RaiseExpression(new DummyExpression(DataType.NUMBER), new DummyExpression(a)).checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.typeState(), new ErrorAndTypeRecorderStorer()));
    });

    propertyTest("propRaiseNumeric", [new GenUnit()], (unit: Unit) =>
    {
        // The rules for raise (besides both must be numeric) are:
        // RHS unit is forbidden
        // LHS plain and RHS plain are fine, for any value of RHS
        // LHS units and RHS variable is banned (only constant RHS)
        // LHS units and RHS integer is always fine
        // LHS units and RHS 1/integer is ok if all unit powers are divisible by the integer
        // LHS units and any other value is not ok.

        // Any unit but scalar:
        assumeFalse(unit.equals(Unit.SCALAR));

        // No units on RHS:
        const unitNum = DataType.number(new NumberInfo(unit));
        assertEquals(null, checkConcrete(new RaiseExpression(new DummyExpression(DataType.NUMBER), new DummyExpression(unitNum))));
        // Plain on both is fine, even when RHS doesn't constant fold:
        assertEquals(DataType.NUMBER, checkConcrete(new RaiseExpression(new DummyExpression(DataType.NUMBER), new DummyExpression(DataType.NUMBER))));
        // LHS units is banned if RHS doesn't constant fold:
        assertEquals(null, checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyExpression(DataType.NUMBER))));
        // LHS units and RHS integer is fine:
        assertEquals(unitNum, checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyConstExpression(DataType.NUMBER, Rational.ONE))));
        assertEquals(DataType.NUMBER, checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyConstExpression(DataType.NUMBER, Rational.ZERO))));
        assertEquals(DataType.number(new NumberInfo(unit.raisedTo(5))), checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyConstExpression(DataType.NUMBER, Rational.of(5)))));
        assertEquals(DataType.number(new NumberInfo(unit.reciprocal())), checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyConstExpression(DataType.NUMBER, Rational.of(-1)))));
        assertEquals(DataType.number(new NumberInfo(unit.raisedTo(3).reciprocal())), checkConcrete(new RaiseExpression(new DummyExpression(unitNum), new DummyConstExpression(DataType.NUMBER, Rational.of(-3)))));
        // 1/integer is ok if all units divisible:
        assertEquals(unitNum, checkConcrete(new RaiseExpression(new DummyExpression(DataType.number(new NumberInfo(unit.raisedTo(3)))), new DummyConstExpression(DataType.NUMBER, Rational.ofLongs(1n, 3n)))));
        // Any other rational not allowed:
        assertEquals(null, checkConcrete(new RaiseExpression(new DummyExpression(DataType.number(new NumberInfo(unit.raisedTo(6)))), new DummyConstExpression(DataType.NUMBER, Rational.ofLongs(2n, 3n)))));
    });

    propertyTest("propAndOr", [new GenDataType()], (nonBool: DataType) =>
    {
        assumeFalse(nonBool.equals(DataType.BOOLEAN));

        for (const create of [(es: Expression[]) => new AndExpression(es), (es: Expression[]) => new OrExpression(es)])
        {
            assertEquals(TypeExp.bool(null), check(create([new DummyExpression(DataType.BOOLEAN)])));
            assertEquals(TypeExp.bool(null), check(create([new DummyExpression(DataType.BOOLEAN), new DummyExpression(DataType.BOOLEAN)])));
            assertEquals(TypeExp.bool(null), check(create([new DummyExpression(DataType.BOOLEAN), new DummyExpression(DataType.BOOLEAN), new DummyExpression(DataType.BOOLEAN)])));

            assertEquals(null, check(create([new DummyExpression(nonBool)])));
            assertEquals(null, check(create([new DummyExpression(DataType.BOOLEAN), new DummyExpression(nonBool)])));
            assertEquals(null, check(create([new DummyExpression(nonBool), new DummyExpression(DataType.BOOLEAN)])));
            assertEquals(null, check(create([new DummyExpression(DataType.BOOLEAN), new DummyExpression(DataType.BOOLEAN), new DummyExpression(nonBool)])));
            assertEquals(null, check(create([new DummyExpression(DataType.BOOLEAN), new DummyExpression(nonBool), new DummyExpression(DataType.BOOLEAN)])));
            assertEquals(null, check(create([new DummyExpression(nonBool), new DummyExpression(DataType.BOOLEAN), new DummyExpression(DataType.BOOLEAN)])));
        }
    });

    propertyTest("propComparison", [new GenDataType(), new GenDataType()], (main: DataType, other: DataType) =>
    {
        // Must be different types:
        assumeFalse(main.equals(other));

        assertEquals(TypeExp.bool(null), check(new ComparisonExpression([new DummyExpression(main), new DummyExpression(main)], [ComparisonOperator.LESS_THAN])));
        assertEquals(TypeExp.bool(null), check(new ComparisonExpression([new DummyExpression(main), new DummyExpression(main), new DummyExpression(main)], [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO])));

        assertEquals(null, check(new ComparisonExpression([new DummyExpression(other), new DummyExpression(main)], [ComparisonOperator.LESS_THAN])));
        assertEquals(null, check(new ComparisonExpression([new DummyExpression(main), new DummyExpression(other)], [ComparisonOperator.GREATER_THAN])));
        assertEquals(null, check(new ComparisonExpression([new DummyExpression(other), new DummyExpression(main), new DummyExpression(main)], [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO])));
        assertEquals(null, check(new ComparisonExpression([new DummyExpression(main), new DummyExpression(other), new DummyExpression(main)], [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO])));
        assertEquals(null, check(new ComparisonExpression([new DummyExpression(main), new DummyExpression(main), new DummyExpression(other)], [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO])));
    });

    // TODO typecheck all the compound expressions (addsubtract, times, tag)

    propertyTest("checkMatch", [new GenDataTypeMaker()], (typeMaker: GenDataTypeMaker.DataTypeMaker) =>
    {
        const matchType = typeMaker.makeType().getDataType();
        const resultType = typeMaker.makeType().getDataType();
        const otherType = typeMaker.makeType().getDataType();

        // Doesn't matter if match is same as result, but other must be different than both to make failures actually fail:
        assumeFalse(matchType.equals(otherType));
        assumeFalse(resultType.equals(otherType));

        const MatchClause = MatchExpression.MatchClause;
        const Pattern = MatchExpression.Pattern;
        // Not valid to have zero clauses as can't determine result type:
        assertEquals(null, check(new MatchExpression(zeroSpan(), new DummyExpression(matchType), [], zeroSpan())));

        // One clause with one pattern, all checks out:
        assertEquals(resultType, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType))], zeroSpan())));
        // One clause, two patterns
        assertEquals(resultType, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType))], zeroSpan())));
        // Two clauses, two patterns each
        assertEquals(resultType, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType)), MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType))], zeroSpan())));
        // Two clauses, two patterns, one pattern doesn't match:
        assertEquals(null, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType)), MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(otherType), null)], new DummyExpression(resultType))], zeroSpan())));
        // Two clauses, two patterns, one clause doesn't match:
        assertEquals(null, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(otherType), null), new Pattern(new DummyPatternMatch(otherType), null)], new DummyExpression(resultType)), MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType))], zeroSpan())));
        // Two clauses, two patterns, one result doesn't match:
        assertEquals(null, checkConcrete(typeMaker.getTypeManager(), new MatchExpression(zeroSpan(), new DummyExpression(matchType), [MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(resultType)), MatchClause.unrecorded(
            [new Pattern(new DummyPatternMatch(matchType), null), new Pattern(new DummyPatternMatch(matchType), null)], new DummyExpression(otherType))], zeroSpan())));
    });

    test("checkUnits", () =>
    {
        const m = DummyManager.make().getUnitManager().loadUse("m");
        checkConcreteType(DataType.BOOLEAN, "1 < 2");
        checkConcreteType(DataType.BOOLEAN, "1 < 2{m}");
        checkConcreteType(DataType.BOOLEAN, "1 < 2{m} <= 3");
        checkConcreteType(DataType.BOOLEAN, "1 = 2");
        checkConcreteType(DataType.BOOLEAN, "1 = 2{m}");
        checkConcreteType(DataType.NUMBER, "1 + 2");
        checkConcreteType(DataType.number(new NumberInfo(m)), "1 + 2{m}");
        checkConcreteType(DataType.number(new NumberInfo(m)), "1 * 2{m}");
        checkConcreteType(DataType.NUMBER, "1 * 2");
        checkConcreteType(null, "@call function\\\\abs(1) + 2{m}");
        checkConcreteType(DataType.number(new NumberInfo(m)), "@call function\\\\abs(1) * 2{m}");
        checkConcreteType(DataType.NUMBER, "@call function\\\\abs(1)");
        checkConcreteType(DataType.number(new NumberInfo(m)), "@call function\\\\abs(1{m})");
        checkConcreteType(record(["a", DataType.NUMBER], ["b", DataType.NUMBER]), "(a:1, b:2{1})");
    });

    test("checkFromTextFunctions", () =>
    {
        checkConcreteType(DataType.BOOLEAN, "@call function\\\\from text to(type{Boolean}, \"true\")");
    });

    test("checkFromTextFunctions2", () =>
    {
        checkConcreteType(m => TBasicUtil.checkNonNull(m.lookupType(new TypeId(id("A")), [])), "@call function\\\\from text to(type{A}, \"Hello\")");
    });

    test("checkNestedFunctions", () =>
    {
        checkConcreteType(m => TBasicUtil.checkNonNull(m.lookupType(new TypeId(id("A")), [])), "@call function\\\\from text to(type{A}, @call function\\\\from text to(type{Text}, \"Hello\"))");
    });

    test("checkDefine1", () =>
    {
        checkConcreteType(DataType.BOOLEAN, "@define x = true @then x @enddefine");
    });

    test("checkDefine2", () =>
    {
        checkConcreteType(m => m.getMaybeType().instantiate([Either.right(DataType.number(new NumberInfo(m.getUnitManager().loadUse("m"))))], m), "@define dist = (1 * 32{m/s} * 10{s}) @then @call tag\\\\Optional\\Is(dist * 3) @enddefine");
    });

    test("checkDefine2b", () =>
    {
        checkConcreteType(m => m.getMaybeType().instantiate([Either.right(DataType.number(new NumberInfo(m.getUnitManager().loadUse("m"))))], m), "@define dist :: type{Number{m}}, dist = (1 * 32{m/s} * 10{s}) @then @call tag\\\\Optional\\Is(dist * 3) @enddefine");
    });

    test("checkDefine3", () =>
    {
        checkConcreteType(DataType.BOOLEAN, "@define a :: type{Boolean}, b :: type{Boolean}, [a, b] = [true, false] @then a & b @enddefine");
    });

    test("checkDefine3b", () =>
    {
        checkConcreteType(DataType.BOOLEAN, "@define a :: type{Boolean}, b :: type{Boolean}, (y:a, x:b) = (x:true, y:false) @then a & b @enddefine");
    });

    test("checkDefine4", () =>
    {
        checkConcreteType(DataType.BOOLEAN, "@define a :: type{Boolean}, a = @call function\\\\from text(\"\"), b = a @then b @enddefine");
    });

    test("checkDefineErr1", () =>
    {
        checkConcreteType(null, "@define x = x @then x @enddefine");
    });

    test("checkDefineErr2", () =>
    {
        checkConcreteType(null, "@define x = [] @then x @enddefine");
    });

    test("checkDefineErr3", () =>
    {
        // Typing variable we don't define
        checkConcreteType(null, "@define dist2 :: type{@apply Optional(Number{m})}, dist = (1 * 32{m/s} * 10{s}) @then @call tag\\\\Optional\\Is(dist * 3) @enddefine");
    });

    test("checkDefineErr3b", () =>
    {
        // Type after definition
        checkConcreteType(null, "@define dist = (1 * 32{m/s} * 10{s}), dist :: type{@apply Optional(Number{m})} @then @call tag\\\\Optional\\Is(dist * 3) @enddefine");
    });

    test("checkDefineErr4", () =>
    {
        // Duplicate definition:
        checkConcreteType(null, "@define x = 1, x = 1 @then x @enddefine");
    });

    test("checkDefineErr5", () =>
    {
        // Duplicate definition incl type:
        checkConcreteType(null, "@define x :: type{Number}, x = 1, x = 1 @then x @enddefine");
    });

    test("checkFunction1", () =>
    {
        checkConcreteType(DataType.NUMBER, "@define f = (? + 1) @then @call f(3) @enddefine");
    });

    test("checkFunction1b", () =>
    {
        checkConcreteType(DataType.NUMBER, "@define f :: type{@apply Function(Number)(Number)}, f = (? + 1) @then @call f(3) @enddefine");
    });

    test("checkFunction2", () =>
    {
        checkConcreteType(DataType.NUMBER, "@define f = @function (x) @then x + 1 @endfunction @then @call f(3) @enddefine");
    });

    test("checkFunction2b", () =>
    {
        checkConcreteType(DataType.NUMBER, "@define f :: type{@apply Function(Number)(Number)}, f = @function (x) @then x + 1 @endfunction @then @call f(3) @enddefine");
    });

    test("checkRecord1", () =>
    {
        checkConcreteType(record(["a", DataType.NUMBER], ["b", DataType.TEXT]), "(a : 3, b : \"Hi\")");
    });

    test("checkRecord2", () =>
    {
        checkConcreteType(DataType.array(record(["a", DataType.NUMBER], ["b", DataType.TEXT])), "[(a : 3, b : \"Hi\"), (b : \"\", a: (3 * 4))]");
    });

    test("checkRecord3", () =>
    {
        checkConcreteType(null, "[(a : 3, b : \"Hi\"), (b : \"\")]");
    });

    test("checkRecord3b", () =>
    {
        checkConcreteType(null, "[(a : 3, b : \"Hi\"), (a: true, b : \"\")]");
    });

    test("checkField", () =>
    {
        checkConcreteType(DataType.TEXT, "(a : 3, b : \"Hi\")#b");
    });

    test("checkField2", () =>
    {
        checkConcreteType(DataType.TEXT, "@define var\\\\abs = [(a : 3, b : \"Hi\"), (b : \"\", a: (3 * 4))] @then @call function\\\\element(var\\\\abs, 1)#b @enddefine");
    });

    test("checkField3", () =>
    {
        checkConcreteType(m => DataType.number(new NumberInfo(m.getUnitManager().loadUse("m").times(m.getUnitManager().loadUse("inch")))), "@define record = (x: 36{m}, y : 37{inch}), getX = (?#x) , getY = (?#y) @then @call getX(record) * @call getY(record) @enddefine");
    });


});
