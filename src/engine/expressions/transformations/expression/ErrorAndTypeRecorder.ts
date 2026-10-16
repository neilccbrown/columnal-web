// Port of xyz.columnal.transformations.expression.ErrorAndTypeRecorder (expressions module).
//
// PORT-NOTE: Java's interface with default methods becomes an abstract class.  Java overloads
// recordError for an error message (abstract) and for an error-or-type (a default method); here
// recordError dispatches on its argument, and implementations override recordErrorMessage, which
// is Java's abstract recordError(EXPRESSION, StyledString).
import type { DataType } from "../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { TypeConcretisationError } from "../../../types/typeExp/TypeConcretisationError.js";
import type { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Expression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import type { QuickFix } from "./QuickFix.js";
import type { TypeState } from "./TypeState.js";

/**
 * A listener that records where errors have occurred when checking an expression.
 *
 * Note: it is valid to record an error and/or quick fixes multiple times
 * for the same expression.  In this case, the error and list of quick fixes
 * should be concatenated to form the final outcome.
 */
export abstract class ErrorAndTypeRecorder
{
    /**
     * Checks the given error-or-type.  If error, that error is recorded
     * (with no available quick fixes) and null is returned.
     * If type, it is returned directly.
     * @param src
     * @param errorOrType
     * @return
     */
    public recordError(src: Expression, errorOrType: Either<TypeExp.TypeError | null, TypeExp>): TypeExp | null;
    /**
     * Records an error source and error message.
     */
    public recordError<EXPRESSION>(src: EXPRESSION, error: StyledString): void;
    public recordError(src: unknown, errorOrType: StyledString | Either<TypeExp.TypeError | null, TypeExp>): TypeExp | null | void
    {
        if (!(errorOrType instanceof Either))
        {
            this.recordErrorMessage(src, errorOrType);
            return;
        }
        return errorOrType.either<TypeExp | null>(err => {
            if (err !== null)
            {
                this.recordErrorMessage(src, err.getMessage());
            }
            return null;
        }, val => val);
    }

    /**
     * Records an error source and error message
     */
    public recordLeftError<T>(typeManager: TypeManager, functionLookup: FunctionLookup, src: Expression, errorOrVal: Either<TypeConcretisationError, T>): T | null
    {
        return errorOrVal.either<T | null>(err => {
            const fix: DataType | null = err.getSuggestedTypeFix();
            this.recordErrorMessage(src, err.getErrorText());
            this.recordQuickFixes(src, ExpressionUtil.quickFixesForTypeError(typeManager, functionLookup, src, fix));
            return null;
        }, val => val);
    }

    /**
     * Records the type for a particular expression.
     */
    public recordType(expression: Expression, typeExp: TypeExp): TypeExp;
    public recordType(expression: Expression, typeExp: TypeExp | null): TypeExp | null;
    public recordType(expression: Expression, typeState: TypeState, typeExp: TypeExp | null): Expression.CheckedExp | null;
    public recordType(expression: Expression, ...args: unknown[]): TypeExp | Expression.CheckedExp | null
    {
        if (args.length === 2)
        {
            const typeState = args[0] as TypeState;
            const typeExp = args[1] as TypeExp | null;
            if (typeExp !== null)
                return new Expression.CheckedExp(this.recordTypeNN(expression, typeExp), typeState);
            else
                return null;
        }
        const typeExp = args[0] as TypeExp | null;
        if (typeExp === null)
            return null;
        else
            return this.recordTypeNN(expression, typeExp);
    }

    /**
     * A curried version of the two-arg function of the same name.
     */
    public recordErrorCurried(src: Expression): (errMsg: StyledString) => void
    {
        return errMsg => this.recordErrorMessage(src, errMsg);
    }

    /**
     * Records an error source and error message.  (Java: the abstract recordError(EXPRESSION, StyledString).)
     */
    protected abstract recordErrorMessage<EXPRESSION>(src: EXPRESSION, error: StyledString): void;

    /**
     * Records an source and information message.
     */
    public abstract recordInformation<EXPRESSION extends StyledShowable>(src: EXPRESSION, informaton: Pair<StyledString, QuickFix<EXPRESSION> | null>): void;

    public abstract recordQuickFixes<EXPRESSION extends StyledShowable>(src: EXPRESSION, fixes: readonly QuickFix<EXPRESSION>[]): void;

    // Java: recordTypeAndError(Expression, Either, TypeState) and recordTypeAndError(Expression typeExpression, Expression errorExpression, Either, TypeState)
    public recordTypeAndError(expression: Expression, typeOrError: Either<TypeExp.TypeError | null, TypeExp>, typeState: TypeState): Expression.CheckedExp | null;
    public recordTypeAndError(typeExpression: Expression, errorExpression: Expression, typeOrError: Either<TypeExp.TypeError | null, TypeExp>, typeState: TypeState): Expression.CheckedExp | null;
    public recordTypeAndError(typeExpression: Expression, ...args: unknown[]): Expression.CheckedExp | null
    {
        if (args.length === 2)
            return this.recordTypeAndError(typeExpression, typeExpression, args[0] as Either<TypeExp.TypeError | null, TypeExp>, args[1] as TypeState);
        const errorExpression = args[0] as Expression;
        const typeOrError = args[1] as Either<TypeExp.TypeError | null, TypeExp>;
        const typeState = args[2] as TypeState;
        const typeExp = this.recordType(typeExpression, this.recordError(errorExpression, typeOrError));
        if (typeExp === null)
            return null;
        else
            return new Expression.CheckedExp(typeExp, typeState);
    }

    public abstract recordTypeNN(expression: Expression, typeExp: TypeExp): TypeExp;
}
