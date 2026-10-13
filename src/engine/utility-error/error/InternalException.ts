// Port of xyz.columnal.error.InternalException (utility-error module).
import { StyledString } from "../styled/StyledString.js";
import { ExceptionWithStyle } from "./ExceptionWithStyle.js";

/**
 * Created by neil on 22/10/2016.
 */
export class InternalException extends ExceptionWithStyle
{
    // Java: InternalException(String), InternalException(String, Exception)
    constructor(message: string, cause?: unknown)
    {
        super(StyledString.s(message), cause);
    }
}
