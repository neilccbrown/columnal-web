// Port of xyz.columnal.transformations.expression.UnitTimesExpression (expressions module).
import { javaHashCode } from "../../../java/JavaObject.js";
import { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { javaEquals } from "../../../java/JavaObject.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Expression } from "./Expressions.js";
import { UnitExpression } from "./UnitExpressions.js";

export class UnitTimesExpression extends UnitExpression
{
    private readonly operands: readonly UnitExpression[];

    public constructor(operands: readonly UnitExpression[])
    {
        super();
        this.operands = operands;
    }

    public override asUnit(unitManager: UnitManager): JellyUnit
    {
        let r = JellyUnit.fromConcrete(Unit.SCALAR);
        for (const operand of this.operands)
        {
            r = r.times(operand.asUnit(unitManager));
        }
        return r;
    }

    public override save(saveDestination: Expression.SaveDestination, topLevel: boolean): string
    {
        let b = "";
        if (!topLevel)
            b += "(";
        for (let i = 0; i < this.operands.length; i++)
        {
            b += this.operands[i]!.save(saveDestination, false);
            if (i < this.operands.length - 1)
            {
                b += "*";
            }
        }
        if (!topLevel)
            b += ")";
        return b;
    }

    public getOperands(): readonly UnitExpression[]
    {
        return this.operands;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitTimesExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return javaEquals(this.operands, that.operands);
    }

    public override isEmpty(): boolean
    {
        return this.operands.length === 0 || (this.operands.length === 1 && this.operands[0]!.isEmpty());
    }

    public override isScalar(): boolean
    {
        return this.operands.length === 1 && this.operands[0]!.isScalar();
    }

    public override hashCode(): number
    {
        return javaHashCode(this.operands);
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new UnitTimesExpression(Utility.mapListI(this.operands, t => t.replaceSubExpression(toReplace, replaceWith)));
    }
}
