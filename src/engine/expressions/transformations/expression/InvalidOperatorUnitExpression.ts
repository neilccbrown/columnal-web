// Port of xyz.columnal.transformations.expression.InvalidOperatorUnitExpression (expressions module).
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Expression } from "./Expressions.js";
import { UnitExpression } from "./UnitExpressions.js";

export class InvalidOperatorUnitExpression extends UnitExpression
{
    private readonly items: readonly UnitExpression[];

    public constructor(items: readonly UnitExpression[])
    {
        super();
        this.items = items;
    }

    public override asUnit(_unitManager: UnitManager): JellyUnit
    {
        throw new UnitExpression.UnitLookupException(null, this, []);
    }

    public override save(saveDestination: Expression.SaveDestination, _topLevel: boolean): string
    {
        if (saveDestination.needKeywords())
            return "@INVALIDOPS (" +
                this.items.map(item => item.save(saveDestination, false)).join(", ")
                + ")";
        else
            return this.items.map(item => item.save(saveDestination, false)).join("");
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof InvalidOperatorUnitExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return javaEquals(this.items, that.items);
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
        return javaHashCode(this.items);
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new InvalidOperatorUnitExpression(Utility.mapListI(this.items, e => e.replaceSubExpression(toReplace, replaceWith)));
    }
}
