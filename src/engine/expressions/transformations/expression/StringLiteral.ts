// Port of xyz.columnal.transformations.expression.StringLiteral (expressions module).
import { javaStringHashCode } from "../../../java/JavaObject.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { CommonStyles } from "../../../utility-error/styled/CommonStyles.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { type Expression, Literal } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * Created by neil on 25/11/2016.
 */
export class StringLiteral extends Literal
{
    // The actual String value, without any remaining escapes.
    private readonly value: string;
    private readonly rawUnprocessed: string;

    public constructor(rawUnprocessed: string)
    {
        super();
        this.rawUnprocessed = rawUnprocessed;
        this.value = DataTypeUtility.value(GrammarUtility.processEscapes(rawUnprocessed, false));
    }

    protected override checkType(_typeState: TypeState, _locationInfo: Expression.LocationInfo, _onError: ErrorAndTypeRecorder): TypeExp | null
    {
        return TypeExp.text(this);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        return this.result(this.value, state);
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        return "\"" + this.rawUnprocessed + "\"";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s("\"" + this.rawUnprocessed + "\"").withStyle(CommonStyles.MONOSPACE), this);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof StringLiteral) || o.constructor !== this.constructor) return false;

        const that = o;

        return this.rawUnprocessed === that.rawUnprocessed;
    }

    public override hashCode(): number
    {
        return javaStringHashCode(this.rawUnprocessed);
    }

    // Escapes the characters ready for editing.
    public override editString(): string
    {
        return this.rawUnprocessed;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litText(this, this.rawUnprocessed);
    }
}
