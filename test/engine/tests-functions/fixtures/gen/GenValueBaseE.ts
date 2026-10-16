// Port of test.gen.GenValueBaseE (tests-functions testFixtures).
import { CallExpression, type Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { SingleUnitExpression, UnitDivideExpression, UnitExpressionIntLiteral, UnitRaiseExpression, UnitTimesExpression, type UnitExpression } from "../../../../../src/engine/expressions/transformations/expression/UnitExpressions.js";
import { FunctionList } from "../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { javaShuffle } from "../../../../../src/engine/java/JavaCollections.js";
import { JavaRandom } from "../../../../../src/engine/java/JavaRandom.js";
import type { SingleUnit } from "../../../../../src/engine/types/data/unit/SingleUnit.js";
import type { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../../../src/engine/types/data/unit/UnitManager.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import { GenValueBase } from "./GenValueBase.js";

export abstract class GenValueBaseE<T> extends GenValueBase<T>
{
    public makeUnitExpression(unit: Unit): UnitExpression
    {
        // TODO make more varied unit expressions which cancel out

        if (unit.getDetails().size === 0)
            return new UnitExpressionIntLiteral(1);

        // TODO add UnitRaiseExpression more (don't always split units into single powers)

        // Flatten into a list of units, true for numerator, false for denom:
        const singleUnits: Pair<SingleUnit, boolean>[] = [...unit.getDetails()].flatMap(([key, value]) => Utility.replicate(Math.abs(value), new Pair<SingleUnit, boolean>(key, value > 0)));

        // Now shuffle them and form a compound expression:
        javaShuffle(singleUnits, new JavaRandom(this.r.nextLong()));

        // If just one, return it:

        let u: UnitExpression;

        if (singleUnits[0]!.getSecond())
            u = new SingleUnitExpression(singleUnits[0]!.getFirst().getName());
        else
        {
            if (this.r.nextBoolean())
                u = new UnitRaiseExpression(new SingleUnitExpression(singleUnits[0]!.getFirst().getName()), new UnitExpressionIntLiteral(-1));
            else
                u = new UnitDivideExpression(new UnitExpressionIntLiteral(1), new SingleUnitExpression(singleUnits[0]!.getFirst().getName()));
        }

        for (let i = 1; i < singleUnits.length; i++)
        {
            const s = singleUnits[i]!;
            const sExp = new SingleUnitExpression(s.getFirst().getName());
            if (s.getSecond())
            {
                // Times.  Could join it to existing one:
                if (u instanceof UnitTimesExpression && this.r.nextBoolean())
                {
                    const prevOperands: UnitExpression[] = [...u.getOperands()];

                    prevOperands.push(sExp);
                    u = new UnitTimesExpression(prevOperands);
                }
                else
                {
                    // Make a new one:
                    let operands: UnitExpression[];
                    if (this.r.nextBoolean())
                        operands = [u, sExp];
                    else
                        operands = [sExp, u];
                    u = new UnitTimesExpression(operands);
                }
            }
            else
            {
                // Divide.  Could join it to existing:
                if (u instanceof UnitDivideExpression && this.r.nextBoolean())
                {
                    const div = u;
                    const newDenom: UnitExpression[] = [div.getDenominator(), sExp];
                    u = new UnitDivideExpression(div.getNumerator(), new UnitTimesExpression(newDenom));
                }
                else
                {
                    u = new UnitDivideExpression(u, sExp);
                }
            }
        }

        return u;
    }

    protected call(name: string, ...args: Expression[]): CallExpression
    {
        return new CallExpression(FunctionList.getFunctionLookup(new UnitManager()), name, ...args);
    }
}
