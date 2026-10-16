// Port of xyz.columnal.transformations.expression.UnitExpressionIntLiteral (expressions module).
import { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { Expression } from "./Expressions.js";
import { UnitExpression } from "./UnitExpressions.js";

export class UnitExpressionIntLiteral extends UnitExpression
{
    private readonly number: number;

    public constructor(number: number)
    {
        super();
        this.number = number;
    }

    public override asUnit(_unitManager: UnitManager): JellyUnit
    {
        if (this.number === 1)
            return JellyUnit.fromConcrete(Unit.SCALAR);
        else
            throw new UnitExpression.UnitLookupException(StyledString.s("Expected unit not number"), this, []);
    }

    public override save(_saveDestination: Expression.SaveDestination, _topLevel: boolean): string
    {
        return this.number.toString();
    }

    public getNumber(): number
    {
        return this.number;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitExpressionIntLiteral) || o.constructor !== this.constructor) return false;

        const that = o;

        return this.number === that.number;
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override isScalar(): boolean
    {
        return this.number === 1;
    }

    public override hashCode(): number
    {
        return this.number | 0;
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        return this === toReplace ? replaceWith : this;
    }
}
