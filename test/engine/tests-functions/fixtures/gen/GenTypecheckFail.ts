// Port of test.gen.GenTypecheckFail (tests-functions testFixtures).
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import { ArrayExpression, type Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import { TypeExp } from "../../../../../src/engine/types/typeExp/TypeExps.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { DummyManager } from "../DummyManager.js";
import { TFunctionUtil } from "../functions/TFunctionUtil.js";
import { SingleTableLookup } from "../SingleTableLookup.js";
import { GenExpressionValueForwards } from "./GenExpressionValueForwards.js";

/**
 * Created by neil on 10/12/2016.
 */
export class GenTypecheckFail extends Generator<GenTypecheckFail.TypecheckInfo>
{
    private gen!: GenExpressionValueForwards;

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): GenTypecheckFail.TypecheckInfo
    {
        this.gen = new GenExpressionValueForwards();
        const valid = this.gen.generate(r, generationStatus);
        const expression = valid.expression;
        if (null === expression.checkExpression(valid, TFunctionUtil.createTypeState(valid.typeManager), TFunctionUtil.excOnError()))
            throw new Error("Original did not type check: " + expression.toString());
        return this.getTypecheckInfo(r, this.gen, valid.typeManager, expression);
    }

    private getTypecheckInfo(r: SourceOfRandomness, gen: GenExpressionValueForwards, typeManager: TypeManager, expression: Expression): GenTypecheckFail.TypecheckInfo
    {
        const failures: Expression[] = expression._test_allMutationPoints().map(p => {
            const failedCopy = p.getFirst()._test_typeFailure(r.toJDKRandom(), {
                getDifferentType: (type: TypeExp | null): Expression =>
                {
                    if (type === null)
                        throw new Error("Getting different type than failure?");
                    const newType = this.pickTypeOtherThan(type, r);
                    let replacement = gen.makeOfType(newType);
                    // Special case: don't let it be empty array because it may type check
                    // against type even though we don't want it to:
                    while (replacement.getSecond().equals(new ArrayExpression([])))
                    {
                        replacement = gen.makeOfType(newType);
                    }
                    return replacement.getSecond();
                },

                getAnyType: (): Expression =>
                {
                    return gen.makeOfType(this.pickType(r)).getSecond();
                },

                getNonNumericType: (): Expression =>
                {
                    const newType = this.pickNonNumericType(r);
                    return gen.makeOfType(newType).getSecond();
                },

                getType: (mustMatch: (t: DataType) => boolean): Expression =>
                {
                    for (let i = 0; i < 100; i++)
                    {
                        const newType = this.pickType(r);
                        if (mustMatch(newType))
                            return gen.makeOfType(newType).getSecond();
                    }
                    throw new Error("Type predicate too hard to satisfy");
                },

                getTypes: (amount: number, mustMatch: (types: DataType[]) => boolean): Expression[] =>
                {
                    for (let i = 0; i < 100; i++)
                    {
                        const types: DataType[] = [];
                        for (let j = 0; j < amount; j++)
                            types.push(this.pickType(r));
                        if (mustMatch(types))
                        {
                            const expressions: Expression[] = [];
                            for (let j = 0; j < amount; j++)
                                expressions.push(gen.makeOfType(types[j]!).getSecond());
                            return expressions;
                        }
                    }
                    throw new Error("Type predicate too hard to satisfy");
                },

                makeArrayExpression: (items: readonly Expression[]): Expression =>
                {
                    return new ArrayExpression(items);
                },

                getTypeManager: (): TypeManager =>
                {
                    return DummyManager.make().getTypeManager();
                },
            }, DummyManager.make().getUnitManager());
            if (failedCopy === null)
                return null;
            else
            {
                const failedFull = p.getSecond()(failedCopy);
                if (failedFull.toString() === expression.toString())
                {
                    console.error("Error in GenTypecheckFail: converted expression to itself");
                }
                return failedFull;
            }
        }).filter((p): p is Expression => p !== null);

        return new GenTypecheckFail.TypecheckInfo(expression, gen.getRecordSet(), failures, typeManager, gen);
    }

    public override doShrink(random: SourceOfRandomness, larger: GenTypecheckFail.TypecheckInfo): GenTypecheckFail.TypecheckInfo[]
    {
        return larger.original._test_childMutationPoints().map(p => p.getFirst())
            .map(e => this.getTypecheckInfo(random, larger.gen, larger.typeManager, e));
    }

    private pickType(r: SourceOfRandomness): DataType
    {
        return this.gen.makeType(r);
    }

    private pickTypeOtherThan(type: TypeExp | null, r: SourceOfRandomness): DataType
    {
        let picked: DataType;
        do
        {
            picked = this.pickType(r);
        }
        while (type !== null && TypeExp.unifyTypes(type, TypeExp.fromDataType(null, picked)).isRight());
        return picked;
    }

    private pickNonNumericType(r: SourceOfRandomness): DataType
    {
        let picked: DataType;
        do
        {
            picked = this.pickType(r);
        }
        while (DataTypeUtility.isNumber(picked));
        return picked;

    }
}

export namespace GenTypecheckFail
{
    export class TypecheckInfo extends SingleTableLookup
    {
        public readonly original: Expression;
        public readonly recordSet: RecordSet;
        public readonly expressionFailures: readonly Expression[];
        public readonly gen: GenExpressionValueForwards;
        public readonly typeManager: TypeManager;

        public constructor(original: Expression, recordSet: RecordSet, expressionFailures: readonly Expression[], typeManager: TypeManager, gen: GenExpressionValueForwards)
        {
            super(new TableId("SingleTableLookup"), recordSet);
            this.original = original;
            this.recordSet = recordSet;
            this.expressionFailures = expressionFailures;
            this.typeManager = typeManager;
            this.gen = gen;
        }

        public getDisplay(expression: Expression): string
        {
            let s = "Expression : " + expression.toString();
            s += " col types: ";
            const columns = this.recordSet.getColumns();
            for (let i = 0; i < columns.length; i++)
            {
                const column = columns[i]!;
                s += i + "|" + column.getType().toString() + "  ";
            }
            s += "(Original: " + this.original.toString() + ")";
            return s;
        }
    }
}
