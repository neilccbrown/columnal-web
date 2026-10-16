// Port of test.gen.backwards.BackwardsNumbers (tests-functions testFixtures).
import { AddSubtractExpression, DivideExpression, NumericLiteral, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { Decimal, ONE, ZERO } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../../../../../src/engine/types/data/datatype/NumberInfo.js";
import { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import { Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TFunctionUtil } from "../../functions/TFunctionUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

// The exact sum or difference, as Java's BigDecimal add/subtract without a MathContext
const Exact = Decimal.clone({ precision: 1e9 });

export class BackwardsNumbers extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, type: DataType, targetValue: Value): ExpressionMaker[]
    {
        if (!DataTypeUtility.isNumber(type))
            return [];
        const unit = TFunctionUtil.getUnit(type);
        return [
            () => {
                // We just make up a bunch of numbers, and at the very end we add one more to correct the difference
                const numMiddle = this.r.nextInt(0, 6);
                const expressions: Expression[] = [];
                const addSubtractOps: AddSubtractExpression.AddSubtractOp[] = [];
                let curTotal = this.parent.genInt();
                expressions.push(this.parent.make(type, curTotal, maxLevels - 1));
                for (let i = 0; i < numMiddle; i++)
                {
                    const next = this.parent.genInt();
                    expressions.push(this.parent.make(type, next, maxLevels - 1));
                    const prevTotal = curTotal;
                    if (this.r.nextBoolean())
                    {
                        curTotal = curTotal.plus(next);
                        if (new Exact(prevTotal).plus(next).comparedTo(curTotal) !== 0)
                            throw new Error("Error building expression +");
                        addSubtractOps.push(AddSubtractExpression.AddSubtractOp.ADD);
                    }
                    else
                    {
                        curTotal = curTotal.minus(next);
                        if (new Exact(prevTotal).minus(next).comparedTo(curTotal) !== 0)
                            throw new Error("Error building expression +");
                        addSubtractOps.push(AddSubtractExpression.AddSubtractOp.SUBTRACT);
                    }
                }
                // Now add one more to make the difference:
                const diff = (targetValue as Decimal).minus(curTotal);
                const add = this.r.nextBoolean();
                expressions.push(this.parent.make(type, DataTypeUtility.value(add ? diff : ZERO.minus(diff)), maxLevels - 1));
                addSubtractOps.push(add ? AddSubtractExpression.AddSubtractOp.ADD : AddSubtractExpression.AddSubtractOp.SUBTRACT);
                return new AddSubtractExpression(expressions, addSubtractOps);
            }, () => {
                    // A few options; keep units and value in numerator and divide by 1
                    // Or make random denom, times that by target to get num, and make up crazy units which work
                    if (this.r.nextInt(0, 4) === 0)
                        return new DivideExpression(this.parent.make(type, targetValue, maxLevels - 1), new NumericLiteral(ONE, this.parent.makeUnitExpression(Unit.SCALAR)));
                    else
                    {
                        let denominator: Decimal;
                        do
                        {
                            denominator = this.parent.genInt();
                        }
                        while (Utility.compareNumbers(denominator, ZERO) === 0);
                        const numerator = Utility.multiplyNumbers(targetValue as Decimal, DataTypeUtility.value(denominator));
                        if (Utility.compareNumbers(Utility.divideNumbers(numerator, DataTypeUtility.value(denominator)), targetValue as Decimal) !== 0)
                        {
                            // Divide won't come out right: just divide by 1:
                            return new DivideExpression(this.parent.make(type, targetValue, maxLevels - 1), new NumericLiteral(ONE, this.parent.makeUnitExpression(Unit.SCALAR)));
                        }

                        // Either just use numerator, or make up crazy one
                        const numUnit = this.r.nextBoolean() ? unit : this.makeUnit();
                        const denomUnit = this.calculateRequiredMultiplyUnit(numUnit, unit).reciprocal();
                        // TODO test division by zero behaviour (test errors generally)
                        return new DivideExpression(this.parent.make(DataType.number(new NumberInfo(numUnit)), numerator, maxLevels - 1), this.parent.make(DataType.number(new NumberInfo(denomUnit)), denominator, maxLevels - 1));
                    }
                },
        ];
    }

    // What unit do you have to multiply src by to get dest?
    private calculateRequiredMultiplyUnit(src: Unit, dest: Unit): Unit
    {
        // So we have src * x = dest
        // This can be rearranged to x = dest/src
        return dest.divideBy(src);
    }

    private makeUnit(): Unit
    {
        return this.r.choose([
            this.getUnit("m"),
            this.getUnit("cm"),
            this.getUnit("inch"),
            this.getUnit("g"),
            this.getUnit("kg"),
            this.getUnit("deg"),
            this.getUnit("s"),
            this.getUnit("hour"),
            this.getUnit("USD"),
        ]);
    }
}
