// Port of xyz.columnal.transformations.expression.RecordExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { HashMap } from "../../../java/HashMap.js";
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Record, RecordMap, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

export class RecordExpression extends Expression
{
    // Has to be list of pairs to maintain the same order:
    // Also, duplicates are a type error not a syntax error, so duplicates are possible here.
    private readonly members: readonly Pair<ExpressionIdentifier, Expression>[];

    public constructor(members: readonly Pair<ExpressionIdentifier, Expression>[])
    {
        super();
        this.members = members;
    }

    public override check(dataLookup: Expression.ColumnLookup, typeState: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // PORT-NOTE: Java's HashMap order becomes the record type's field order, so it is kept.
        const fieldTypes = HashMap.javaOrder<ExpressionIdentifier, TypeExp>();
        for (const member of this.members)
        {
            const checkedExp = member.getSecond().check(dataLookup, typeState, kind, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (checkedExp === null)
                return null;
            const hadField = fieldTypes.has(member.getFirst());
            fieldTypes.set(member.getFirst(), checkedExp.typeExp);
            if (hadField)
            {
                onError.recordError(this, StyledString.s("Duplicated field: \"" + member.getFirst() + "\""));
                return null;
            }
            typeState = checkedExp.typeState;
        }

        // Only complete if it's an expression; if it's a pattern then it's ok for fields to exist that we're not matching:
        const checkedExp = new Expression.CheckedExp(onError.recordTypeNN(this, TypeExp.record(this, fieldTypes, kind === Expression.ExpressionKind.EXPRESSION)), typeState);
        if (kind === Expression.ExpressionKind.PATTERN)
            checkedExp.requireEquatable();
        return checkedExp;
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const valuesBuilder: Expression.ValueResult[] = [];
        // If it typechecked, assume no duplicate fields
        // PORT-NOTE: Java's HashMap order becomes the record's field order, so it is kept.
        const fieldValues = HashMap.javaOrder<ExpressionIdentifier, Value>();

        for (const member of this.members)
        {
            fieldValues.set(member.getFirst(), this.fetchSubExpression(member.getSecond(), state, valuesBuilder).value);
        }

        return this.explanation(DataTypeUtility.value(new RecordMap(fieldValues)), Explanation.ExecutionType.VALUE, state, [...valuesBuilder], [], true);
    }

    public override matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        const record = Utility.cast(value, Record);
        const itemValues: Expression.ValueResult[] = [];

        for (const member of this.members)
        {
            const fieldValue = record.getField(member.getFirst());
            const result = this.matchSubExpressionAsPattern(member.getSecond(), fieldValue, state, itemValues);
            if (!Utility.cast(result.value, Boolean))
                return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, state, [...itemValues], [], false);
            state = result.evaluateState;
        }

        return this.explanation(DataTypeUtility.value(true), Explanation.ExecutionType.MATCH, state, [...itemValues], [], true);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.record(this, this.members);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof RecordExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.members, that.members);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.members);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
         return expressionStyler(StyledString.roundBracket(StyledString.joining(this.members.map(s => StyledString.concat(StyledString.s(s.getFirst() + ": "), s.getSecond().toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler))), ", ")), this);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return "(" + this.members.map(m => m.getFirst() + ": " + m.getSecond().save(saveDestination, BracketedStatus.NEED_BRACKETS, renames)).join(", ") + ")";
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new RecordExpression(Utility.mapListI(this.members, p => p.mapSecond(e => e.replaceSubExpression(toReplace, replaceWith))));
    }
}
