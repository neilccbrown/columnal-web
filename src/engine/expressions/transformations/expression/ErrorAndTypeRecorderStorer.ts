// Port of xyz.columnal.transformations.expression.ErrorAndTypeRecorderStorer (expressions module).
import type { TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../utility-error/styled/StyledString.js";
import { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { Expression } from "./Expressions.js";
import type { QuickFix } from "./QuickFix.js";

/**
 * An implementation of ErrorAndTypeRecorder which just stores the errors encountered
 * in a list.
 */
export class ErrorAndTypeRecorderStorer extends ErrorAndTypeRecorder
{
    private readonly errorMessages: StyledString[] = [];
    // Java: IdentityHashMap
    private readonly types = new Map<Expression, TypeExp>();

    protected override recordErrorMessage<E>(_src: E, error: StyledString): void
    {
        this.errorMessages.push(error);
    }

    public override recordInformation<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _error: Pair<StyledString, QuickFix<EXPRESSION> | null>): void
    {
    }

    public override recordQuickFixes<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _quickFixes: readonly QuickFix<EXPRESSION>[]): void
    {
        // Ignore them, just interested in errors
    }

    public getAllErrors(): StyledString[]
    {
        return [...this.errorMessages];
    }

    // If there are any errors, passes first to given action
    public withFirst(consumer: (s: StyledString) => void): void
    {
        if (this.errorMessages.length !== 0)
            consumer(this.errorMessages[0]!);
    }

    public override recordTypeNN(expression: Expression, typeExp: TypeExp): TypeExp
    {
        this.types.set(expression, typeExp);
        return typeExp;
    }
}
