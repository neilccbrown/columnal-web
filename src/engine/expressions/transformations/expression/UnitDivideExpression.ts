// Port of xyz.columnal.transformations.expression.UnitDivideExpression (expressions module).
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import type { Expression } from "./Expressions.js";
import { UnitExpression } from "./UnitExpressions.js";

export class UnitDivideExpression extends UnitExpression
{
    private readonly numerator: UnitExpression;
    private readonly denominator: UnitExpression;

    public constructor(numerator: UnitExpression, denominator: UnitExpression)
    {
        super();
        this.numerator = numerator;
        this.denominator = denominator;
    }

    public override asUnit(unitManager: UnitManager): JellyUnit
    {
        const num = this.numerator.asUnit(unitManager);
        const den = this.denominator.asUnit(unitManager);

        return num.divideBy(den);
    }

    public override save(saveDestination: Expression.SaveDestination, topLevel: boolean): string
    {
        const core = this.numerator.save(saveDestination, false) + "/" + this.denominator.save(saveDestination, false);
        if (topLevel)
            return core;
        else
            return "(" + core + ")";
    }

    public getNumerator(): UnitExpression
    {
        return this.numerator;
    }

    public getDenominator(): UnitExpression
    {
        return this.denominator;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitDivideExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        if (!this.numerator.equals(that.numerator)) return false;
        return this.denominator.equals(that.denominator);
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
        let result = this.numerator.hashCode();
        result = (Math.imul(31, result) + this.denominator.hashCode()) | 0;
        return result;
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new UnitDivideExpression(this.numerator.replaceSubExpression(toReplace, replaceWith), this.denominator.replaceSubExpression(toReplace, replaceWith));
    }
}
