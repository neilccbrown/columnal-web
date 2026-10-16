// Port of test.PropTypecheck (tests-functions).
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { ErrorAndTypeRecorder } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorder.js";
import { ErrorAndTypeRecorderStorer } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { QuickFix } from "../../../src/engine/expressions/transformations/expression/QuickFix.js";
import { javaEnumValues } from "../../../src/engine/java/JavaEnum.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DataTypeValue, GetValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import type { TemporalAccessor } from "../../../src/engine/java/time/TemporalAccessor.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import type { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { OutputBuilder } from "../../../src/engine/types/loadsave/OutputBuilder.js";
import { TypeExp } from "../../../src/engine/types/typeExp/TypeExps.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../src/engine/utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../src/engine/utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../src/engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import { assertEquals, assertNotEquals, assertNull, assertTrue } from "../../support/junit.js";
import { CompositeGenerator, EnumGenerator, propertyTest, SourceOfRandomness, type Generator } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { GenUnit } from "../tests-basic/fixtures/gen/GenUnit.js";
import { DummyManager } from "./fixtures/DummyManager.js";
import { TFunctionUtil } from "./fixtures/functions/TFunctionUtil.js";
import type { ExpressionValue } from "./fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "./fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "./fixtures/gen/GenExpressionValueForwards.js";
import { GenTypecheckFail } from "./fixtures/gen/GenTypecheckFail.js";
import { GenDataTypeMaker } from "./fixtures/gen/type/GenDataTypeMaker.js";

// Java: @From(Ctor.class) DateTimeInfo, which calls new DateTimeInfo(DateTimeType) with a generated type
class GenDateTimeInfo extends EnumGenerator<DateTimeInfo>
{
    public constructor()
    {
        super(javaEnumValues<DateTimeInfo.DateTimeType>(DateTimeInfo.DateTimeType).map(t => new DateTimeInfo(t)));
    }
}

/**
 * Created by neil on 09/12/2016.
 */
describe("PropTypecheck", () =>
{
    test("testTypeComparison", () =>
    {
        const types = TFunctionUtil.managerWithTestTypes().getSecond();
        for (const a of types)
        {
            for (const b of types)
            {
                assertEqualIfSame(a, b);
            }
        }
    });

    // This won't test tagged types very well, but it should do okay for numbers, etc
    propertyTest("testTypeHashCodeAndEquals", [new GenDataTypeMaker()], (typeMaker: GenDataTypeMaker.DataTypeMaker) =>
    {
        const a = typeMaker.makeType().getDataType();
        const b = typeMaker.makeType().getDataType();
        assertTrue(a.equals(a));
        assertTrue(b.equals(b));
        assertEquals(a.hashCode(), a.hashCode());
        assertEquals(b.hashCode(), b.hashCode());
        const aSaved = a.save(new OutputBuilder()).toString();
        const bSaved = b.save(new OutputBuilder()).toString();
        assertEquals(aSaved + " =?= " + bSaved, a.equals(b), aSaved === bSaved);
        if (aSaved === bSaved)
            assertEquals(aSaved, a.hashCode(), b.hashCode());
    }, { trials: 10000 });

    function assertEqualIfSame(a: DataType, b: DataType): void
    {
        // Equivalent to assertEquals(a == b, a.equals(b)) but gives better errors
        if (a === b)
        {
            assertEquals("Should be equal: " + a.toString() + " versus " + b.toString(), a, b);
        }
        else
        {
            assertNotEquals("Should not be equal: " + a.toString() + " versus " + b.toString(), a, b);
        }
    }

    propertyTest("propTypeCheckFail", [new GenTypecheckFail()], (src: GenTypecheckFail.TypecheckInfo) =>
    {
        for (const expression of src.expressionFailures)
        {
            let errorReported = false;
            assertNull(src.getDisplay(expression), expression.checkExpression(src, TFunctionUtil.createTypeState(src.typeManager), new class extends ErrorAndTypeRecorder
            {
                protected override recordErrorMessage<E>(_src: E, _error: StyledString): void
                {
                    errorReported = true;
                }

                public override recordInformation<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _information: Pair<StyledString, QuickFix<EXPRESSION> | null>): void
                {
                }

                public override recordQuickFixes<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _quickFixes: readonly QuickFix<EXPRESSION>[]): void
                {
                }

                public override recordTypeNN(_expression: Expression, typeExp: TypeExp): TypeExp
                {
                    return typeExp;
                }
            }()));
            // If it was null, an error should also have been reported:
            assertTrue(src.getDisplay(expression) + "\n\n(failure from original: " + src.getDisplay(src.original) + ")", errorReported);
        }
    // The slowest property: each trial generates an expression and type checks every mutation of it
    // (about 25 seconds locally, and CI is up to twice as slow).
    }, { trials: 1000, timeout: 180_000 });

    propertyTest("propTypeCheckSucceed", [new CompositeGenerator<ExpressionValue>([new GenExpressionValueBackwards(), new GenExpressionValueForwards()])], (src: ExpressionValue) =>
    {
        const storer = new ErrorAndTypeRecorderStorer();
        const checked = src.expression.checkExpression(src, TFunctionUtil.createTypeState(src.typeManager), storer);
        const srcTypeExp = TypeExp.fromDataType(null, src.type);
        assertEquals(src.expression.toString() + "\n" + storer.getAllErrors().map(e => e.toPlain()).join("\n") + "\nCol types: " + src.recordSet.getColumns().map(c => c.getType().toString()).join(", "), Either.right(src.type), checked === null ? null : TypeExp.unifyTypes(srcTypeExp, checked).eitherEx<Either<unknown, DataType>>(err => Either.left(err), t => t.toConcreteType(src.typeManager)));
    }, { trials: 1000 });

    propertyTest("checkNumber", [new GenUnit(), new GenUnit()], (unitA: Unit, unitB: Unit) =>
    {
        // TODO test with non-null NumberDisplayInfo
        assertEquals(new NumberInfo(unitA), new NumberInfo(unitA));
        assertEquals(new NumberInfo(unitB), new NumberInfo(unitB));

        const numberA = DataType.number(new NumberInfo(unitA));
        const numberB = DataType.number(new NumberInfo(unitB));
        DataTypeValue.number(new NumberInfo(unitA), GetValue.of((_i: number, _prog: unknown) => DataTypeUtility.value(ZERO)));
        DataTypeValue.number(new NumberInfo(unitB), GetValue.of((_i: number, _prog: unknown) => DataTypeUtility.value(ZERO)));

        const same = unitA.equals(unitB);

        checkSameRelations(DummyManager.make().getTypeManager(), numberA, numberB, same);
    });

    test("checkBool", () =>
    {
        checkSameRelations(DummyManager.make().getTypeManager(), DataType.BOOLEAN, DataType.BOOLEAN, true);
    });

    test("checkText", () =>
    {
        checkSameRelations(DummyManager.make().getTypeManager(), DataType.TEXT, DataType.TEXT, true);
    });

    propertyTest("checkDate", [new GenDateTimeInfo(), new GenDateTimeInfo()], (dateTimeInfoA: DateTimeInfo, dateTimeInfoB: DateTimeInfo) =>
    {
        const dateA = DataType.date(dateTimeInfoA);
        const dateB = DataType.date(dateTimeInfoB);
        DataTypeValue.date(dateTimeInfoA, GetValue.of((_i: number, _prog: unknown): TemporalAccessor => {throw new InternalException("");}));
        DataTypeValue.date(dateTimeInfoB, GetValue.of((_i: number, _prog: unknown): TemporalAccessor => {throw new InternalException("");}));

        const same = dateTimeInfoA.sameType(dateTimeInfoB);

        checkSameRelations(DummyManager.make().getTypeManager(), dateA, dateB, same);
    });

    propertyTest("checkTuple", [new GenDataTypeMaker(), new GenRandom()], (typeMaker: GenDataTypeMaker.DataTypeMaker, r: JavaRandom) =>
    {
        const types = TBasicUtil.makeList(new SourceOfRandomness(r), 1, 10, () => typeMaker.makeType().getDataType());

        const namesA: ExpressionIdentifier[] = Utility.replicateM(types.length, () => TBasicUtil.generateExpressionIdentifier(new SourceOfRandomness(r)));
        if (new Set(namesA).size !== namesA.length)
            return;
        const namesB: ExpressionIdentifier[] = r.nextInt(4) === 1 ? namesA : Utility.replicateM(types.length, () => TBasicUtil.generateExpressionIdentifier(new SourceOfRandomness(r)));
        if (new Set(namesB).size !== namesB.length)
            return;

        const a = DataType.record(new Map(types.map((t, i) => [namesA[i]!, t] as const)));
        const b = DataType.record(new Map(types.map((t, i) => [namesB[i]!, t] as const)));

        // Same only if each name is the same:
        // (Miniscule chance that names will be permutations of each other in exact same way as types permute each other)
        checkSameRelations(typeMaker.getTypeManager(), a, b, namesA.length === namesB.length && namesA.every((n, i) => n === namesB[i]));
    });

    propertyTest("checkArray", [new GenDataTypeMaker()], (typeMaker: GenDataTypeMaker.DataTypeMaker) =>
    {
        const innerA = typeMaker.makeType().getDataType();
        const innerB = typeMaker.makeType().getDataType();
        const typeA = DataType.array(innerA);
        const typeB = DataType.array(innerB);
        checkSameRelations(typeMaker.getTypeManager(), typeA, typeB, innerA.equals(innerB));
    });

    propertyTest("checkTagged", [new GenDataTypeMaker.GenTaggedType() as Generator<GenDataTypeMaker.DataTypeMaker>], (typeMaker: GenDataTypeMaker.DataTypeMaker) =>
    {
        const typeA = typeMaker.makeType().getDataType();
        const typeB = typeMaker.makeType().getDataType();
        // Is equals right here?
        checkSameRelations(typeMaker.getTypeManager(), typeA, typeB, typeA.equals(typeB));
    });

    /**
     * Checks relations between types are as expected
     * @param typeA The DataType version of A
     * @param typeB The DataType version of B
     * @param same Are A and B the same?
     */
    function checkSameRelations(typeManager: TypeManager, typeA: DataType, typeB: DataType, same: boolean): void
    {
        assertEquals(typeA, typeA);

        assertEquals(typeB, typeB);

        assertEquals(Either.right(typeA), TypeExp.fromDataType(null, typeA).toConcreteType(typeManager));
        assertEquals(Either.right(typeB), TypeExp.fromDataType(null, typeB).toConcreteType(typeManager));

        const expected = same ? typeA : null;

        assertEquals(typeA, unifyList(typeManager, typeA));
        assertEquals(typeB, unifyList(typeManager, typeB));

        assertEquals(typeA, unifyList(typeManager, typeA, typeA));
        assertEquals(typeB, unifyList(typeManager, typeB, typeB));

        assertEquals(expected, unifyList(typeManager, typeA, typeB));
    }

    function unifyList(typeManager: TypeManager, ...types: DataType[]): DataType | null
    {
        return TypeExp.unifyTypes(Utility.mapListInt(types, t => TypeExp.fromDataType(null, t))).eitherEx<DataType | null>(_e => null, t => t.toConcreteType(typeManager).either<DataType | null>(_e => null, x => x));
    }
});
