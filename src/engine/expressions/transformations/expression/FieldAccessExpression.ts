// Port of xyz.columnal.transformations.expression.FieldAccessExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { ColumnId } from "../../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Record, Utility } from "../../../utility/utility/Utility.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { Explanation, type ReadonlySetLike } from "./explanation/Explanation.js";
import { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import { Expression, type IdentExpression, ImplicitLambdaArg, InvalidIdentExpression, InvalidOperatorExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorFlat } from "./visitor/ExpressionVisitorFlat.js";

// Not a BinaryOpExpression because the field name by itself does not have a valid type.
export class FieldAccessExpression extends Expression
{
    private readonly lhsRecord: Expression;
    private readonly fieldName: ExpressionIdentifier;

    public constructor(lhsRecord: Expression, fieldName: ExpressionIdentifier)
    {
        super();
        this.lhsRecord = lhsRecord;
        this.fieldName = fieldName;
    }

    public static fromBinary(lhs: Expression, rhs: Expression): Expression
    {
        return rhs.visit(new class extends ExpressionVisitorFlat<Expression>
        {
            protected override makeDef(rhs: Expression): Expression
            {
                return new InvalidOperatorExpression([lhs, new InvalidIdentExpression("#"), rhs]);
            }

            public override ident(_self: IdentExpression, _namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], _isVariable: boolean): Expression
            {
                return new FieldAccessExpression(lhs, idents[idents.length - 1]!);
            }
        }());
    }

    public override check(dataLookup: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const lambda = ImplicitLambdaArg.detectImplicitLambda(this, [this.lhsRecord], typeState, onError);
        typeState = lambda.getSecond();

        const lhsChecked = this.lhsRecord.check(dataLookup, typeState, Expression.ExpressionKind.EXPRESSION, locationInfo, onError);
        if (lhsChecked === null)
            return null;

        // (Java also checks for a null fieldName here, which cannot happen.)

        const fieldType = onError.recordTypeNN(this, new MutVar(this));
        const recordType = TypeExp.record(this, new Map([[this.fieldName, fieldType]]), false);

        if (onError.recordError(this, TypeExp.unifyTypes(recordType, lhsChecked.typeExp)) === null)
            return null;

        return new Expression.CheckedExp(fieldType, typeState).applyToType(lambda.getFirst());
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const subResults: Expression.ValueResult[] = [];
        const lhsResult = this.fetchSubExpression(this.lhsRecord, state, subResults);
        const record = Utility.cast(lhsResult.value, Record);

        const result = record.getField(this.fieldName);
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends Expression.ValueResult
        {
            public override makeExplanation(overrideExecutionType: Explanation.ExecutionType | null): Explanation
            {
                const value = this.value;
                const evaluateState = this.evaluateState;
                const lhsExplanation = lhsResult.makeExplanation(overrideExecutionType);
                const lhsIsLoc = lhsExplanation.getResultIsLocation();
                let directLocs: readonly ExplanationLocation[];
                let usIsLoc: ExplanationLocation | null;
                if (lhsIsLoc !== null && lhsIsLoc.columnId === null)
                {
                    // If it's a table...
                    usIsLoc = new ExplanationLocation(lhsIsLoc.tableId, new ColumnId(outer.fieldName), lhsIsLoc.rowIndex);
                    directLocs = [usIsLoc];
                }
                else
                {
                    usIsLoc = null;
                    directLocs = [];
                }

                return new class extends Explanation
                {
                    public override describe(_alreadyDescribed: ReadonlySetLike<Explanation>, hyperlinkLocation: (location: ExplanationLocation) => StyledString, expressionStyler: Expression.ExpressionStyler, extraLocations: readonly ExplanationLocation[], skipIfTrivial: boolean): StyledString | null
                    {
                        return outer.describe(value, this.executionType, evaluateState, hyperlinkLocation, expressionStyler, Utility.concatI(directLocs, extraLocations), skipIfTrivial);
                    }

                    public override getDirectSubExplanations(): readonly Explanation[]
                    {
                        return [lhsExplanation];
                    }

                    public override excludeChildrenIfTrivial(): boolean
                    {
                        return true;
                    }
                }(outer, overrideExecutionType !== null ? overrideExecutionType : Explanation.ExecutionType.VALUE, state, result, directLocs, usIsLoc);
            }
        }(result, state);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.field(this, this.lhsRecord, this.fieldName);
    }

    public override save(saveDestination: Expression.SaveDestination, surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        const content = this.lhsRecord.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames) + "#" + this.fieldName;
        if (surround === BracketedStatus.NEED_BRACKETS)
            return "(" + content + ")";
        else
            return content;
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
        if (!(o instanceof FieldAccessExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.lhsRecord.equals(that.lhsRecord) &&
            this.fieldName === that.fieldName;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.lhsRecord, this.fieldName);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(this.lhsRecord.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler), StyledString.s("#" + this.fieldName)),this);
    }

    public override hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        return this.lhsRecord.visit(new class extends ExpressionVisitorFlat<boolean>
        {
            protected override makeDef(_expression: Expression): boolean
            {
                return false;
            }

            public override ident(_self: IdentExpression, namespace: ExpressionIdentifier | null, _idents: readonly ExpressionIdentifier[], _isVariable: boolean): boolean
            {
                return namespace === "table";
            }
        }());
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new FieldAccessExpression(this.lhsRecord.replaceSubExpression(toReplace, replaceWith), this.fieldName);
    }
}
