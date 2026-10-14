// Port of xyz.columnal.typeExp.TypeConcretisationError (types module).
import type { StyledString } from "../../utility-error/styled/StyledString.js";
import type { DataType } from "../data/datatype/DataType.js";

/**
 * Basically a wrapper for a String error, with a flag recording whether fixing the type
 * manually is a possible solution, and a suggested type in this case.
 */
export class TypeConcretisationError
{
    private readonly errorText: StyledString;
    private readonly couldBeFixedByManuallySpecifyingType: boolean;
    // If non-null, a suggested type for the fix:
    private readonly suggestedTypeFix: DataType | null;

    // Java has (StyledString) and (StyledString, @Nullable DataType) constructors; passing
    // the second argument (even null) records that fixing the type manually could help.
    public constructor(errorText: StyledString, suggestedTypeFix?: DataType | null)
    {
        this.errorText = errorText;
        this.couldBeFixedByManuallySpecifyingType = suggestedTypeFix !== undefined;
        this.suggestedTypeFix = suggestedTypeFix ?? null;
    }

    public getErrorText(): StyledString
    {
        return this.errorText;
    }

    public getSuggestedTypeFix(): DataType | null
    {
        return this.suggestedTypeFix;
    }

    // For debugging:
    public toString(): string
    {
        return this.errorText.toPlain();
    }
}
