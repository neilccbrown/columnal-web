// Port of xyz.columnal.transformations.expression.DefineExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { HashSet } from "../../../java/HashMap.js";
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { BracketedStatus } from "./BracketedStatus.js";
import { CanonicalSpan } from "./CanonicalSpan.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { Expression, type HasTypeExpression } from "./Expressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

export class DefineExpression extends Expression
{
    private readonly defineLocation: CanonicalSpan;
    // List will not be empty for a valid define:
    private readonly defines: readonly DefineExpression.DefineItem[];
    private readonly body: Expression;
    private readonly endLocation: CanonicalSpan;

    public constructor(defineLocation: CanonicalSpan, defines: readonly DefineExpression.DefineItem[],
                            body: Expression,
                            endLocation: CanonicalSpan)
    {
        super();
        this.defineLocation = defineLocation;
        this.defines = defines;
        this.body = body;
        this.endLocation = endLocation;
    }

    public static unrecorded(defines: readonly Either<HasTypeExpression, DefineExpression.Definition>[], body: Expression): DefineExpression
    {
        const dummy = new CanonicalSpan(0, 0);
        return new DefineExpression(dummy, Utility.mapListI(defines, d => new DefineExpression.DefineItem(d, dummy)), body, dummy);
    }

    public override check(dataLookup: Expression.ColumnLookup, original: TypeState, _kind: Expression.ExpressionKind, locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        let typeState = original;

        // PORT-NOTE: a Java HashSet, whose order shows in an error message, so it is kept.
        const shouldBeDeclaredInNextDefine = HashSet.javaOrder<string>();

        for (const defineItem of this.defines)
        {
            const typeStateThisTime = typeState;
            const define = defineItem.typeOrDefinition;
            const checkEq: Expression.CheckedExp | null = define.eitherEx<Expression.CheckedExp | null>(hasType => {
                const checkedExp = hasType.check(dataLookup, typeStateThisTime, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
                if (checkedExp === null)
                    return null;
                const varName = hasType.getVarName();
                if (!shouldBeDeclaredInNextDefine.add(varName))
                {
                    onError.recordError(hasType, StyledString.s("Duplicate type for variable " + varName));
                    return null;
                }
                return checkedExp;
            }, equal => {
                // We observe the declared variables by differencing TypeState before and after:
                const checkedExp = equal.check(dataLookup, typeStateThisTime, onError);
                if (checkedExp !== null)
                {
                    // Java: Sets.difference, which iterates in the order of its first set
                    const before = typeStateThisTime.getAvailableVariables();
                    const declared = new Set([...checkedExp.typeState.getAvailableVariables()].filter(v => !before.has(v)));
                    const typedButNotDeclared = [...shouldBeDeclaredInNextDefine].filter(v => !declared.has(v));
                    if (typedButNotDeclared.length !== 0)
                    {
                        onError.recordError(equal.lhsPattern, StyledString.s("Type was given above for " + typedButNotDeclared.join(", ") + " but variable(s) were not declared"));
                        return null;
                    }
                    if (declared.size === 0)
                    {
                        onError.recordError(equal.lhsPattern, StyledString.s("No new variables were declared"));
                        return null;
                    }
                }
                shouldBeDeclaredInNextDefine.clear();
                return checkedExp;
            });
            if (checkEq === null)
                return null;
            typeState = checkEq.typeState;
        }

        if (shouldBeDeclaredInNextDefine.size !== 0)
        {
            onError.recordError(this.defines[this.defines.length - 1]!.typeOrDefinition.either<Expression>(x => x, x => x.lhsPattern), StyledString.s("Type was given for " + [...shouldBeDeclaredInNextDefine].join(", ") + " but variable(s) were not declared"));
            return null;
        }

        const checkedBody = this.body.check(dataLookup, typeState, Expression.ExpressionKind.EXPRESSION, locationInfo, onError);
        if (checkedBody === null)
            return null;
        else
            return new Expression.CheckedExp(checkedBody.typeExp, original);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        for (const define of Either.getRights(Utility.mapListI(this.defines, d => d.typeOrDefinition)))
        {
            let outcome: EvaluateState | null;
            try
            {
                outcome = define.evaluate(state);
                if (outcome === null)
                {
                    throw new UserException(StyledString.concat(StyledString.s("Pattern did not match: "), define.lhsPattern.toStyledString()));
                }
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, []);
            }
            state = outcome;
        }
        return this.fetchSubExpression(this.body, state, []);
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.define(this, this.defines, this.body);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        let b = "";
        b += "@define ";
        for (let i = 0; i < this.defines.length; i++)
        {
            if (i > 0)
                b += ", ";
            const latest = saveDestination;
            saveDestination = this.defines[i]!.typeOrDefinition.either<Expression.SaveDestination>(x => {
                b += x.save(latest, BracketedStatus.DONT_NEED_BRACKETS, renames);
                return latest;
            }, x => {
                b += x.save(latest, renames);
                const patternVars = new Set(x.lhsPattern.allVariableReferences());
                const definedVars = new Set(latest.definedNames("var").map(v => v[0]!));
                return latest.withNames([...patternVars].filter(v => !definedVars.has(v)).flatMap(v => Utility.streamNullable(IdentifierUtility.asExpressionIdentifier(v))).map(v => new Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>("var", [v])));
            });
        }
        b += " @then ";
        b += this.body.save(saveDestination, BracketedStatus.DONT_NEED_BRACKETS, renames);
        b += " @enddefine";
        return b;
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
        if (!(o instanceof DefineExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.defines, that.defines) &&
                this.body.equals(that.body);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.defines, this.body);
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(
            StyledString.s("@define "),
            StyledString.joining(this.defines.map(e => e.typeOrDefinition.either(x => x.toDisplay(displayType, BracketedStatus.DONT_NEED_BRACKETS, expressionStyler), x => x.toDisplay(displayType, expressionStyler))), ", "),
            StyledString.s(" @then "),
            this.body.toStyledString(),
            StyledString.s(" @enddefine"),
        ), this);
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return DefineExpression.unrecorded(Utility.mapListI(this.defines, e => e.typeOrDefinition.mapBoth(x => x.replaceSubExpression(toReplace, replaceWith) as HasTypeExpression, x => x.replaceSubExpression(toReplace, replaceWith))), this.body.replaceSubExpression(toReplace, replaceWith));
    }

    public getEndLocation(): CanonicalSpan
    {
        return this.endLocation;
    }

    public _getDefineLocation(): CanonicalSpan
    {
        return this.defineLocation;
    }
}

export namespace DefineExpression
{
    export class Definition
    {
        public readonly lhsPattern: Expression;
        public readonly rhsValue: Expression;

        public constructor(lhsPattern: Expression, rhsValue: Expression)
        {
            this.lhsPattern = lhsPattern;
            this.rhsValue = rhsValue;
        }

        public check(dataLookup: Expression.ColumnLookup, typeState: TypeState, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
        {
            const rhs = this.rhsValue.check(dataLookup, typeState, Expression.ExpressionKind.EXPRESSION, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (rhs === null)
                return null;
            const lhs = this.lhsPattern.check(dataLookup, typeState, Expression.ExpressionKind.PATTERN, Expression.LocationInfo.UNIT_DEFAULT, onError);
            if (lhs === null)
                return null;

            // Need to unify:
            return onError.recordTypeAndError(this.lhsPattern, TypeExp.unifyTypes(lhs.typeExp, rhs.typeExp), lhs.typeState);
        }

        public evaluate(state: EvaluateState): EvaluateState | null
        {
            let valueResult = this.rhsValue.calculateValue(state);
            valueResult = this.lhsPattern.matchAsPattern(valueResult.value, valueResult.evaluateState);
            if (Utility.cast(valueResult.value, Boolean))
                return valueResult.evaluateState;
            else
                return null;
        }

        public save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
        {
            return this.lhsPattern.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames) + " = " + this.rhsValue.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames);
        }

        public replaceSubExpression(toReplace: Expression, replaceWith: Expression): Definition
        {
            return new Definition(this.lhsPattern.replaceSubExpression(toReplace, replaceWith), this.rhsValue.replaceSubExpression(toReplace, replaceWith));
        }

        public toDisplay(displayType: Expression.DisplayType, expressionStyler: Expression.ExpressionStyler): StyledString
        {
            return StyledString.concat(
                this.lhsPattern.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler),
                StyledString.s(" = "),
                this.rhsValue.toDisplay(displayType, BracketedStatus.NEED_BRACKETS, expressionStyler),
            );
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Definition) || o.constructor !== this.constructor) return false;
            const that = o;
            return this.lhsPattern.equals(that.lhsPattern) &&
                    this.rhsValue.equals(that.rhsValue);
        }

        public hashCode(): number
        {
            return javaObjectsHash(this.lhsPattern, this.rhsValue);
        }
    }

    export class DefineItem
    {
        public readonly typeOrDefinition: Either<HasTypeExpression, Definition>;
        public readonly trailingCommaOrThenLocation: CanonicalSpan;

        public constructor(typeOrDefinition: Either<HasTypeExpression, Definition>, trailingCommaOrThenLocation: CanonicalSpan)
        {
            this.typeOrDefinition = typeOrDefinition;
            this.trailingCommaOrThenLocation = trailingCommaOrThenLocation;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof DefineItem) || o.constructor !== this.constructor) return false;
            const that = o;
            return this.typeOrDefinition.equals(that.typeOrDefinition);
        }

        public hashCode(): number
        {
            return javaObjectsHash(this.typeOrDefinition);
        }
    }
}
