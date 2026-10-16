// Port of xyz.columnal.transformations.expression.TemporalLiteral (expressions module).
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import { javaTrim } from "../../../java/JavaString.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Expression, Literal } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

export class TemporalLiteral extends Literal
{
    private readonly content: string;
    // The parsed version of content, if it parsed successfully, otherwise an error
    private readonly value: Either<StyledString, TemporalAccessor>;
    private readonly literalType: DateTimeInfo.DateTimeType;

    public constructor(literalType: DateTimeInfo.DateTimeType, content: string)
    {
        super();
        this.content = javaTrim(content);
        this.literalType = literalType;
        const stringView = new DataTypeUtility.StringView(content);
        let v: Either<StyledString, TemporalAccessor>;
        try
        {
            v = Either.right(DataTypeUtility.parseTemporalFlexible(new DateTimeInfo(literalType), stringView));
            stringView.skipSpaces();
            if (stringView.getPosition() !== content.length)
                v = Either.left(StyledString.s("Unrecognised content: " + stringView.snippet()));
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            v = Either.left(e.getStyledMessage());
        }
        this.value = v;
    }

    public override editString(): string
    {
        return this.content;
    }


    protected override checkType(_typeState: TypeState, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): TypeExp | null
    {
        if (this.value.isLeft())
        {
            onError.recordError(this, StyledString.concat(Expression.styledExpressionInput(this.content), StyledString.s(" not recognised as "), DataType.date(new DateTimeInfo(this.literalType)).toStyledString()));
            return null;
        }

        return TypeExp.fromDataType(this, DataType.date(new DateTimeInfo(this.literalType)));
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        return this.result(this.value.eitherInt<TemporalAccessor>(err => {
            throw new InternalException("Executing with unrecognised date/time literal: " + this.content + " " + err.toString());
        }, v => v), state);
    }

    public override save(_saveDestination: Expression.SaveDestination, _surround: BracketedStatus, _renames: TableAndColumnRenames): string
    {
        let prefix: string;
        const DateTimeType = DateTimeInfo.DateTimeType;
        switch (this.literalType)
        {
            case DateTimeType.YEARMONTHDAY:
                prefix = "date";
                break;
            case DateTimeType.YEARMONTH:
                prefix = "dateym";
                break;
            case DateTimeType.TIMEOFDAY:
                prefix = "time";
                break;
            case DateTimeType.DATETIME:
                prefix = "datetime";
                break;
            case DateTimeType.DATETIMEZONED:
                prefix = "datetimezoned";
                break;
            default:
                prefix = "date";
                break;
        }

        return prefix + "{" + this.content + "}";
    }

    public override toDisplay(_displayType: Expression.DisplayType, bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s(this.save(Expression.SaveDestination.TO_STRING, bracketedStatus, new TableAndColumnRenames(new Map()))), this);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TemporalLiteral) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.content === that.content &&
                javaEquals(this.value, that.value) &&
                this.literalType === that.literalType;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.content, this.value, this.literalType);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litTemporal(this, this.literalType, this.content, this.value);
    }
}
