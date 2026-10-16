// Port of xyz.columnal.transformations.expression.UnitRaiseExpression (expressions module).
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { Expression } from "./Expressions.js";
import { UnitExpression, UnitExpressionIntLiteral } from "./UnitExpressions.js";

export class UnitRaiseExpression extends UnitExpression
{
    private readonly unit: UnitExpression;
    private readonly power: UnitExpression;

    public constructor(unit: UnitExpression, power: UnitExpression)
    {
        super();
        this.unit = unit;
        this.power = power;
    }

    public override asUnit(unitManager: UnitManager): JellyUnit
    {
        if (!(this.power instanceof UnitExpressionIntLiteral))
        {
            throw new UnitExpression.UnitLookupException(StyledString.s("Units can only be raised to integer powers"), this, []);
        }

        const lhs = this.unit.asUnit(unitManager);

        return lhs.raiseBy(this.power.getNumber());
    }

    public override save(saveDestination: Expression.SaveDestination, _topLevel: boolean): string
    {
        return this.unit.save(saveDestination, false) + "^" + this.power.save(saveDestination, false);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitRaiseExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!this.power.equals(that.power)) return false;
        return this.unit.equals(that.unit);
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override isScalar(): boolean
    {
        return false;
    }

    public override hashCode(): number
    {
        let result = this.unit.hashCode();
        result = (Math.imul(31, result) + this.power.hashCode()) | 0;
        return result;
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new UnitRaiseExpression(this.unit.replaceSubExpression(toReplace, replaceWith), this.power.replaceSubExpression(toReplace, replaceWith));
    }
}
