// Port of xyz.columnal.transformations.expression.ArrayExpression (expressions module).
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { ListEx, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * An array expression like [0, x, 3].  This could be called an array literal, but didn't want to confuse
 * as the items in the array don't have to be literals.  But this expression is for constructing
 * arrays of a known length from a fixed set of expressions (like [0, y] but not just "xs" which happens
 * to be of array type).
 */
export class ArrayExpression extends Expression
{
    private readonly items: readonly Expression[];
    private elementType: TypeExp | null = null;
    private _test_originalTypes: TypeExp[] | null = null;

    public constructor(items: readonly Expression[])
    {
        super();
        this.items = items;
    }

    public override check(dataLookup: Expression.ColumnLookup, state: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // Empty array - special case:
        if (this.items.length === 0)
            return onError.recordType(this, state, TypeExp.list(this, new MutVar(this)));
        const typeArray: TypeExp[] = new Array<TypeExp>(this.items.length);
        for (let i = 0; i < typeArray.length; i++)
        {
            const c = this.items[i]!.check(dataLookup, state, kind, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (c === null)
                return null;
            typeArray[i] = c.typeExp;
            state = c.typeState;
        }
        this.elementType = onError.recordError(this, TypeExp.unifyTypes([...typeArray]));
        this._test_originalTypes = typeArray;
        if (this.elementType === null)
            return null;
        return onError.recordType(this, state, TypeExp.list(this, this.elementType));
    }

    public override matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        const list = Utility.cast(value, ListEx);
        try
        {
            if (list.size() !== this.items.length)
                return this.result(DataTypeUtility.value(false), state); // Not an exception, just means the value has different size to the pattern, so can't match
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            throw new EvaluationException(e, this, Explanation.ExecutionType.MATCH, state, []);
        }

        let curState = state;
        const itemValues: Expression.ValueResult[] = [];
        for (let i = 0; i < this.items.length; i++)
        {
            let matchAgainst: Value;
            try
            {
                matchAgainst = list.get(i);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.MATCH, state, [...itemValues]);
            }
            const latest = this.matchSubExpressionAsPattern(this.items[i]!, matchAgainst, curState, itemValues);
            if (!Utility.cast(latest.value, Boolean))
                return this.explanation(DataTypeUtility.value(false), Explanation.ExecutionType.MATCH, state, [...itemValues], [], false);
            curState = latest.evaluateState;
        }
        return this.explanation(DataTypeUtility.value(true), Explanation.ExecutionType.MATCH, curState, [...itemValues], [], false);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        const valuesBuilder: Expression.ValueResult[] = [];
        for (const item of this.items)
        {
            this.fetchSubExpression(item, state, valuesBuilder);
        }
        const values = [...valuesBuilder];
        return this.result(DataTypeUtility.value(Utility.mapList(values, v => v.value)), state, values);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return "[" + this.items.map(e => e.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames)).join(", ") + "]";
    }

    public override toDisplay(displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(StyledString.s("["), StyledString.joining(this.items.map(e => e.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler)), ", "), StyledString.s("]")), this);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return this.items.flatMap((item, i) =>
            item._test_allMutationPoints().map(p => p.replaceSecond<(e: Expression) => Expression>(newExp => new ArrayExpression(Utility.replaceList(this.items, i, p.getSecond()(newExp))))));
    }

    public override _test_typeFailure(r: JavaRandom, newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        if (this.items.length <= 1)
            return null; // Can't cause a failure with 1 or less items; need 2+ to have a mismatch
        const index = r.nextInt(this.items.length);
        if (this.elementType === null || this._test_originalTypes === null)
            throw new InternalException("Calling _test_typeFailure despite type-check failure");
        // If all items other than this one are blank arrays, won't cause type error:
        let hasOtherNonBlank = false;
        for (let i = 0; i < this.items.length; i++)
        {
            if (i === index)
                continue;

            // We test if it is non-blank by unifying with an array type of MutVar, and seeing if the MutVat points to anything after pruning:
            const mut = new MutVar(null);
            const arrayOfMut = TypeExp.list(null, mut);

            const unifyResult = TypeExp.unifyTypes(this._test_originalTypes[i]!, arrayOfMut);
            // If it doesn't match, not an array:
            if (unifyResult.isLeft())
            {
                hasOtherNonBlank = true;
            }
            else
            {
                hasOtherNonBlank = !(mut.prune() instanceof MutVar);
            }
        }
        if (!hasOtherNonBlank)
            return null; // Won't make a failure
        return new ArrayExpression(Utility.replaceList(this.items, index, newExpressionOfDifferentType.getDifferentType(this.elementType)));
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ArrayExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return javaEquals(this.items, that.items);
    }

    public override hashCode(): number
    {
        return javaHashCode(this.items);
    }

    public getElements(): readonly Expression[]
    {
        return this.items;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new ArrayExpression(Utility.mapListI(this.items, e => e.replaceSubExpression(toReplace, replaceWith)));
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.list(this, this.items);
    }
}
