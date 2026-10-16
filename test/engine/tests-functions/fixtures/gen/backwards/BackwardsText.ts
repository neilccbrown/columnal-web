// Port of test.gen.backwards.BackwardsText (tests-functions testFixtures).
import { StringConcatExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { codePoints, stringFromCodePoints } from "../../../../../../src/engine/java/JavaCharacter.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsText extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        if (!targetType.equals(DataType.TEXT))
            return [];

        return [() => {
            const numOperands = this.r.nextInt(2, 5);
            const breakpoints: number[] = [];
            const codepoints = codePoints(targetValue as string);
            for (let i = 0; i < numOperands - 1; i++)
            {
                breakpoints.push(this.r.nextInt(0, codepoints.length));
            }
            breakpoints.sort((a, b) => a - b);
            //Simplify following code by adding start and end index to list:
            breakpoints.unshift(0);
            breakpoints.push(codepoints.length);
            const operands: Expression[] = [];
            for (let i = 0; i < numOperands; i++)
            {
                const e = this.parent.make(DataType.TEXT, stringFromCodePoints(codepoints, breakpoints[i]!, breakpoints[i + 1]! - breakpoints[i]!), maxLevels - 1);
                operands.push(e);
            }
            return new StringConcatExpression(operands);
        }];
    }
}
