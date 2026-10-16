// Port of xyz.columnal.transformations.expression.BooleanLiteral (expressions module).
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, Literal } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 27/11/2016.
 */
export class BooleanLiteral extends Literal
{
    private readonly value: boolean;

    public constructor(value: boolean)
    {
        super();
        this.value = DataTypeUtility.value(value);
    }

    protected override checkType(_typeState: TypeState, _locationInfo: Expression.LocationInfo, _onError: ErrorAndTypeRecorder): TypeExp | null
    {
        return TypeExp.bool(this);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        return this.result(this.value, state);
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return String(this.value);
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s(String(this.value)), this);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof BooleanLiteral) || o.constructor !== this.constructor) return false;

        const that = o;

        return this.value === that.value;
    }

    public override hashCode(): number
    {
        return (this.value ? 1 : 0);
    }

    public override editString(): string
    {
        return String(this.value);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litBoolean(this, this.value);
    }
}
