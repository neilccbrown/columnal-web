// Port of test.gen.backwards.BackwardsBooleans (tests-functions testFixtures).
import { AndExpression, BooleanLiteral, CallExpression, ComparisonExpression, EqualExpression, NotEqualExpression, OrExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

const ComparisonOperator = ComparisonExpression.ComparisonOperator;
type ComparisonOperator = ComparisonExpression.ComparisonOperator;

export class BackwardsBooleans extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        if (targetType.equals(DataType.BOOLEAN))
        {
            const b = targetValue as boolean;
            return [
                () => this.and(maxLevels, b),
                () => this.or(maxLevels, b),
                () => this.not(maxLevels, b),
                () => this.xor(maxLevels, b),
                () => this.eq(maxLevels, b),
                () => this.neq(maxLevels, b),
                () => this.cmp(maxLevels, b),
            ];
        }
        return [];
    }

    private cmp(maxLevels: number, target: boolean): Expression
    {
            // First form a valid set of values and sort them into order
            const ascending = this.r.nextBoolean();
            const dataType = this.parent.makeType();
            const operands: Pair<Value, Expression>[] = [...TBasicUtil.makeList(this.r, 2, 5, () => {
                const value = this.parent.makeValue(dataType);
                return new Pair<Value, Expression>(value, this.parent.make(dataType, value, maxLevels - 1));
            })];
            operands.sort((a, b) => Utility.compareValues(a.getFirst(), b.getFirst()) * (ascending ? 1 : -1));
            const ops: ComparisonOperator[] = [];
            for (let i = 0; i < operands.length - 1; i++)
            {
                // We may have randomly generated equal values, so check for that and adjust
                // operator to the or-equals variant if necessary:
                ops.push(
                        Utility.compareValues(operands[i]!.getFirst(), operands[i + 1]!.getFirst()) === 0 ?
                                (ascending ? ComparisonOperator.LESS_THAN_OR_EQUAL_TO : ComparisonOperator.GREATER_THAN_OR_EQUAL_TO)
                                : (ascending ? ComparisonOperator.LESS_THAN : ComparisonOperator.GREATER_THAN));
            }
            // Randomly duplicate a value and change to <=/>=:
            const swap = this.r.nextInt(0, operands.length - 2); // Picking operator really, not operand
            // Copy from left to right or right to left:
            if (this.r.nextBoolean())
            {
                // Copy from right to left:
                const newTarget = operands[swap + 1]!.getFirst();
                operands[swap] = new Pair<Value, Expression>(newTarget, this.parent.make(dataType, newTarget, maxLevels - 1));
                ops[swap] = ascending ? ComparisonOperator.LESS_THAN_OR_EQUAL_TO : ComparisonOperator.GREATER_THAN_OR_EQUAL_TO;
            }
            else
            {
                // Copy from left to right:
                const newTarget = operands[swap]!.getFirst();
                operands[swap + 1] = new Pair<Value, Expression>(newTarget, this.parent.make(dataType, newTarget, maxLevels - 1));
                ops[swap] = ascending ? ComparisonOperator.LESS_THAN_OR_EQUAL_TO : ComparisonOperator.GREATER_THAN_OR_EQUAL_TO;
            }
            // If we are aiming for true, job done.
            if (!target)
            {
                // Need to make it false by swapping two adjacent values (and getting rid of <=/>=)
                const falsifyOp = this.r.nextInt(0, operands.length - 2); // Picking operator really, not operand
                const temp = operands[falsifyOp]!;
                operands[falsifyOp] = operands[falsifyOp + 1]!;
                operands[falsifyOp + 1] = temp;
                ops[falsifyOp] = ascending ? ComparisonOperator.LESS_THAN : ComparisonOperator.GREATER_THAN;
            }
            return new ComparisonExpression(Utility.mapList(operands, p => p.getSecond()), ops);
    }

    private neq(maxLevels: number, target: boolean): Expression
    {
        const t = this.parent.makeType();
        const valA = this.parent.makeValue(t);
        let valB: Value;
        let attempts = 0;
        do
        {
            valB = this.parent.makeValue(t);
            if (attempts++ >= 100)
                return new BooleanLiteral(target);
        }
        while (Utility.compareValues(valA, valB) === 0);
        return new NotEqualExpression(this.parent.make(t, valA, maxLevels - 1), this.parent.make(t, target ? valB : valA, maxLevels - 1));
    }

    private eq(maxLevels: number, target: boolean): Expression
    {
        const size = this.r.nextInt(2, 5);
        const expressions: Expression[] = [];
        const t = this.parent.makeType();
        if (target)
        {
            const valA = this.parent.makeValue(t);
            for (let i = 0; i < size; i++)
            {
                expressions.push(this.parent.make(t, valA, maxLevels - 1));
            }
            return new EqualExpression(expressions, false);
        }
        else
        {
            // To provide a good test, we make an initial value, plus
            // somewhere between 0 and size - 2 (incl) duplicates,
            // then the remaining 1 to size - 1 (incl) are different than original
            // (may be same as each other by coincidence, but that's okay)
            const valA = this.parent.makeValue(t);
            const sameAsA = this.r.nextInt(1, size - 1);
            for (let i = 0; i < sameAsA; i++)
            {
                expressions.push(this.parent.make(t, valA, maxLevels - 1));
            }
            while (expressions.length < size)
            {
                let diffValFromA: Value;
                let attempts = 0;
                do
                {
                    diffValFromA = this.parent.makeValue(t);
                    if (attempts++ >= 100)
                        return new BooleanLiteral(target);
                }
                while (Utility.compareValues(valA, diffValFromA) === 0);
                expressions.push(this.parent.make(t, diffValFromA, maxLevels - 1));
            }
        }
        return new EqualExpression(expressions, false);
    }

    private xor(maxLevels: number, b: boolean): Expression
    {
        // Randomly pick LHS:
        const lhs = this.r.nextBoolean();
        // If b == true, rhs == !lhs.  If b == false, rhs == lhs
        const rhs = b ? !lhs : lhs;

        return new CallExpression(FunctionList.getFunctionLookup(this.parent.getTypeManager().getUnitManager()), "xor",
            this.parent.make(DataType.BOOLEAN, lhs, maxLevels -1),
            this.parent.make(DataType.BOOLEAN, rhs, maxLevels -1));
    }

    private not(maxLevels: number, b: boolean): Expression
    {
        return this.call("not", this.parent.make(DataType.BOOLEAN, !b, maxLevels -1));
    }

    private or(maxLevels: number, b: boolean): Expression
    {
        // If target is false, all must be false:
        if (!b)
            return new OrExpression(TBasicUtil.makeList(this.r, 2, 5, () => this.parent.make(DataType.BOOLEAN, false, maxLevels - 1)));
            // Otherwise they can take on random values, but one must be false:
        else
        {
            const size = this.r.nextInt(2, 5);
            const mustBeTrue = this.r.nextInt(0, size - 1);
            const exps: Expression[] = [];
            for (let i = 0; i < size; i++)
                exps.push(this.parent.make(DataType.BOOLEAN, mustBeTrue === i ? true : this.r.nextBoolean(), maxLevels - 1));
            return new OrExpression(exps);
        }
    }

    private and(maxLevels: number, b: boolean): Expression
    {
        // If target is true, all must be true:
        if (b)
            return new AndExpression(TBasicUtil.makeList(this.r, 2, 5, () => this.parent.make(DataType.BOOLEAN, true, maxLevels - 1)));
            // Otherwise they can take on random values, but one must be false:
        else
        {
            const size = this.r.nextInt(2, 5);
            const mustBeFalse = this.r.nextInt(0, size - 1);
            const exps: Expression[] = [];
            for (let i = 0; i < size; i++)
                exps.push(this.parent.make(DataType.BOOLEAN, mustBeFalse === i ? false : this.r.nextBoolean(), maxLevels - 1));
            return new AndExpression(exps);
        }

    }
}
