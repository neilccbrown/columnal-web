// Port of xyz.columnal.transformations.expression.NumericLiteral (expressions module).
import { type Decimal } from "../../../java/JavaBigDecimal.js";
import { javaHashCode } from "../../../java/JavaObject.js";
import { Rational } from "../../../java/Rational.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import { NumTypeExp, type TypeExp } from "../../../types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../types/typeExp/units/UnitExp.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, Literal } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import { UnitExpression } from "./UnitExpressions.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 25/11/2016.
 */
export class NumericLiteral extends Literal
{
    private readonly value: Decimal;
    private readonly unit: UnitExpression | null;

    public constructor(value: Decimal, unit: UnitExpression | null)
    {
        super();
        this.value = value;
        this.unit = unit;
    }

    public override checkType(state: TypeState, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): TypeExp | null
    {
        if (this.unit === null)
        {
            let unit: UnitExp;
            switch (locationInfo)
            {
                case Expression.LocationInfo.UNIT_CONSTRAINED:
                    unit = new UnitExp(new MutUnitVar());
                    break;
                default:
                    unit = UnitExp.SCALAR;
                    break;
            }
            return new NumTypeExp(this, unit);
        }

        try
        {
            const u = this.unit.asUnit(state.getUnitManager());
            return new NumTypeExp(this, u.makeUnitExp(new Map()));
        }
        catch (e)
        {
            if (!(e instanceof UnitExpression.UnitLookupException))
                throw e;
            if (e.errorMessage !== null)
                onError.recordError(e.errorItem, e.errorMessage);
            if (e.quickFixes.length !== 0)
                onError.recordQuickFixes(e.errorItem, e.quickFixes);
            return null;
        }
    }

    // PORT-NOTE: Java makes a Rational from the BigDecimal, or from the long value of a Long; all
    // numbers are decimals here.
    public override constantFold(): Rational | null
    {
        return Rational.ofBigDecimal(this.value);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        return this.result(this.value, state);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        const num = this.numberAsString();
        if (this.unit === null)
            return num;
        else
            return num + "{" + this.unit.save(saveDestination, true) + "}";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        const num = StyledString.s(this.numberAsString());
        if (this.unit === null)
            return expressionStyler(num, this);
        else
            return expressionStyler(StyledString.concat(num, StyledString.s("{"), this.unit.toStyledString(), StyledString.s("}")), this);
    }

    private numberAsString(): string
    {
        return Utility.numberToString(this.value);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumericLiteral) || o.constructor !== this.constructor) return false;

        const that = o;

        if (this.unit === null ? that.unit !== null : !this.unit.equals(that.unit)) return false;
        return Utility.compareNumbers(this.value, that.value) === 0;
    }

    public override hashCode(): number
    {
        let result = javaHashCode(this.value);
        result = (Math.imul(31, result) + (this.unit !== null ? this.unit.hashCode() : 0)) | 0;
        return result;
    }

    public override editString(): string
    {
        return this.numberAsString();
    }

    public getUnitExpression(): UnitExpression | null
    {
        return this.unit;
    }

    public withUnit(unit: Unit): NumericLiteral
    {
        return new NumericLiteral(this.value, UnitExpression.load(unit));
    }

    public getNumber(): Decimal
    {
        return this.value;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litNumber(this, this.value, this.unit);
    }
}
