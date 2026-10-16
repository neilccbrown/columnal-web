// Port of xyz.columnal.transformations.expression.InvalidSingleUnitExpression (expressions module).
import { javaStringHashCode } from "../../../java/JavaObject.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { OutputBuilder } from "../../../types/loadsave/OutputBuilder.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import type { Expression } from "./Expressions.js";
import { SingleUnitExpression, UnitExpression } from "./UnitExpressions.js";

// Same distinction as IdentExpression/InvalidIdentExpression
export class InvalidSingleUnitExpression extends UnitExpression
{
    private readonly name: string;

    public constructor(text: string)
    {
        super();
        this.name = text;
    }

    public override asUnit(_unitManager: UnitManager): JellyUnit
    {
        throw new UnitExpression.UnitLookupException(StyledString.s("Invalid unit name"), this, []);
    }

    public override save(saveDestination: Expression.SaveDestination, _topLevel: boolean): string
    {
        if (saveDestination.needKeywords())
            return "@unfinished "+ OutputBuilder.quoted(this.name);
        else
            return this.name;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof InvalidSingleUnitExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return this.name === that.name;
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
        return javaStringHashCode(this.name);
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        return this === toReplace ? replaceWith : this;
    }

    // IdentExpression if possible, otherwise InvalidIdentExpression
    public static identOrUnfinished(src: string): UnitExpression
    {
        const valid = IdentifierUtility.asUnitIdentifier(src);
        if (valid !== null)
            return new SingleUnitExpression(valid);
        else
            return new InvalidSingleUnitExpression(src);
    }
}
